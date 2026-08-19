/* La carta oferta, acomodada en dos hojas A4.

   Es quien sabe como se ve una carta: los margenes, el corte de renglones, el texto
   justificado y donde van las tres firmas. El escritor de PDF (pdf.js) no sabe nada de
   esto; solo escribe lo que se le pide.

   El documento sale del MISMO `armar()` que dibuja la pantalla. Si la hoja y la pantalla
   dijeran cosas distintas seria un error, no una variante. */

import { nuevo, anchoDe, medirJpeg, A4 } from "./pdf.js";
import { deBytes } from "./firma.js";
import { encajar, tirasDeTinta } from "./firma-dibujo.js";

const MARGEN = 56;
/* Con membrete arriba y abajo el texto arranca y termina mas adentro. Sin membrete se
   usan los margenes de siempre. */
const ARRIBA = 58;
const ABAJO = 58;
const ARRIBA_CON_MEMBRETE = 96;
const ABAJO_CON_MEMBRETE = 80;
/* Apretado a proposito: la carta TIENE que entrar en dos hojas, con las firmas del
   oferente y del depositario abajo de la primera. Al agregar la seña el SEGUNDO crecio dos
   renglones, las firmas no entraron y salio una tercera hoja suelta con dos rayas. Hay un
   test que cuenta las hojas para que no vuelva a pasar. */
const CUERPO = 10;
const RENGLON = 13;
const ENTRE_PARRAFOS = 6.5;
const TITULO = 13.5;

const ANCHO_FIRMA = 170;
const ALTO_FIRMA = 40;

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

/* El membrete de la oficina, arriba y abajo de CADA hoja. Son las mismas dos imagenes
   que trae el Word de RE/MAX Unico, incrustadas tal cual: asi la carta que sale de la app
   se ve igual que la que sale del Word, y el que la recibe reconoce de donde viene. */
function ponerMembrete(doc, membrete) {
  if (!membrete) return;
  const dibujar = (bytes, arriba) => {
    if (!bytes) return;
    const medida = medirJpeg(bytes);
    if (!medida) return;
    const alto = (A4.ancho * medida.alto) / medida.ancho;
    doc.imagen(bytes, { x: 0, y: arriba ? 0 : A4.alto - alto, ancho: A4.ancho, alto });
  };
  dibujar(membrete.arriba, true);
  dibujar(membrete.abajo, false);
}

/* El boton "Firmar en el celular", pintado adentro de la hoja y con el enlace encima.

   Es lo que deja mandar UN archivo prolijo por WhatsApp en vez de un enlace larguisimo a
   la vista: el que lo recibe abre el PDF, lo lee, y decide — lo toca para firmar en el
   telefono, o lo imprime y firma a mano. Las dos puertas en el mismo papel.

   Se dibuja al final de la primera hoja, debajo de las firmas. */
const FIRMA_DEL_TURNO = { comprador: "oferente", propietario: "propietario" };

/* El boton "Firmar en el celular", pintado adentro de la hoja y con el enlace encima.

   Va JUSTO DEBAJO del renglon de firma que le toca a la parte que lo recibe: ahi es donde
   esta mirando cuando le toca firmar, no al final del documento.

   Solo aparece cuando se manda para firmar. El PDF que se baja para imprimir o archivar
   va SIN boton: un boton azul impreso en un papel no sirve para nada. */
function botonDeFirma(doc, x, y, enlace) {
  const alto = 22;
  const texto = "Firmar en el celular";
  const tamano = 9;

  doc.rectangulo(x, y, ANCHO_FIRMA, alto, [0, 0.26, 1]);   // el azul de la app
  doc.texto(x + (ANCHO_FIRMA - anchoDe(texto, { negrita: true, tamano })) / 2, y + 14.5,
    texto, { negrita: true, tamano, color: "blanco" });
  doc.enlace(enlace, { x, y, ancho: ANCHO_FIRMA, alto });

  const pie = "…o imprimila y firmala a mano";
  doc.texto(x + (ANCHO_FIRMA - anchoDe(pie, { tamano: 7 })) / 2, y + alto + 9, pie,
    { tamano: 7 });
}

/* `bloques` es lo que devuelve armar(); `firmas` son los bytes de cada firma hecha;
   `membrete` son los dos JPEG de la hoja membretada, o nada; `enlaceParaFirmar` es la
   direccion que abre la pantalla de firmar, si se quiere el boton; `turno` dice al lado de
   que firma ponerlo. */
export function armarPDF(bloques, firmas = {}, membrete = null, enlaceParaFirmar = "",
  turno = "comprador") {
  const doc = nuevo(A4);
  const ancho = A4.ancho - MARGEN * 2;
  const arriba = membrete ? ARRIBA_CON_MEMBRETE : ARRIBA;
  const abajo = membrete ? ABAJO_CON_MEMBRETE : ABAJO;
  let y = arriba;

  ponerMembrete(doc, membrete);

  const cabeEn = (cuanto) => y + cuanto <= A4.alto - abajo;
  const hojaNueva = () => {
    doc.hoja();
    ponerMembrete(doc, membrete);
    y = arriba;
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
      const alto = ALTO_FIRMA + 40;
      if (!cabeEn(alto + 14)) hojaNueva();
      y += 14;
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

        let renglon = base + 11;
        const centrado = (texto, tamano, negrita) => {
          doc.texto(x + (ANCHO_FIRMA - anchoDe(texto, { negrita, tamano })) / 2,
            renglon, texto, { tamano, negrita });
          renglon += tamano + 2;
        };
        centrado(firma.pie, 8.5, true);
        if (firma.nombre) centrado(firma.nombre, 8, false);
        if (firma.nota) centrado(firma.nota, 7.5, false);

        /* El boton va JUSTO DEBAJO de la firma que le toca a esta parte, no al final del
           documento: ahi es donde el que lo recibe esta mirando cuando le toca firmar. */
        if (enlaceParaFirmar && firma.clave === FIRMA_DEL_TURNO[turno] && !firma.firmada) {
          botonDeFirma(doc, x, renglon + 4, enlaceParaFirmar);
        }
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
