/* La firma del usuario, recortada de una foto de su firma de puno y letra.

   Se recorta POR COLOR y no por brillo, y esa es toda la gracia. La foto sale de un
   celular: tiene sombra despareja, y umbralar por oscuridad se come medio trazo de un
   lado y medio fondo del otro. Pero la tinta es azul y el fondo es gris neutro:

       fondo gris  ->  B - R  ~ 8
       tinta azul  ->  B - R  hasta 94

   Esa diferencia no depende de cuanta luz haya, asi que la sombra deja de importar.
   Medido sobre la foto real que entrego el usuario (2016x1134): recorto a 1427x584 sin
   arrastrar una sola mota del fondo, y a 300 px de ancho pesa 915 bytes comprimida.

   Se guarda la MASCARA, nunca la foto: mas liviana y menos expuesta. */

export const ANCHO_GUARDADO = 300;
const UMBRAL_AZUL = 35;
const MINIMO_PIXELES = 20;

/* Con lapicera negra la separacion por color no existe. Se cae a oscuridad y se avisa,
   porque el resultado es peor y el usuario tiene que mirarlo antes de guardarlo. */
function marcarTinta({ data, width, height }) {
  const azul = new Uint8Array(width * height);
  let cuantos = 0;
  for (let i = 0, p = 0; p < azul.length; p++, i += 4) {
    if (data[i + 2] - data[i] > UMBRAL_AZUL) {
      azul[p] = 1;
      cuantos++;
    }
  }
  if (cuantos >= MINIMO_PIXELES) return { tinta: azul, porBrillo: false };

  let suma = 0;
  for (let i = 0; i < data.length; i += 4) suma += (data[i] + data[i + 1] + data[i + 2]) / 3;
  const promedio = suma / (width * height);

  const oscuro = new Uint8Array(width * height);
  cuantos = 0;
  for (let i = 0, p = 0; p < oscuro.length; p++, i += 4) {
    if ((data[i] + data[i + 1] + data[i + 2]) / 3 < promedio - 30) {
      oscuro[p] = 1;
      cuantos++;
    }
  }
  return cuantos >= MINIMO_PIXELES ? { tinta: oscuro, porBrillo: true } : null;
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
