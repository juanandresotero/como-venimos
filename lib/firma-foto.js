/* La firma del usuario, recortada de una foto de su firma de puno y letra.

   EL PROBLEMA: una foto de papel sacada con un celular NUNCA tiene la luz pareja. Hay una
   esquina mas iluminada, la sombra de la propia mano, el reflejo del flash. Con un unico
   umbral de oscuridad para toda la imagen, el lado iluminado pierde medio trazo y el lado
   sombreado trae medio fondo.

   LA SOLUCION: no se compara cada pixel contra un numero fijo, sino CONTRA EL PROMEDIO DE
   SU PROPIO VECINDARIO. Un trazo es siempre mas oscuro que el papel que lo rodea, este esa
   zona iluminada o en sombra. Es el metodo de Bradley, y se calcula rapido con una tabla
   de sumas acumuladas: el promedio de cualquier rectangulo sale con cuatro restas, asi que
   da igual que el vecindario sea grande.

   Esto sirve con lapicera de CUALQUIER COLOR — negra, azul, roja —, que es lo que antes no
   andaba: se buscaba especificamente tinta azul y con otro color el recorte salia sucio.

   Antes de mirar nada se sube el contraste: se estiran los grises para que el mas claro de
   la foto quede en blanco y el mas oscuro en negro. Una foto lavada pasa a tener separacion
   de verdad entre papel y tinta.

   Se guarda la MASCARA, nunca la foto: mas liviana y menos expuesta. */

export const ANCHO_GUARDADO = 300;
const MINIMO_PIXELES = 20;

/* Cuanto mas oscuro que su vecindario tiene que ser un pixel para contar como tinta. En
   partes por ciento del promedio local. Bradley propone 15; con menos entra el grano del
   papel, con mas se cortan los trazos finos. */
const CUANTO_MAS_OSCURO = 0.15;

/* Si mas de esto quedo marcado como tinta, no se recorto una firma: se recorto una sombra,
   o la foto salio casi toda oscura. Conviene avisar antes de que lo guarde. */
const DEMASIADO = 0.35;

/* A grises, estirando el contraste.

   Se descarta una PUNTA MINIMA de cada lado —una milesima— para que un pixel quemado o una
   mota negra no arruinen el estiron. Tiene que ser minima: la tinta de una firma es en una
   foto tipica el 1 o 2% de los pixeles, asi que descartar "el 2% mas oscuro" se comia la
   firma entera y dejaba la imagen de un solo tono. Pasó, y no fallaba nada: devolvia null
   como si no hubiera firma. */
function aGrisesConContraste({ data, width, height }) {
  const total = width * height;
  const gris = new Uint8Array(total);
  const cuantos = new Uint32Array(256);
  for (let i = 0, p = 0; p < total; p++, i += 4) {
    /* Los pesos son los de la luminancia que ve el ojo: el verde pesa mas que el azul. */
    const g = (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000;
    gris[p] = g;
    cuantos[gris[p]]++;
  }

  const borde = Math.max(1, Math.round(total * 0.001));
  let acumulado = 0;
  let piso = 0;
  for (; piso < 255 && acumulado + cuantos[piso] < borde; piso++) acumulado += cuantos[piso];
  acumulado = 0;
  let techo = 255;
  for (; techo > 0 && acumulado + cuantos[techo] < borde; techo--) acumulado += cuantos[techo];

  const rango = Math.max(1, techo - piso);
  for (let p = 0; p < total; p++) {
    const v = ((gris[p] - piso) * 255) / rango;
    gris[p] = v < 0 ? 0 : v > 255 ? 255 : v;
  }
  return gris;
}

/* Tabla de sumas acumuladas: `suma[y][x]` guarda todo lo que hay arriba y a la izquierda.
   Con eso el promedio de cualquier rectangulo sale con cuatro restas. */
function tablaDeSumas(gris, ancho, alto) {
  const suma = new Float64Array((ancho + 1) * (alto + 1));
  for (let y = 0; y < alto; y++) {
    let fila = 0;
    for (let x = 0; x < ancho; x++) {
      fila += gris[y * ancho + x];
      suma[(y + 1) * (ancho + 1) + (x + 1)] = suma[y * (ancho + 1) + (x + 1)] + fila;
    }
  }
  return suma;
}

/* Cada pixel contra el promedio de su vecindario. */
function porUmbralLocal(gris, ancho, alto) {
  const suma = tablaDeSumas(gris, ancho, alto);
  const radio = Math.max(4, Math.round(Math.min(ancho, alto) / 12));
  const tinta = new Uint8Array(ancho * alto);
  let cuantos = 0;

  for (let y = 0; y < alto; y++) {
    const y0 = Math.max(0, y - radio);
    const y1 = Math.min(alto - 1, y + radio);
    for (let x = 0; x < ancho; x++) {
      const x0 = Math.max(0, x - radio);
      const x1 = Math.min(ancho - 1, x + radio);
      const area = (x1 - x0 + 1) * (y1 - y0 + 1);
      const caja = suma[(y1 + 1) * (ancho + 1) + (x1 + 1)]
        - suma[y0 * (ancho + 1) + (x1 + 1)]
        - suma[(y1 + 1) * (ancho + 1) + x0]
        + suma[y0 * (ancho + 1) + x0];
      if (gris[y * ancho + x] * area < caja * (1 - CUANTO_MAS_OSCURO)) {
        tinta[y * ancho + x] = 1;
        cuantos++;
      }
    }
  }
  return { tinta, cuantos };
}

function marcarTinta(imagen) {
  const { width, height, data } = imagen;
  const total = width * height;

  /* Un PNG ya recortado, con fondo transparente, no necesita que le adivinemos nada: la
     tinta es exactamente lo que no es transparente. Se pregunta PRIMERO porque en una
     imagen asi lo de abajo falla — el fondo transparente no tiene color y el umbral local
     lo lee como si fuera negro. */
  const transparente = new Uint8Array(total);
  let opacos = 0;
  let translucidos = 0;
  for (let i = 3, p = 0; p < total; p++, i += 4) {
    if (data[i] > 128) {
      transparente[p] = 1;
      opacos++;
    }
    if (data[i] < 250) translucidos++;
  }
  if (translucidos > total * 0.05 && opacos >= MINIMO_PIXELES) {
    return { tinta: transparente, porBrillo: false };
  }

  const { tinta, cuantos } = porUmbralLocal(aGrisesConContraste(imagen), width, height);
  if (cuantos < MINIMO_PIXELES) return null;
  /* `porBrillo` ya no quiere decir "no encontre azul": quiere decir "esto salio dudoso y
     conviene que lo mires". Pasa cuando media foto quedo marcada como tinta. */
  return { tinta, porBrillo: cuantos > total * DEMASIADO };
}

/* Tira las manchitas sueltas antes de medir el rectangulo: una mota de polvo en la mesa
   agranda el recorte y deja la firma chiquita en un rincon. */
function sinMotas(tinta, ancho, alto) {
  const limpia = new Uint8Array(tinta.length);
  const visto = new Uint8Array(tinta.length);
  const pila = [];
  for (let inicio = 0; inicio < tinta.length; inicio++) {
    if (!tinta[inicio] || visto[inicio]) continue;
    const grupo = [];
    pila.push(inicio);
    visto[inicio] = 1;
    while (pila.length) {
      const p = pila.pop();
      grupo.push(p);
      const x = p % ancho;
      const y = (p - x) / ancho;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= ancho || ny >= alto) continue;
        const q = ny * ancho + nx;
        if (tinta[q] && !visto[q]) {
          visto[q] = 1;
          pila.push(q);
        }
      }
    }
    if (grupo.length >= MINIMO_PIXELES) for (const p of grupo) limpia[p] = 1;
  }
  return limpia;
}

/* `imagen` es lo que devuelve `ctx.getImageData()`: data RGBA, width y height. */
export function recortar(imagen) {
  const marcado = marcarTinta(imagen);
  if (!marcado) return null;

  const { width: ancho, height: alto } = imagen;
  const tinta = sinMotas(marcado.tinta, ancho, alto);

  let x0 = ancho, y0 = alto, x1 = -1, y1 = -1;
  for (let y = 0; y < alto; y++) {
    for (let x = 0; x < ancho; x++) {
      if (!tinta[y * ancho + x]) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) return null;

  const anchoRecorte = x1 - x0 + 1;
  const altoRecorte = y1 - y0 + 1;
  const anchoFinal = ANCHO_GUARDADO;
  const altoFinal = Math.max(1, Math.round((anchoFinal * altoRecorte) / anchoRecorte));

  /* Se achica preguntando "en este pedazo, hay algo de tinta?" y no promediando: los
     trazos finos son un pixel de ancho y un promedio los borraria. */
  const porFila = Math.ceil(anchoFinal / 8);
  const bits = new Uint8Array(porFila * altoFinal);
  for (let y = 0; y < altoFinal; y++) {
    const ay = Math.floor((y * altoRecorte) / altoFinal);
    const by = Math.max(ay + 1, Math.floor(((y + 1) * altoRecorte) / altoFinal));
    for (let x = 0; x < anchoFinal; x++) {
      const ax = Math.floor((x * anchoRecorte) / anchoFinal);
      const bx = Math.max(ax + 1, Math.floor(((x + 1) * anchoRecorte) / anchoFinal));
      let hay = false;
      for (let py = y0 + ay; py < y0 + by && !hay; py++) {
        for (let px = x0 + ax; px < x0 + bx; px++) {
          if (tinta[py * ancho + px]) {
            hay = true;
            break;
          }
        }
      }
      if (hay) bits[y * porFila + (x >> 3)] |= 128 >> (x & 7);
    }
  }

  return {
    clase: "mascara",
    ancho: anchoFinal,
    alto: altoFinal,
    bits,
    porBrillo: marcado.porBrillo,
  };
}
