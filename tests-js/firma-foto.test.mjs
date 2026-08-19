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

/* La red de seguridad: si la separacion por azul es debil, avisar. */
test("con lapicera negra avisa que cayo al metodo de respaldo", () => {
  const NEGRO = [40, 40, 44];
  const r = recortar(foto(200, 100, (x, y) => (trazoGordo(x, y) ? NEGRO : GRIS)));
  assert.ok(r, "igual tiene que poder recortarla");
  assert.equal(r.porBrillo, true, "para poder avisarle que revise el recorte");
});
