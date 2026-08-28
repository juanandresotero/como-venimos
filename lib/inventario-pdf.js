/* El inventario, armado en hojas A4.

   ES EL DOCUMENTO QUE SE FIRMA, así que la prolijidad no es decoración: una tabla que corta
   una fila al pie de la hoja, o un renglón que se sale del casillero, es lo que después se
   discute. Juan lo pidió con todas las letras: "hagámoslo mucho más prolijo de lo que ya hay".

   Tres cosas que el Word que usa hoy no hace y acá sí:

     - Una fila NUNCA se parte entre dos hojas. Si no entra, la fila entera pasa a la
       siguiente.
     - El encabezado de la tabla se repite arriba de cada hoja: sin eso, en la hoja 3 no se
       sabe qué ambiente se está leyendo.
     - La cantidad de hojas se cuenta sola. Es el punto 4 de las cláusulas, que hoy escribe
       a mano y por eso a veces queda mal.

   El texto largo se parte en renglones que entran en el casillero, y la fila crece para
   contenerlos: no se recorta nada. Un detalle recortado en un inventario es un detalle que
   no existe. */

import { nuevo, A4, anchoDe, medirJpeg } from "./pdf.js";
import { comoSeLee, conCantidad, numerar, comoSeLlama, loQueSeImprime } from "./inventario.js";

const MARGEN = 42;
const ANCHO = A4.ancho - MARGEN * 2;
/* CON MEMBRETE EL TEXTO ARRANCA Y TERMINA MAS ADENTRO. Las dos franjas de la hoja de RE/MAX
   ocupan lugar, y escribir encima de ellas es lo que hace que un documento se vea hecho a las
   apuradas. Sin membrete —si el telefono esta sin señal y no lo tiene en cache— el documento
   sale igual, usando toda la hoja. */
/* Medidas de las franjas de verdad, no a ojo: la de arriba ocupa 78 puntos de la hoja y la de
   abajo 64. Le sumo aire para que el texto no las roce. */
const ARRIBA_CON_MEMBRETE = 90;
const FRANJA_DE_ABAJO = 64;
const PIE_CON_MEMBRETE = FRANJA_DE_ABAJO + 22;
const PIE_SIN_MEMBRETE = 56;

const TITULO = 15;
const CUERPO = 9.5;
const CHICO = 8;

const COL_ITEM = 150;          // la primera columna: el nombre de la cosa
const PADDING = 5;
const RENGLON = 12;

const GRIS = [0.45, 0.45, 0.45];
/* Los colores de RE/MAX, sacados de la misma hoja membretada que usa la oficina: el azul de
   la franja de arriba y el rojo del logo. Un inventario que sale de la app tiene que
   reconocerse como de RE/MAX Unico sin leer una letra. */
const AZUL = [0.0, 0.16, 0.44];
const ROJO = [0.79, 0.09, 0.13];
const FONDO = [0.93, 0.95, 0.98];

/* Corta un texto en renglones que entran en `ancho`. Sin partir palabras: una palabra partida
   en un documento que se firma se lee como un error de la app. */
export function enRenglones(texto, ancho, tamano = CUERPO, negrita = false) {
  const limpio = String(texto || "").trim();
  if (!limpio) return [""];
  const renglones = [];
  let actual = "";
  for (const palabra of limpio.split(/\s+/)) {
    const prueba = actual ? `${actual} ${palabra}` : palabra;
    if (actual && anchoDe(prueba, { tamano, negrita }) > ancho) {
      renglones.push(actual);
      actual = palabra;
    } else {
      actual = prueba;
    }
  }
  if (actual) renglones.push(actual);
  return renglones;
}

/* Lo que ocupa una fila, para poder decidir ANTES de dibujarla si entra en lo que queda de
   hoja. Es lo que hace que ninguna fila se parta al medio. */
const altoDeFila = (izquierda, derecha, anchoDerecha) =>
  Math.max(
    enRenglones(izquierda, COL_ITEM - PADDING * 2).length,
    enRenglones(derecha, anchoDerecha - PADDING * 2).length,
  ) * RENGLON + PADDING * 2;

/* Las dos franjas de la hoja de RE/MAX Unico, arriba y abajo de CADA hoja. Son las mismas
   imagenes que trae el Word de la oficina, incrustadas tal cual: asi el inventario que sale de
   la app se ve igual que el que sale del Word. */
function ponerMembrete(doc, membrete) {
  if (!membrete) return;
  for (const [bytes, arriba] of [[membrete.arriba, true], [membrete.abajo, false]]) {
    if (!bytes) continue;
    const medida = medirJpeg(bytes);
    if (!medida) continue;
    const alto = (A4.ancho * medida.alto) / medida.ancho;
    doc.imagen(bytes, { x: 0, y: arriba ? 0 : A4.alto - alto, ancho: A4.ancho, alto });
  }
}

/* LAS FOTOS, EN GRILLA, DESPUES DE LAS TABLAS. Es el mismo armado que usa Juan hoy: primero
   todo el texto y al final una seccion por ambiente con sus fotos.

   CINCO POR FILA. Con seis se ven demasiado chicas para distinguir una rayita; con cuatro,
   ciento cincuenta fotos ocupan diez hojas de mas. */
const POR_FILA = 5;
const AIRE_FOTO = 4;

export function armarPDF(inventario, { oficina = "", membrete = null, fotos = [] } = {}) {
  const doc = nuevo();
  const ARRIBA = membrete ? ARRIBA_CON_MEMBRETE : MARGEN;
  const TOPE = A4.alto - (membrete ? PIE_CON_MEMBRETE : PIE_SIN_MEMBRETE);
  /* Lo vacío no se imprime: una fila sin nombre, o un ambiente sin nada adentro, es un
     renglón que nadie sabe qué quiso decir. Se numera DESPUES de sacarlos, para que un
     "Dormitorio 2" vacío no deje un salto del 1 al 3. */
  const inv = { ...inventario, ambientes: numerar(loQueSeImprime(inventario)) };
  const anchoValor = ANCHO - COL_ITEM;

  /* OJO: `nuevo()` YA VIENE CON UNA HOJA ABIERTA. Pedirle una antes de dibujar deja la
     primera en blanco, y un documento que se firma con una hoja vacía adelante es
     exactamente lo que no puede pasar. Por eso la primera se usa tal cual y `doc.hoja()`
     recién se llama para la segunda en adelante.

     `doc.hoja()` devuelve el mismo `doc`: son la misma cosa, sólo cambia en cuál escribe. */
  const hoja = doc;
  let y = ARRIBA;
  let hojas = 1;

  const nuevaHoja = () => {
    doc.hoja();
    hojas += 1;
    y = ARRIBA;
    // El pie se dibuja al abrir la hoja: ahi ya se sabe su numero, y si se dejara para el
    // final habria que acordarse de todas las hojas abiertas.
    pieDeHoja(hojas);
  };

  function pieDeHoja(numero) {
    ponerMembrete(doc, membrete);
    /* Con membrete el pie de la oficina ya viene dibujado en la franja: repetirlo seria
       escribir dos veces la misma direccion. Queda solo el numero de hoja, que el Word no
       pone y en un documento de veinte hojas hace falta. */
    /* El numero de hoja va ENTRE el final del texto y la franja, no encima de ella: pisarle
       el logo a la oficina es lo primero que se ve mal en un documento que se imprime. */
    const n = `Hoja ${numero}`;
    hoja.texto(A4.ancho - MARGEN - anchoDe(n, { tamano: CHICO }), TOPE + 13, n,
      { tamano: CHICO, color: GRIS });
    if (membrete) return;
    hoja.linea(MARGEN, TOPE + 6, A4.ancho - MARGEN, TOPE + 6, 0.6);
    hoja.texto(MARGEN, TOPE + 16, oficina, { tamano: CHICO, color: GRIS });
  }

  const espacio = (alto) => {
    if (y + alto <= TOPE) return;
    nuevaHoja();
  };

  pieDeHoja(1);

  // ---------------------------------------------------------------- el encabezado
  /* Una barra roja de RE/MAX arriba del titulo: es lo que hace que se reconozca de dónde
     viene antes de leer nada. */
  hoja.rectangulo(MARGEN, y + 2, 46, 4, ROJO);
  hoja.texto(MARGEN, y + 22, "Inventario del inmueble",
    { negrita: true, tamano: TITULO, color: AZUL });
  y += 32;
  for (const renglon of enRenglones(comoSeLlama(inv), ANCHO, 12, true)) {
    hoja.texto(MARGEN, y + 11, renglon, { negrita: true, tamano: 12 });
    y += 15;
  }
  hoja.texto(MARGEN, y + 10, `Realizado el ${inv.fecha || "—"}`, { tamano: CUERPO, color: GRIS });
  y += 20;
  for (const renglon of enRenglones(inv.aviso_reclamo || "", ANCHO, CHICO)) {
    hoja.texto(MARGEN, y + 8, renglon, { tamano: CHICO, color: GRIS });
    y += 11;
  }
  y += 8;

  // ---------------------------------------------------------------- los ambientes
  const tituloDeAmbiente = (nombre) => {
    espacio(58);
    hoja.rectangulo(MARGEN, y, ANCHO, 20, FONDO);
    /* Una pestaña azul a la izquierda de cada ambiente: separa las tablas de un vistazo en un
       documento de veinte hojas, sin gastar altura. */
    hoja.rectangulo(MARGEN, y, 3.5, 20, AZUL);
    hoja.texto(MARGEN + PADDING + 4, y + 14, nombre.toUpperCase(),
      { negrita: true, tamano: 10, color: AZUL });
    y += 20;
  };

  for (const ambiente of inv.ambientes) {
    const filas = (ambiente.items || []).map((i) => [conCantidad(i), comoSeLee(i)]);
    if (!filas.length) continue;

    /* El título del ambiente sólo se dibuja si abajo entra al menos una fila: un ambiente que
       arranca con el título al pie de la hoja y sigue en la otra se lee como dos ambientes. */
    espacio(20 + altoDeFila(filas[0][0], filas[0][1], anchoValor));
    tituloDeAmbiente(ambiente.nombre);

    for (const [izquierda, derecha] of filas) {
      const alto = altoDeFila(izquierda, derecha, anchoValor);
      if (y + alto > TOPE) {
        nuevaHoja();
        /* EL ENCABEZADO SE REPITE. Sin esto, en la hoja 3 no se sabe qué ambiente se está
           leyendo, y son veinte hojas. */
        tituloDeAmbiente(`${ambiente.nombre} (sigue)`);
      }
      hoja.linea(MARGEN, y, A4.ancho - MARGEN, y, 0.5);
      const izq = enRenglones(izquierda, COL_ITEM - PADDING * 2);
      const der = enRenglones(derecha, anchoValor - PADDING * 2);
      izq.forEach((r, i) => hoja.texto(MARGEN + PADDING, y + PADDING + RENGLON * (i + 1) - 3, r,
        { tamano: CUERPO, negrita: true }));
      der.forEach((r, i) => hoja.texto(MARGEN + COL_ITEM + PADDING,
        y + PADDING + RENGLON * (i + 1) - 3, r, { tamano: CUERPO }));
      y += alto;
    }
    hoja.linea(MARGEN, y, A4.ancho - MARGEN, y, 0.5);
    y += 16;
  }

  // ---------------------------------------------------------------- observaciones y cláusulas
  const parrafo = (texto, { negrita = false, tamano = CUERPO, sangria = 0 } = {}) => {
    for (const renglon of enRenglones(texto, ANCHO - sangria, tamano, negrita)) {
      espacio(RENGLON + 2);
      hoja.texto(MARGEN + sangria, y + tamano, renglon, { tamano, negrita });
      y += tamano + 3;
    }
  };

  if ((inv.observaciones || "").trim()) {
    y += 6;
    parrafo("Observaciones", { negrita: true, tamano: 11 });
    y += 2;
    parrafo(inv.observaciones);
    y += 8;
  }

  /* LA CANTIDAD DE HOJAS SE CUENTA SOLA. Es el punto 4 y hoy lo escribe a mano.
     El número no se sabe hasta terminar de dibujar, así que se deja el lugar reservado y se
     completa al final: por eso se dibuja en su propio renglón. */
  const pendientes = [];
  (inv.clausulas || []).filter((c) => (c || "").trim()).forEach((clausula, i) => {
    const numero = `${i + 1})`;
    espacio(RENGLON * 2);
    hoja.texto(MARGEN, y + CUERPO, numero, { tamano: CUERPO, negrita: true });
    if (clausula.includes("{HOJAS}")) {
      /* Se anota EN QUE HOJA quedó el hueco, no la hoja misma: `doc` es siempre el mismo
         objeto y al final estaría escribiendo en la última. */
      pendientes.push({ enHoja: hojas, y, texto: clausula });
      y += CUERPO + 3;
      return;
    }
    parrafo(clausula, { sangria: 20 });
    y += 4;
  });

  if ((inv.link_fotos || "").trim()) {
    y += 4;
    parrafo("Las fotos en tamaño original:", { negrita: true });
    for (const renglon of enRenglones(inv.link_fotos, ANCHO, CHICO)) {
      espacio(RENGLON);
      hoja.texto(MARGEN, y + CHICO, renglon, { tamano: CHICO, color: [0.1, 0.3, 0.7] });
      y += CHICO + 3;
    }
    hoja.enlace(inv.link_fotos, { x: MARGEN, y: y - 20, ancho: ANCHO, alto: 20 });
    y += 8;
  }

  // ---------------------------------------------------------------- las fotos
  /* Van DESPUES de las clausulas y ANTES de las firmas, como en el suyo: lo que se lee esta
     junto, y lo que se mira esta junto. */
  const porAmbiente = new Map();
  for (const f of fotos || []) {
    if (!f || !f.papel || !f.papel.bytes) continue;
    if (!porAmbiente.has(f.ambiente)) porAmbiente.set(f.ambiente, []);
    porAmbiente.get(f.ambiente).push(f);
  }

  for (const ambiente of inv.ambientes) {
    const suyas = porAmbiente.get(ambiente.nombre) || porAmbiente.get(ambiente.id) || [];
    if (!suyas.length) continue;

    const ancho = (ANCHO - AIRE_FOTO * (POR_FILA - 1)) / POR_FILA;
    /* La altura de una fila la manda la foto MAS ALTA de esa fila: si se usara una altura
       fija, las verticales quedarian recortadas o estiradas. */
    const filas = [];
    for (let i = 0; i < suyas.length; i += POR_FILA) filas.push(suyas.slice(i, i + POR_FILA));

    const altoDe = (foto) => {
      const p = foto.papel;
      return p.ancho && p.alto ? (ancho * p.alto) / p.ancho : ancho;
    };

    espacio(26 + Math.max(...filas[0].map(altoDe)));
    y += 10;
    hoja.rectangulo(MARGEN, y, 3.5, 16, ROJO);
    hoja.texto(MARGEN + PADDING + 4, y + 12, ambiente.nombre,
      { negrita: true, tamano: 11, color: AZUL });
    y += 20;

    for (const fila of filas) {
      const alto = Math.max(...fila.map(altoDe));
      /* Una fila de fotos no se parte: media foto arriba y media abajo no se puede mirar. */
      if (y + alto > TOPE) nuevaHoja();
      fila.forEach((foto, i) => {
        hoja.imagen(foto.papel.bytes, {
          x: MARGEN + i * (ancho + AIRE_FOTO), y, ancho, alto: altoDe(foto),
        });
      });
      y += alto + AIRE_FOTO;
    }
    y += 8;
  }

  // ---------------------------------------------------------------- las firmas
  espacio(90);
  y += 20;
  for (const quien of ["Firma Arrendador/a", "Firma Arrendatario/a"]) {
    espacio(46);
    hoja.texto(MARGEN, y + CUERPO, quien, { tamano: CUERPO });
    hoja.linea(MARGEN + 150, y + 16, MARGEN + 400, y + 16, 0.8);
    y += 42;
  }

  /* Ahora sí se sabe cuántas hojas son. Se vuelve a la hoja donde quedó el hueco, se escribe,
     y se deja el cursor otra vez al final para no romper nada de lo que venga después. */
  const total = hojas;
  for (const p of pendientes) {
    doc.enHoja(p.enHoja - 1);
    const texto = p.texto.replace("{HOJAS}", String(total));
    enRenglones(texto, ANCHO - 20).forEach((r, i) =>
      doc.texto(MARGEN + 20, p.y + CUERPO + (CUERPO + 3) * i, r, { tamano: CUERPO }));
  }
  doc.enHoja(total - 1);

  return { doc, hojas: total };
}

export const nombreArchivo = (inv) =>
  `Inventario ${comoSeLlama(inv) || "sin dirección"} ${inv.fecha || ""}`
    .replace(/[\\/:*?"<>|·]/g, "-").replace(/\s+/g, " ").trim() + ".pdf";
