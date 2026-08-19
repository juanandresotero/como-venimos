/* Un escritor de PDF a mano, sin librerias.

   Como todo en este proyecto. Y no es tan bravo como suena: Helvetica y Helvetica-Bold
   son de las catorce fuentes que TODO lector de PDF ya trae, asi que no hay que incrustar
   nada. Con `/WinAnsiEncoding` entran los acentos, la ñ, los signos de apertura y las
   comillas curvas que usa el texto de la carta.

   Sabe cuatro cosas: escribir texto, tirar una linea, pintar un rectangulo y empezar una
   hoja nueva. Con eso alcanza para la carta oferta — hasta para las firmas, que son
   trazos y se dibujan como lineas de verdad, no como imagen.

   Lo que NO hace: acomodar los renglones. De eso se encarga carta-pdf.js, que es quien
   sabe como se ve una carta. Aca solo se escribe el archivo. */

export const A4 = { ancho: 595, alto: 842 };

/* Los anchos de cada letra, en milesimas de punto, tal cual los publica Adobe para las
   catorce fuentes base. Sin esto no se puede saber donde termina un renglon, y sin eso
   no hay ni corte de palabras ni texto justificado. */
const ANCHOS_NORMAL = {
  " ": 278, "!": 278, '"': 355, "#": 556, $: 556, "%": 889, "&": 667, "'": 191,
  "(": 333, ")": 333, "*": 389, "+": 584, ",": 278, "-": 333, ".": 278, "/": 278,
  ":": 278, ";": 278, "<": 584, "=": 584, ">": 584, "?": 556, "@": 1015,
  A: 667, B: 667, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722, I: 278, J: 500,
  K: 667, L: 556, M: 833, N: 722, O: 778, P: 667, Q: 778, R: 722, S: 667, T: 611,
  U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611,
  "[": 278, "\\": 278, "]": 278, "^": 469, _: 556, "`": 333,
  a: 556, b: 556, c: 500, d: 556, e: 556, f: 278, g: 556, h: 556, i: 222, j: 222,
  k: 500, l: 222, m: 833, n: 556, o: 556, p: 556, q: 556, r: 333, s: 500, t: 278,
  u: 556, v: 500, w: 722, x: 500, y: 500, z: 500,
  "{": 334, "|": 260, "}": 334, "~": 584,
  "¡": 333, "¿": 611, "«": 556, "»": 556, "“": 333, "”": 333, "‘": 222, "’": 222,
  "–": 556, "—": 1000, "°": 400, "€": 556,
};

const ANCHOS_NEGRITA = {
  " ": 278, "!": 333, '"': 474, "#": 556, $: 556, "%": 889, "&": 722, "'": 238,
  "(": 333, ")": 333, "*": 389, "+": 584, ",": 278, "-": 333, ".": 278, "/": 278,
  ":": 333, ";": 333, "<": 584, "=": 584, ">": 584, "?": 611, "@": 975,
  A: 722, B: 722, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722, I: 278, J: 556,
  K: 722, L: 611, M: 833, N: 722, O: 778, P: 667, Q: 778, R: 722, S: 667, T: 611,
  U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611,
  "[": 333, "\\": 278, "]": 333, "^": 584, _: 556, "`": 333,
  a: 556, b: 611, c: 556, d: 611, e: 556, f: 333, g: 611, h: 611, i: 278, j: 278,
  k: 556, l: 278, m: 889, n: 611, o: 611, p: 611, q: 611, r: 389, s: 556, t: 333,
  u: 611, v: 556, w: 778, x: 556, y: 556, z: 500,
  "{": 389, "|": 280, "}": 389, "~": 584,
  "¡": 333, "¿": 611, "«": 556, "»": 556, "“": 500, "”": 500, "‘": 278, "’": 278,
  "–": 556, "—": 1000, "°": 400, "€": 556,
};

for (const tabla of [ANCHOS_NORMAL, ANCHOS_NEGRITA]) {
  for (const d of "0123456789") tabla[d] = tabla === ANCHOS_NORMAL ? 556 : 556;
  /* Las vocales con tilde y la ñ miden lo mismo que su letra sin tilde. */
  const iguales = [["á", "a"], ["é", "e"], ["í", "i"], ["ó", "o"], ["ú", "u"], ["ü", "u"],
    ["ñ", "n"], ["Á", "A"], ["É", "E"], ["Í", "I"], ["Ó", "O"], ["Ú", "U"], ["Ñ", "N"]];
  for (const [con, sin] of iguales) tabla[con] = tabla[sin];
}

const ANCHO_DESCONOCIDO = 556;

export function anchoDe(texto, { negrita = false, tamano = 11 } = {}) {
  const tabla = negrita ? ANCHOS_NEGRITA : ANCHOS_NORMAL;
  let total = 0;
  for (const letra of String(texto)) total += tabla[letra] ?? ANCHO_DESCONOCIDO;
  return (total * tamano) / 1000;
}

/* Los caracteres que WinAnsi pone fuera de Latin-1, en el hueco 128-159. Son justo los
   que usa el texto de la carta: las comillas curvas de "Reserva" y de "Inmueble". */
const FUERA_DE_LATIN1 = {
  "€": 0x80, "‚": 0x82, "ƒ": 0x83, "„": 0x84, "…": 0x85, "†": 0x86, "‡": 0x87,
  "ˆ": 0x88, "‰": 0x89, "Š": 0x8a, "‹": 0x8b, "Œ": 0x8c, "Ž": 0x8e, "‘": 0x91,
  "’": 0x92, "“": 0x93, "”": 0x94, "•": 0x95, "–": 0x96, "—": 0x97, "˜": 0x98,
  "™": 0x99, "š": 0x9a, "›": 0x9b, "œ": 0x9c, "ž": 0x9e, "Ÿ": 0x9f,
};

/* Un byte por letra, escapando lo que en un PDF significa otra cosa. Lo que no entra en
   WinAnsi se reemplaza por "?" en vez de romper el archivo. */
function comoCadenaPDF(texto) {
  const bytes = [0x28]; // (
  for (const letra of String(texto)) {
    let codigo = FUERA_DE_LATIN1[letra];
    if (codigo === undefined) {
      const punto = letra.codePointAt(0);
      codigo = punto <= 0xff ? punto : 0x3f;
    }
    if (codigo === 0x28 || codigo === 0x29 || codigo === 0x5c) bytes.push(0x5c);
    bytes.push(codigo);
  }
  bytes.push(0x29); // )
  return bytes;
}

const numero = (n) => (Math.round(n * 100) / 100).toString();

/* Cuanto mide un JPEG, leyendo su propia cabecera.

   El PDF necesita el tamaño en pixeles y cuantos colores tiene para poder incrustarlo.
   Se lee del archivo en vez de escribirlo a mano: si un dia la oficina cambia el
   membrete por otro de otro tamaño, sigue andando sin tocar el codigo. */
export function medirJpeg(bytes) {
  let i = 2;
  while (i + 9 < bytes.length) {
    if (bytes[i] !== 0xff) { i += 1; continue; }
    const marca = bytes[i + 1];
    // Los SOF son los que declaran el tamaño. Se saltean el 0xC4, 0xC8 y 0xCC, que no lo son.
    if (marca >= 0xc0 && marca <= 0xcf && marca !== 0xc4 && marca !== 0xc8 && marca !== 0xcc) {
      return {
        alto: (bytes[i + 5] << 8) | bytes[i + 6],
        ancho: (bytes[i + 7] << 8) | bytes[i + 8],
        colores: bytes[i + 9],
      };
    }
    i += 2 + ((bytes[i + 2] << 8) | bytes[i + 3]);
  }
  return null;
}

export function nuevo({ ancho = A4.ancho, alto = A4.alto } = {}) {
  const hojas = [[]];
  const imagenes = [];
  const enlaces = [[]];
  let actual = 0;

  const orden = (partes) => hojas[actual].push(partes.join(" "));

  const doc = {
    ancho,
    alto,

    hoja() {
      hojas.push([]);
      enlaces.push([]);
      actual = hojas.length - 1;
      return doc;
    },

    /* Una zona de la hoja que se puede tocar y abre una direccion, como en una pagina
       web. Es lo que deja mandar UN archivo prolijo por WhatsApp en vez de un enlace
       larguisimo a la vista: el enlace va adentro del PDF.

       Ojo: algunos visores —el de adentro de WhatsApp, por ejemplo— no dejan tocar
       enlaces. Ahi hay que abrir el PDF con el visor del telefono. */
    enlace(url, { x, y, ancho: anchoCaja, alto: altoCaja }) {
      enlaces[actual].push({ url, x, y: alto - y - altoCaja, ancho: anchoCaja, alto: altoCaja });
      return doc;
    },

    /* `y` se mide desde ARRIBA, que es como se piensa una hoja. El PDF la mide desde
       abajo, y la cuenta se hace aca una sola vez. */
    texto(x, y, contenido, { negrita = false, tamano = 11, espacioExtra = 0, color } = {}) {
      const cadena = comoCadenaPDF(contenido);
      const tinta = color === "blanco" ? "1 g " : "";
      const cabeza = `BT ${tinta}/${negrita ? "F2" : "F1"} ${numero(tamano)} Tf `
        + `${numero(espacioExtra)} Tw ${numero(x)} ${numero(alto - y)} Td `;
      hojas[actual].push({ cabeza, cadena, cola: " Tj ET 0 g" });
      return doc;
    },

    linea(x1, y1, x2, y2, grosor = 0.8) {
      orden([numero(grosor), "w", numero(x1), numero(alto - y1), "m",
        numero(x2), numero(alto - y2), "l", "S"]);
      return doc;
    },

    /* `color` en gris (0 negro, 1 blanco) o [r,g,b] de 0 a 1. Sin color, negro. */
    rectangulo(x, y, anchoRect, altoRect, color) {
      const partes = [];
      if (Array.isArray(color)) partes.push(...color.map(numero), "rg");
      else if (color !== undefined) partes.push(numero(color), "g");
      partes.push(numero(x), numero(alto - y - altoRect), numero(anchoRect), numero(altoRect),
        "re", "f");
      if (color !== undefined) partes.push("0 g");    // vuelve a negro para lo que siga
      orden(partes);
      return doc;
    },

    /* Una lista de puntos como un solo trazo continuo. Asi entran las firmas dibujadas
       con el dedo: como trazo de verdad, nitido a cualquier zoom. */
    trazo(puntos, grosor = 1.2) {
      if (!puntos || puntos.length < 2) return doc;
      const partes = [numero(grosor), "w", "1 J", "1 j"];
      puntos.forEach((p, i) => {
        partes.push(numero(p.x), numero(alto - p.y), i === 0 ? "m" : "l");
      });
      partes.push("S");
      orden(partes);
      return doc;
    },

    /* Un JPEG, tal cual viene. El PDF sabe leer JPEG de fabrica (`/DCTDecode`), asi que
       no hay que descomprimirlo ni volverlo a comprimir: entran los mismos bytes del
       archivo. Por eso el membrete de la oficina va como JPEG y no como PNG. */
    imagen(bytes, { x, y, ancho: anchoCaja, alto: altoCaja }) {
      const medida = medirJpeg(bytes);
      if (!medida) return doc;
      let cual = imagenes.findIndex((i) => i.bytes === bytes);
      if (cual < 0) {
        imagenes.push({ bytes, ...medida });
        cual = imagenes.length - 1;
      }
      orden(["q", numero(anchoCaja), "0 0", numero(altoCaja),
        numero(x), numero(alto - y - altoCaja), "cm", `/Im${cual + 1}`, "Do", "Q"]);
      return doc;
    },

    bytes() {
      return escribir(hojas, imagenes, enlaces, ancho, alto);
    },

    aBlob() {
      return new Blob([escribir(hojas, imagenes, enlaces, ancho, alto)], { type: "application/pdf" });
    },
  };

  return doc;
}

function escribir(hojas, imagenes, enlaces, ancho, alto) {
  const salida = [];
  const agregarTexto = (t) => {
    for (const letra of t) salida.push(letra.charCodeAt(0) & 0xff);
  };
  const agregarBytes = (b) => salida.push(...b);

  agregarTexto("%PDF-1.4\n");

  /* 1 catalogo, 2 el arbol de hojas, 3 y 4 las fuentes, y despues cada hoja con su
     contenido: dos objetos por hoja. */
  const primeraHoja = 5;
  const objetos = [];

  const anotar = (i, cuerpoTexto, cuerpoBytes) => {
    objetos[i] = salida.length;
    agregarTexto(`${i} 0 obj\n`);
    if (cuerpoBytes) agregarBytes(cuerpoBytes);
    else agregarTexto(cuerpoTexto);
    agregarTexto("\nendobj\n");
  };

  const idsHojas = hojas.map((_, i) => primeraHoja + i * 2);
  const primeraImagen = primeraHoja + hojas.length * 2;
  const idsImagenes = imagenes.map((_, i) => primeraImagen + i);
  /* Cada enlace es un objeto aparte, y la hoja los nombra en su /Annots. */
  const primerEnlace = primeraImagen + imagenes.length;
  let siguienteEnlace = primerEnlace;
  const idsPorHoja = enlaces.map((deLaHoja) => deLaHoja.map(() => siguienteEnlace++));
  /* Todas las imagenes se declaran en TODAS las hojas. Es una linea de mas en cada una y
     evita llevar la cuenta de cual hoja usa cual; el peso esta en el JPEG, no en esto. */
  const recursoImagenes = imagenes.length
    ? ` /XObject << ${idsImagenes.map((id, i) => `/Im${i + 1} ${id} 0 R`).join(" ")} >>`
    : "";

  anotar(1, "<< /Type /Catalog /Pages 2 0 R >>");
  anotar(2, `<< /Type /Pages /Kids [${idsHojas.map((i) => `${i} 0 R`).join(" ")}] `
    + `/Count ${hojas.length} >>`);
  anotar(3, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  anotar(4, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");

  hojas.forEach((ordenes, i) => {
    const idHoja = primeraHoja + i * 2;
    const idContenido = idHoja + 1;

    const flujo = [];
    for (const orden of ordenes) {
      if (typeof orden === "string") {
        for (const letra of orden) flujo.push(letra.charCodeAt(0) & 0xff);
      } else {
        for (const letra of orden.cabeza) flujo.push(letra.charCodeAt(0) & 0xff);
        flujo.push(...orden.cadena);
        for (const letra of orden.cola) flujo.push(letra.charCodeAt(0) & 0xff);
      }
      flujo.push(0x0a);
    }

    anotar(idHoja, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${ancho} ${alto}] `
      + `/Resources << /Font << /F1 3 0 R /F2 4 0 R >>${recursoImagenes} >> `
      + `/Contents ${idContenido} 0 R`
      + (idsPorHoja[i].length
        ? ` /Annots [${idsPorHoja[i].map((id) => `${id} 0 R`).join(" ")}]` : "")
      + " >>");

    objetos[idContenido] = salida.length;
    agregarTexto(`${idContenido} 0 obj\n<< /Length ${flujo.length} >>\nstream\n`);
    agregarBytes(flujo);
    agregarTexto("endstream\nendobj\n");
  });

  imagenes.forEach((imagen, i) => {
    const id = idsImagenes[i];
    objetos[id] = salida.length;
    agregarTexto(`${id} 0 obj
<< /Type /XObject /Subtype /Image `
      + `/Width ${imagen.ancho} /Height ${imagen.alto} `
      + `/ColorSpace /Device${imagen.colores === 1 ? "Gray" : "RGB"} /BitsPerComponent 8 `
      + `/Filter /DCTDecode /Length ${imagen.bytes.length} >>\nstream\n`);
    agregarBytes(imagen.bytes);
    agregarTexto("\nendstream\nendobj\n");
  });

  enlaces.forEach((deLaHoja, hoja) => {
    deLaHoja.forEach((e, i) => {
      const id = idsPorHoja[hoja][i];
      objetos[id] = salida.length;
      /* /Border [0 0 0] para que el lector no le dibuje un recuadro encima: el boton ya
         esta pintado en la hoja. */
      agregarTexto(`${id} 0 obj
<< /Type /Annot /Subtype /Link `
        + `/Rect [${numero(e.x)} ${numero(e.y)} ${numero(e.x + e.ancho)} ${numero(e.y + e.alto)}] `
        + "/Border [0 0 0] /A << /S /URI /URI ");
      agregarBytes(comoCadenaPDF(e.url));
      agregarTexto(" >> >>\nendobj\n");
    });
  });

  const cuantos = siguienteEnlace;
  const inicioTabla = salida.length;
  agregarTexto(`xref\n0 ${cuantos}\n0000000000 65535 f \n`);
  for (let i = 1; i < cuantos; i++) {
    agregarTexto(`${String(objetos[i] ?? 0).padStart(10, "0")} 00000 n \n`);
  }
  agregarTexto(`trailer\n<< /Size ${cuantos} /Root 1 0 R >>\nstartxref\n${inicioTabla}\n%%EOF\n`);

  return new Uint8Array(salida);
}
