/* La carta oferta, acomodada en dos hojas A4.

   Es quien sabe como se ve una carta: los margenes, el corte de renglones, el texto
   justificado y donde van las tres firmas. El escritor de PDF (pdf.js) no sabe nada de
   esto; solo escribe lo que se le pide.

   El documento sale del MISMO `armar()` que dibuja la pantalla. Si la hoja y la pantalla
   dijeran cosas distintas seria un error, no una variante. */

import { nuevo, anchoDe, A4 } from "./pdf.js";
import { deBytes } from "./firma.js";
import { encajar, tirasDeTinta } from "./firma-dibujo.js";

const MARGEN = 56;
const ARRIBA = 58;
const ABAJO = 58;
const CUERPO = 10.5;
const RENGLON = 14.5;
const ENTRE_PARRAFOS = 9;
const TITULO = 14;

const ANCHO_FIRMA = 170;
const ALTO_FIRMA = 46;

/* Corta un parrafo en renglones que entren en el ancho, sin partir palabras. Devuelve
   cada renglon con sus palabras aparte, porque para justificar hay que saber cuantos
   espacios tiene. */
export function cortarEnRenglones(texto, ancho, tamano = CUERPO) {
  const renglones = [];
  let actual = [];
  let medida = 0;
  const espacio = anchoDe(" ", { tamano });

  for (const palabra of String(texto).split(/\s+/).filter(Boolean)) {
    const suya = anchoDe(palabra, { tamano });
    if (actual.length && medida + espacio + suya > ancho) {
      renglones.push(actual);
      actual = [];
      medida = 0;
    }
    medida += (actual.length ? espacio : 0) + suya;
    actual.push(palabra);
  }
  if (actual.length) renglones.push(actual);
  return renglones;
}

/* Cuanto espacio de mas hay que meter entre palabras para que el renglon llegue justo al
   borde. El ULTIMO renglon de un parrafo no se estira: si se estirara, un parrafo que
   termina con dos palabras las mandaria a cada punta de la hoja. */
export function espacioParaJustificar(palabras, ancho, tamano = CUERPO) {
  if (palabras.length < 2) return 0;
  const letras = palabras.reduce((n, p) => n + anchoDe(p, { tamano }), 0);
  const espacios = (palabras.length - 1) * anchoDe(" ", { tamano });
  const sobra = ancho - letras - espacios;
  return sobra > 0 ? sobra / (palabras.length - 1) : 0;
}

function dibujarFirma(doc, bytes, caja) {
  const firma = deBytes(bytes);
  if (!firma) return;
  const e = encajar(firma, caja);
  if (!e) return;

  if (firma.clase === "mascara") {
    for (const tira of tirasDeTinta(firma)) {
      doc.rectangulo(e.dx + tira.x * e.escala, e.dy + tira.y * e.escala,
        Math.max(0.4, tira.largo * e.escala), Math.max(0.4, e.escala));
    }
    return;
  }
  for (const trazo of firma.trazos) {
    doc.trazo(trazo.map((p) => ({
      x: e.dx + (p.x - e.x0) * e.escala,
      y: e.dy + (p.y - e.y0) * e.escala,
    })), 1.1);
  }
}

/* `bloques` es lo que devuelve armar(); `firmas` son los bytes de cada firma hecha. */
export function armarPDF(bloques, firmas = {}) {
  const doc = nuevo(A4);
  const ancho = A4.ancho - MARGEN * 2;
  let y = ARRIBA;

  const cabeEn = (cuanto) => y + cuanto <= A4.alto - ABAJO;
  const hojaNueva = () => {
    doc.hoja();
    y = ARRIBA;
  };

  for (const bloque of bloques) {
    if (bloque.tipo === "salto-de-hoja") {
      hojaNueva();
      continue;
    }

    if (bloque.tipo === "titulo") {
      const texto = bloque.partes.map((p) => p.texto).join("");
      if (!cabeEn(TITULO + 18)) hojaNueva();
      y += 6;
      doc.texto(MARGEN + (ancho - anchoDe(texto, { negrita: true, tamano: TITULO })) / 2,
        y + TITULO, texto, { negrita: true, tamano: TITULO });
      y += TITULO + 16;
      continue;
    }

    if (bloque.tipo === "parrafo") {
      const renglones = cortarEnRenglones(bloque.partes.map((p) => p.texto).join(""), ancho);
      renglones.forEach((palabras, i) => {
        if (!cabeEn(RENGLON)) hojaNueva();
        const ultimo = i === renglones.length - 1;
        doc.texto(MARGEN, y + CUERPO, palabras.join(" "), {
          tamano: CUERPO,
          espacioExtra: ultimo ? 0 : espacioParaJustificar(palabras, ancho),
        });
        y += RENGLON;
      });
      y += ENTRE_PARRAFOS;
      continue;
    }

    if (bloque.tipo === "firmas") {
      const alto = ALTO_FIRMA + 44;
      if (!cabeEn(alto + 24)) hojaNueva();
      y += 24;
      const separacion = bloque.firmas.length > 1
        ? (ancho - ANCHO_FIRMA * bloque.firmas.length) / (bloque.firmas.length - 1)
        : 0;

      bloque.firmas.forEach((firma, i) => {
        const x = bloque.firmas.length === 1
          ? MARGEN + (ancho - ANCHO_FIRMA) / 2
          : MARGEN + i * (ANCHO_FIRMA + separacion);

        dibujarFirma(doc, firmas[firma.clave], {
          x: x + 8, y, ancho: ANCHO_FIRMA - 16, alto: ALTO_FIRMA,
        });

        const base = y + ALTO_FIRMA + 3;
        doc.linea(x, base, x + ANCHO_FIRMA, base, 0.8);

        let renglon = base + 12;
        const centrado = (texto, tamano, negrita) => {
          doc.texto(x + (ANCHO_FIRMA - anchoDe(texto, { negrita, tamano })) / 2,
            renglon, texto, { tamano, negrita });
          renglon += tamano + 2.5;
        };
        centrado(firma.pie, 9, true);
        if (firma.nombre) centrado(firma.nombre, 8.5, false);
        if (firma.nota) centrado(firma.nota, 8, false);
      });
      y += alto;
    }
  }

  return doc;
}

export const nombreDelArchivo = (valores = {}) => {
  const donde = String(valores.calle || "").replace(/[^\wáéíóúñÁÉÍÓÚÑ ]+/g, "").trim();
  return `Oferta de compra — ${donde || "sin dirección"}.pdf`;
};
