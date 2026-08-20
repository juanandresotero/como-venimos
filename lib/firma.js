/* Las firmas de la carta oferta, en el formato mas chico que se pueda leer despues.

   Hay DOS clases, porque hay dos situaciones distintas:

   - `trazos`: la que dibujan las partes con el dedo. Se guarda como puntos y no como
     imagen — pesa una fraccion, se dibuja nitida a cualquier tamano, y en el PDF entra
     como trazo vectorial de verdad.
   - `mascara`: la del usuario, recortada de una foto de su firma real (ver firma-foto.js).
     Su firma no se dibuja con el dedo: es la de puno y letra, escaneada una sola vez.

   Este archivo NO comprime: de eso se encarga carta-enlace.js, que deflacta todo el
   paquete de una sola vez. Asi las funciones de aca quedan sincronicas y simples, y la
   compresion aprovecha que los nombres de las casillas se repiten. */

export const GRILLA = { ancho: 1024, alto: 512 };
const MAX_PUNTOS = 60;

const TRAZOS = 1;
const MASCARA = 2;

const acotar = (n, tope) => Math.max(0, Math.min(tope - 1, Math.round(n)));

/* Una firma hecha a mano puede traer cientos de puntos si la persona escribe despacio.
   Sesenta alcanzan y sobran para que se vea igual, y el resto es peso al pedo. */
function remuestrear(puntos) {
  if (puntos.length <= MAX_PUNTOS) return puntos;
  const salida = [];
  for (let i = 0; i < MAX_PUNTOS; i++) {
    salida.push(puntos[Math.round((i * (puntos.length - 1)) / (MAX_PUNTOS - 1))]);
  }
  return salida;
}

export function deTrazos(trazos) {
  return {
    clase: "trazos",
    trazos: (trazos || [])
      .filter((t) => t && t.length)
      .map((t) => remuestrear(t).map((p) => ({
        x: acotar(p.x, GRILLA.ancho),
        y: acotar(p.y, GRILLA.alto),
      }))),
  };
}

export function deMascara({ ancho, alto, bits }) {
  return { clase: "mascara", ancho, alto, bits };
}

/* Enteros de longitud variable, en zigzag.

   Casi todos los saltos entre dos puntos seguidos son de pocos pixeles y entran en un
   byte. Los pocos que no —el salto de un trazo largo despues de remuestrear— toman dos.
   Un delta de tamano fijo obligaria a elegir entre perder precision o pagar el doble
   siempre; asi la ida y la vuelta son exactas y el tamano es el minimo. */
function escribirVariable(bytes, n) {
  let v = (n << 1) ^ (n >> 31);
  while (v > 127) {
    bytes.push((v & 127) | 128);
    v >>>= 7;
  }
  bytes.push(v);
}

function leerVariable(bytes, cursor) {
  let v = 0;
  let corrimiento = 0;
  while (cursor.i < bytes.length) {
    const b = bytes[cursor.i++];
    v |= (b & 127) << corrimiento;
    if (!(b & 128)) return (v >>> 1) ^ -(v & 1);
    corrimiento += 7;
    if (corrimiento > 28) break;
  }
  return null;
}

export function aBytes(firma) {
  if (!firma) return new Uint8Array([TRAZOS, 0]);

  if (firma.clase === "mascara") {
    const cabeza = [MASCARA, firma.ancho >> 8, firma.ancho & 255, firma.alto >> 8, firma.alto & 255];
    const salida = new Uint8Array(cabeza.length + firma.bits.length);
    salida.set(cabeza);
    salida.set(firma.bits, cabeza.length);
    return salida;
  }

  const bytes = [TRAZOS, firma.trazos.length];
  for (const trazo of firma.trazos) {
    escribirVariable(bytes, trazo.length);
    escribirVariable(bytes, trazo[0].x);
    escribirVariable(bytes, trazo[0].y);
    for (let i = 1; i < trazo.length; i++) {
      escribirVariable(bytes, trazo[i].x - trazo[i - 1].x);
      escribirVariable(bytes, trazo[i].y - trazo[i - 1].y);
    }
  }
  return new Uint8Array(bytes);
}

export function deBytes(bytes) {
  if (!bytes || bytes.length < 2) return null;

  if (bytes[0] === MASCARA) {
    if (bytes.length < 5) return null;
    return {
      clase: "mascara",
      ancho: (bytes[1] << 8) | bytes[2],
      alto: (bytes[3] << 8) | bytes[4],
      bits: bytes.slice(5),
    };
  }
  if (bytes[0] !== TRAZOS) return null;

  const trazos = [];
  const cursor = { i: 2 };
  for (let t = 0; t < bytes[1]; t++) {
    const cuantos = leerVariable(bytes, cursor);
    let x = leerVariable(bytes, cursor);
    let y = leerVariable(bytes, cursor);
    if (cuantos === null || x === null || y === null || cuantos < 1) return null;
    const puntos = [{ x, y }];
    for (let p = 1; p < cuantos; p++) {
      const dx = leerVariable(bytes, cursor);
      const dy = leerVariable(bytes, cursor);
      if (dx === null || dy === null) return null;
      x += dx;
      y += dy;
      puntos.push({ x, y });
    }
    trazos.push(puntos);
  }
  return { clase: "trazos", trazos };
}

/* El rectangulo que ocupa la firma, en su propia escala. Sirve para encajarla adentro de
   la caja que le toca en la pantalla o en el PDF sin deformarla. */
export function medidas(firma) {
  if (!firma) return null;
  if (firma.clase === "mascara") return { ancho: firma.ancho, alto: firma.alto };
  if (!firma.trazos.length) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const trazo of firma.trazos) {
    for (const p of trazo) {
      if (p.x < x0) x0 = p.x;
      if (p.x > x1) x1 = p.x;
      if (p.y < y0) y0 = p.y;
      if (p.y > y1) y1 = p.y;
    }
  }
  return { x0, y0, ancho: Math.max(1, x1 - x0), alto: Math.max(1, y1 - y0) };
}

/* Si el pixel (x, y) de una mascara tiene tinta. Lo usan la pantalla y el PDF. */
export function tinta(mascara, x, y) {
  const porFila = Math.ceil(mascara.ancho / 8);
  return Boolean(mascara.bits[y * porFila + (x >> 3)] & (128 >> (x & 7)));
}

/* Achicar una mascara a la mitad, a un tercio, a lo que haga falta.

   Existe por una razon muy concreta: la firma sacada de una foto viaja adentro del enlace
   que el cliente devuelve por WhatsApp, y una firma alta daba un enlace de miles de
   caracteres. A Juan le llego uno cortado por la mitad, y un enlace cortado es una carta que
   no vuelve. Con esto el enlace se puede ir achicando hasta que entre, siempre.

   Se achica preguntando "en este pedazo, hay algo de tinta?" y no promediando: los trazos
   finos son de un pixel de ancho y un promedio los borraria. */
export function achicar(mascara, escala) {
  if (!mascara || mascara.clase !== "mascara" || escala >= 1) return mascara;
  const ancho = Math.max(1, Math.round(mascara.ancho * escala));
  const alto = Math.max(1, Math.round(mascara.alto * escala));
  const porFilaVieja = Math.ceil(mascara.ancho / 8);
  const porFila = Math.ceil(ancho / 8);
  const bits = new Uint8Array(porFila * alto);

  for (let y = 0; y < alto; y++) {
    const ay = Math.floor((y * mascara.alto) / alto);
    const by = Math.max(ay + 1, Math.floor(((y + 1) * mascara.alto) / alto));
    for (let x = 0; x < ancho; x++) {
      const ax = Math.floor((x * mascara.ancho) / ancho);
      const bx = Math.max(ax + 1, Math.floor(((x + 1) * mascara.ancho) / ancho));
      let hay = false;
      for (let py = ay; py < by && !hay; py++) {
        for (let px = ax; px < bx; px++) {
          if (mascara.bits[py * porFilaVieja + (px >> 3)] & (128 >> (px & 7))) {
            hay = true;
            break;
          }
        }
      }
      if (hay) bits[y * porFila + (x >> 3)] |= 128 >> (x & 7);
    }
  }
  return { clase: "mascara", ancho, alto, bits };
}
