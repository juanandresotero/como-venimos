import { test } from "node:test";
import assert from "node:assert/strict";
import { recortar, ANCHO_GUARDADO } from "../lib/firma-foto.js";

/* Arma pixeles RGBA como los que devuelve un canvas. */
function foto(ancho, alto, pintar) {
  const data = new Uint8ClampedArray(ancho * alto * 4);
  for (let y = 0; y < alto; y++) {
    for (let x = 0; x < ancho; x++) {
      const [r, g, b] = pintar(x, y);
      const i = (y * ancho + x) * 4;
      data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255;
    }
  }
  return { data, width: ancho, height: alto };
}

const GRIS = [150, 152, 158];   // fondo: B - R = 8, como en la foto real
const AZUL = [70, 90, 164];     // tinta:  B - R = 94, como en la foto real

/* La sombra despareja de una foto de celular: el brillo cambia, el color no. */
const conSombra = (c, x, ancho) =>
  c.map((v) => Math.max(0, Math.min(255, v - 60 + (120 * x) / ancho)));

const trazoGordo = (x, y) => x >= 40 && x < 160 && y >= 30 && y < 70;

test("separa la tinta azul del fondo gris aunque la luz sea despareja", () => {
  const r = recortar(foto(200, 100, (x, y) => conSombra(trazoGordo(x, y) ? AZUL : GRIS, x, 200)));
  assert.ok(r, "tiene que encontrar tinta");
  assert.equal(r.clase, "mascara");
  assert.equal(r.porBrillo, false, "la separacion por color alcanzo");
});

test("recorta al rectangulo de la firma y tira el fondo", () => {
  const r = recortar(foto(200, 100, (x, y) => (trazoGordo(x, y) ? AZUL : GRIS)));
  assert.equal(r.ancho, ANCHO_GUARDADO);
  assert.equal(r.alto, Math.round((ANCHO_GUARDADO * 40) / 120), "conserva la proporcion");
});

/* Una mota de polvo en la mesa agranda el recorte y deja la firma chiquita en un rincon. */
test("una motita suelta no agranda el recorte", () => {
  const trazo = (x, y) => x >= 80 && x < 120 && y >= 40 && y < 60;
  const mota = (x, y) => x >= 3 && x < 6 && y >= 3 && y < 6;   // 9 pixeles
  const sinMota = recortar(foto(200, 100, (x, y) => (trazo(x, y) ? AZUL : GRIS)));
  const conMota = recortar(foto(200, 100, (x, y) => (trazo(x, y) || mota(x, y) ? AZUL : GRIS)));
  assert.equal(conMota.alto, sinMota.alto, "la mota no tiene que cambiar la proporcion");
});

test("sin tinta devuelve null en vez de inventar una firma", () => {
  assert.equal(recortar(foto(50, 50, () => GRIS)), null);
});

test("los bits alcanzan justo para la mascara, uno por pixel", () => {
  const r = recortar(foto(200, 100, (x, y) => (trazoGordo(x, y) ? AZUL : GRIS)));
  assert.equal(r.bits.length, Math.ceil(r.ancho / 8) * r.alto);
});

/* Los trazos finos son de un pixel: un promedio los borraria al achicar. */
test("un trazo de un pixel de ancho sobrevive al achique", () => {
  const linea = (x, y) => x >= 10 && x < 590 && y === 50;
  const r = recortar(foto(600, 100, (x, y) => (linea(x, y) ? AZUL : GRIS)));
  const encendidos = [...r.bits].reduce((n, b) => n + b.toString(2).replace(/0/g, "").length, 0);
  assert.ok(encendidos >= r.ancho - 2, `quedaron ${encendidos} de ${r.ancho} pixeles`);
});

/* Este test PEDIA EL COMPORTAMIENTO ROTO y se cambio a proposito.

   Antes se buscaba especificamente tinta AZUL, y con cualquier otro color se caia a un
   metodo peor y se le avisaba al usuario que revisara. Juan pidio que anduviera con
   cualquier color. Ahora el umbral es local —cada pixel contra su vecindario— y la lapicera
   negra sale igual de bien que la azul: ya no hay nada que avisar. */
test("con lapicera negra sale bien, sin avisos", () => {
  const NEGRO = [40, 40, 44];
  const r = recortar(foto(200, 100, (x, y) => (trazoGordo(x, y) ? NEGRO : GRIS)));
  assert.ok(r, "tiene que poder recortarla");
  assert.equal(r.porBrillo, false, "ya no es un caso de segunda");
});

test("con lapicera roja tambien, que antes ni figuraba", () => {
  const ROJO = [168, 44, 40];
  const r = recortar(foto(200, 100, (x, y) => (trazoGordo(x, y) ? ROJO : GRIS)));
  assert.ok(r, "tiene que poder recortarla");
  assert.equal(r.porBrillo, false);
});

/* El caso que de verdad importa: papel fotografiado con el celular. Un lado bien iluminado
   y el otro en sombra, con tinta NEGRA. Con un umbral unico para toda la imagen, el lado
   claro pierde el trazo y el oscuro trae fondo. */
test("tinta negra con media hoja en sombra: no se pierde el trazo ni entra el fondo", () => {
  const NEGRO = [40, 40, 44];
  const r = recortar(foto(240, 120, (x, y) =>
    conSombra(trazoGordo(x, y) ? NEGRO : GRIS, x, 240)));
  assert.ok(r, "tiene que encontrar la firma");
  assert.equal(r.porBrillo, false);

  /* El trazo va de x=40 a 160 sobre 240 de ancho: el recorte tiene que dar esa proporcion.
     Si se hubiera colado el fondo del lado oscuro, el recorte seria mucho mas ancho. */
  assert.equal(r.alto, Math.round((r.ancho * 40) / 120), "recorto justo el trazo");
});

/* La red de seguridad. Una superficie con textura pareja —una mesa de madera, una pared—
   no tiene firma, pero medio pixel de cada dos es mas oscuro que su vecino. Ahi el recorte
   sale un enchastre y hay que decirle que lo mire antes de guardarlo. */
test("si media foto queda marcada como tinta, avisa que es dudosa", () => {
  const r = recortar(foto(200, 100, (x) => (Math.floor(x / 8) % 2 ? [90, 88, 92] : [150, 148, 152])));
  assert.ok(r, "igual devuelve algo");
  assert.equal(r.porBrillo, true, "pero marcado como dudoso");
});

/* Un PNG ya recortado con fondo transparente: la tinta es lo que no es transparente.
   Sin esto, la separacion por azul falla (tinta negra) y la de brillo lee el fondo
   transparente como si fuera negro y devuelve un manchon. */
function pngTransparente(ancho, alto, hayTinta) {
  const data = new Uint8ClampedArray(ancho * alto * 4);
  for (let y = 0; y < alto; y++) {
    for (let x = 0; x < ancho; x++) {
      const i = (y * ancho + x) * 4;
      const tinta = hayTinta(x, y);
      data[i] = 20; data[i + 1] = 20; data[i + 2] = 20;
      data[i + 3] = tinta ? 255 : 0;
    }
  }
  return { data, width: ancho, height: alto };
}

test("un PNG con fondo transparente se recorta por la transparencia", () => {
  const trazo = (x, y) => x >= 40 && x < 160 && y >= 30 && y < 70;
  const r = recortar(pngTransparente(200, 100, trazo));
  assert.ok(r, "tiene que encontrar la firma");
  assert.equal(r.porBrillo, false, "no cayo al metodo de respaldo");
  assert.equal(r.alto, Math.round((ANCHO_GUARDADO * 40) / 120), "recorto al trazo, no a la hoja");
});

test("un PNG transparente con tinta NEGRA tambien sale bien", () => {
  const trazo = (x, y) => Math.abs(y - 50) < 3 && x > 20 && x < 180;
  const r = recortar(pngTransparente(200, 100, trazo));
  assert.ok(r);
  assert.equal(r.porBrillo, false, "la transparencia manda sobre el color de la tinta");
});

/* Una FOTO no tiene transparencia: no puede caer por error en el camino nuevo. */
test("una foto opaca sigue yendo por el camino del color", () => {
  const ancho = 200, alto = 100;
  const data = new Uint8ClampedArray(ancho * alto * 4);
  for (let y = 0; y < alto; y++) {
    for (let x = 0; x < ancho; x++) {
      const i = (y * ancho + x) * 4;
      const tinta = x >= 40 && x < 160 && y >= 30 && y < 70;
      data[i] = tinta ? 70 : 150;
      data[i + 1] = tinta ? 90 : 152;
      data[i + 2] = tinta ? 164 : 158;
      data[i + 3] = 255;
    }
  }
  const r = recortar({ data, width: ancho, height: alto });
  assert.ok(r);
  assert.equal(r.porBrillo, false);
});

test("un PNG transparente y VACIO devuelve null, no un manchon", () => {
  assert.equal(recortar(pngTransparente(80, 80, () => false)), null);
});

/* EL MARCO NEGRO. Al girar la foto quedan esquinas fuera del rectangulo. Pintarlas de
   blanco hacia un escalon de brillo contra la foto, y el umbral local lee todo escalon como
   trazo: salia un marco negro rodeando la firma. Juan lo vio y mando la captura.

   Dejandolas transparentes, `alfaEsRecorte` le dice al recorte cuales pixeles no son foto. */
function fotoGirada(ancho, alto, margen, pintar) {
  const data = new Uint8ClampedArray(ancho * alto * 4);
  for (let y = 0; y < alto; y++) {
    for (let x = 0; x < ancho; x++) {
      const i = (y * ancho + x) * 4;
      const afuera = x < margen || y < margen || x >= ancho - margen || y >= alto - margen;
      const [r, g, b] = pintar(x, y);
      data[i] = r; data[i + 1] = g; data[i + 2] = b;
      data[i + 3] = afuera ? 0 : 255;      // afuera = no es foto
    }
  }
  return { data, width: ancho, height: alto };
}

test("lo que quedo afuera al girar no se toma por tinta", () => {
  const NEGRO = [40, 40, 44];
  const PAPEL = [210, 208, 212];
  const trazo = (x, y) => x >= 90 && x < 210 && y >= 80 && y < 120;
  const r = recortar(
    fotoGirada(300, 200, 30, (x, y) => (trazo(x, y) ? NEGRO : PAPEL)),
    { alfaEsRecorte: true },
  );
  assert.ok(r, "tiene que encontrar la firma");
  /* El trazo mide 120x40. Si se hubiera colado el borde, el recorte seria de 240x140. */
  assert.equal(r.alto, Math.round((r.ancho * 40) / 120), "recorto el trazo y no el marco");
});

test("sin avisar, ese mismo borde SI ensucia — por eso hace falta el aviso", () => {
  const NEGRO = [40, 40, 44];
  const PAPEL = [210, 208, 212];
  const trazo = (x, y) => x >= 90 && x < 210 && y >= 80 && y < 120;
  const sinAvisar = recortar(fotoGirada(300, 200, 30, (x, y) => (trazo(x, y) ? NEGRO : PAPEL)));
  /* Sin la bandera, la transparencia se lee como "el fondo de un PNG" y la tinta pasa a ser
     TODO el rectangulo opaco: el marco entero. Queda documentado para que nadie la saque. */
  assert.ok(sinAvisar, "devuelve algo");
  assert.notEqual(sinAvisar.alto, Math.round((sinAvisar.ancho * 40) / 120),
    "sin la bandera el recorte NO es el trazo");
});

/* EL CASO DE LAS FOTOS DE VERDAD. Juan mando dos recortes con barras negras alrededor de una
   firma diminuta. No era la tinta: era el BORDE DE LA HOJA apoyada sobre la mesa. Para un
   umbral local, esa raya es el trazo mas marcado de toda la foto.

   Una firma esta en el medio del papel; el canto de la hoja y la sombra de abajo llegan
   siempre hasta el borde de la foto. */
const papelSobreMesa = (ancho, alto, margen, hayFirma) => foto(ancho, alto, (x, y) => {
  const enElPapel = x >= margen && y >= margen && x < ancho - margen && y < alto - margen;
  if (!enElPapel) return [70, 66, 62];              // la mesa, oscura
  if (hayFirma(x, y)) return [38, 36, 40];          // la firma
  return [226, 224, 228];                           // el papel
});

test("el borde de la hoja no entra en el recorte", () => {
  const firma = (x, y) => x >= 140 && x < 260 && y >= 90 && y < 130;
  const r = recortar(papelSobreMesa(400, 240, 26, firma));
  assert.ok(r, "tiene que encontrar la firma");
  /* La firma mide 120x40. Si hubiera entrado el borde, el recorte seria de 348x188. */
  assert.equal(r.alto, Math.round((r.ancho * 40) / 120), "recorto la firma, no el marco");
});

/* La salvedad: si la foto ya viene recortada al ras y la firma llega hasta el borde, hay
   que dejarla. Sin esto, una foto ajustada devolveria una firma vacia. */
test("si la firma llega al borde porque la foto vino al ras, igual se queda", () => {
  const trazo = (x, y) => x < 280 && Math.abs(y - 50) < 4;
  const r = recortar(foto(300, 100, (x, y) => (trazo(x, y) ? [38, 36, 40] : [226, 224, 228])));
  assert.ok(r, "no se puede quedar sin firma");
  assert.ok(r.ancho > 0 && r.alto > 0);
});

/* Una rubrica que cruza la hoja de lado a lado la parte en dos pedazos de papel. Si se
   tomara solo el pedazo mas grande, la firma quedaria cortada justo al medio. */
test("una firma que parte la hoja en dos no se recorta por la mitad", () => {
  const raya = (x, y) => y >= 48 && y < 54;                       // cruza todo el ancho
  const arriba = (x, y) => x >= 60 && x < 240 && y >= 20 && y < 46;
  const abajo = (x, y) => x >= 60 && x < 240 && y >= 56 && y < 80;
  const r = recortar(papelSobreMesa(400, 200, 24,
    (x, y) => raya(x, y) || arriba(x, y) || abajo(x, y)));
  assert.ok(r, "tiene que encontrar la firma");
  /* Lo escrito va de y=20 a y=80: sesenta de alto. Si se hubiera quedado con media hoja,
     el alto seria la mitad. */
  assert.ok(r.alto > r.ancho * 0.1, `quedo ${r.ancho}x${r.alto}`);
});
