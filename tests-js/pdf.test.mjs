import { test } from "node:test";
import assert from "node:assert/strict";
import { nuevo, anchoDe, A4 } from "../lib/pdf.js";
import { armarPDF, cortarEnRenglones, espacioParaJustificar } from "../lib/carta-pdf.js";
import { armar } from "../lib/carta-oferta.js";
import { deTrazos, aBytes } from "../lib/firma.js";

/* Un byte, una letra. NO se usa TextDecoder("latin1"): ese alias es windows-1252, que
   traduce el byte 0x93 a la comilla curva y hace imposible ver los bytes de verdad. */
const texto = (bytes) => Array.from(bytes, (b) => String.fromCharCode(b)).join("");

test("el archivo arranca y termina como un PDF", () => {
  const t = texto(nuevo().texto(50, 50, "hola").bytes());
  assert.match(t, /^%PDF-1\.4\n/);
  assert.match(t, /%%EOF\n$/);
});

/* La tabla xref es lo que hace que un PDF abra o no: dice en que byte empieza cada
   objeto. Un solo numero corrido y el lector dice "archivo dañado". */
test("la tabla xref apunta al byte exacto de cada objeto", () => {
  const bytes = nuevo().texto(50, 50, "hola").hoja().texto(50, 50, "chau").bytes();
  const t = texto(bytes);
  // lastIndexOf("xref") encontraria el que esta adentro de "startxref".
  const tabla = t.slice(t.lastIndexOf("\nxref\n") + 1);
  const cuantos = Number(/xref\n0 (\d+)/.exec(tabla)[1]);
  const posiciones = [...tabla.matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
  assert.equal(posiciones.length, cuantos - 1, "una fila por objeto, menos el cero");
  posiciones.forEach((donde, i) => {
    assert.match(t.slice(donde, donde + 12), new RegExp(`^${i + 1} 0 obj`),
      `el objeto ${i + 1} no esta donde dice la tabla`);
  });
});

test("startxref apunta al arranque de la tabla", () => {
  const t = texto(nuevo().texto(50, 50, "hola").bytes());
  const donde = Number(/startxref\n(\d+)/.exec(t)[1]);
  assert.equal(t.slice(donde, donde + 4), "xref");
});

test("cada hoja pedida es una hoja del PDF", () => {
  const t = texto(nuevo().texto(10, 10, "a").hoja().texto(10, 10, "b").hoja().texto(10, 10, "c").bytes());
  assert.match(t, /\/Count 3/);
  assert.equal((t.match(/\/Type \/Page[^s]/g) || []).length, 3);
});

/* Sin WinAnsi los acentos salen como simbolos raros o rompen el archivo. */
test("los acentos, la ñ y las comillas curvas se escriben en WinAnsi", () => {
  const bytes = nuevo().texto(10, 10, "Maroñas “Reserva” está a 5° ¿sí?").bytes();
  const t = texto(bytes);
  assert.match(t, /\/Encoding \/WinAnsiEncoding/);
  assert.ok(t.includes("Maro\xF1as"), "la ñ va como un solo byte 0xF1");
  assert.ok(t.includes("\x93Reserva\x94"), "las comillas curvas son 0x93 y 0x94");
  assert.ok(t.includes("est\xE1"), "la a con tilde es 0xE1");
  assert.ok(t.includes("\xBFs\xED?"), "el signo de apertura es 0xBF");
});

test("los parentesis del texto no cierran la cadena del PDF", () => {
  const t = texto(nuevo().texto(10, 10, "cinco (5) y un \\ suelto").bytes());
  assert.ok(t.includes("cinco \\(5\\) y un \\\\ suelto"));
});

test("el largo declarado del contenido es el largo real", () => {
  const t = texto(nuevo().texto(10, 10, "Maroñas (x)").bytes());
  const m = /<< \/Length (\d+) >>\nstream\n/.exec(t);
  const desde = m.index + m[0].length;
  assert.equal(t.slice(desde, desde + Number(m[1])).length, Number(m[1]));
  assert.equal(t.slice(desde + Number(m[1]), desde + Number(m[1]) + 9), "endstream");
});

test("anchoDe mide con la tabla de Adobe, no a ojo", () => {
  assert.equal(anchoDe("i", { tamano: 1000 }), 222);
  assert.equal(anchoDe("W", { tamano: 1000 }), 944);
  assert.equal(anchoDe(" ", { tamano: 1000 }), 278);
  assert.equal(anchoDe("á", { tamano: 1000 }), anchoDe("a", { tamano: 1000 }));
  assert.equal(anchoDe("ñ", { tamano: 1000 }), anchoDe("n", { tamano: 1000 }));
  assert.ok(anchoDe("M", { negrita: true, tamano: 100 }) >= anchoDe("M", { tamano: 100 }));
});

// ------------------------------------------------------- acomodar la carta

test("ningun renglon se pasa del ancho", () => {
  const largo = "PRIMERO: OBJETO. La parte OFERENTE ofrece comprar para sí o para el "
    + "tercero que indique, libre de ocupantes, hipotecas, embargos y demás gravámenes.";
  /* El tamaño tiene que ser el MISMO con el que se cortó: cortarEnRenglones usa el del
     cuerpo de la carta por defecto, y medir con otro da un resultado que no significa nada. */
  const TAMANO = 10;
  for (const palabras of cortarEnRenglones(largo, 400, TAMANO)) {
    assert.ok(anchoDe(palabras.join(" "), { tamano: TAMANO }) <= 400,
      `se paso: ${palabras.join(" ")}`);
  }
});

test("no se pierde ni se repite una palabra al cortar", () => {
  const original = "una carta oferta que se corta en varios renglones sin perder nada";
  assert.equal(cortarEnRenglones(original, 120).flat().join(" "), original);
});

test("una palabra sola mas larga que el renglon no cuelga la cuenta", () => {
  const r = cortarEnRenglones("supercalifragilisticoespialidoso", 20);
  assert.equal(r.length, 1);
});

/* Si el ultimo renglon se justificara, un parrafo que termina en dos palabras las
   mandaria a cada punta de la hoja. */
test("justificar reparte lo que sobra entre los espacios", () => {
  const palabras = ["uno", "dos", "tres"];
  const extra = espacioParaJustificar(palabras, 400, 10.5);
  const medida = palabras.reduce((n, p) => n + anchoDe(p, { tamano: 10.5 }), 0)
    + 2 * (anchoDe(" ", { tamano: 10.5 }) + extra);
  assert.ok(Math.abs(medida - 400) < 0.01, `el renglon quedo en ${medida}`);
  assert.equal(espacioParaJustificar(["sola"], 400), 0, "una palabra no se estira");
});

// ------------------------------------------------------- la carta entera

const VALORES = {
  nombre: "Juan Pérez", cedula: "1.234.567-8", telefono: "099123456",
  correo: "juan@mail.com", padron: "62295", calle: "Pantaleón Pérez 4782",
  barrio: "Maroñas", departamento: "Montevideo", precio: 134000,
  dias_reserva: 15, dias_validez: 5, fecha_oferta: "2026-08-19",
};

test("la carta entera sale en dos hojas y con su texto adentro", () => {
  const doc = armarPDF(armar(VALORES, [], { agente: "Juan Andrés Otero" }));
  const t = texto(doc.bytes());
  assert.match(t, /\/Count 2/, "las dos hojas del Word");
  assert.ok(t.includes("OFERTA DE COMPRA"));
  assert.ok(t.includes("ACEPTACI\xD3N"));
  assert.ok(t.includes("DEPOSITARIO"));
  assert.ok(t.includes("En representaci\xF3n de RE/MAX"));
  assert.ok(t.includes("Juan Andr\xE9s Otero"));
});

test("una firma dibujada entra al PDF como trazo, no como imagen", () => {
  const firma = deTrazos([[{ x: 10, y: 20 }, { x: 60, y: 80 }, { x: 120, y: 30 }]]);
  const t = texto(armarPDF(armar(VALORES, []), { oferente: aBytes(firma) }).bytes());
  assert.match(t, / m\n?| l /, "hay ordenes de trazo");
  assert.ok(!t.includes("/Image"), "nada de imagenes incrustadas");
});

test("sin firmas el PDF igual sale, con los renglones vacios para firmar a mano", () => {
  const t = texto(armarPDF(armar(VALORES, [])).bytes());
  assert.match(t, /%%EOF/);
  assert.ok(t.includes("OFERENTE"));
});

test("una carta sin ningun dato tampoco rompe", () => {
  assert.doesNotThrow(() => armarPDF(armar({}, [])).bytes());
});

test("el archivo se llama por la direccion, para no tener veinte 'oferta.pdf'", async () => {
  const { nombreDelArchivo } = await import("../lib/carta-pdf.js");
  assert.match(nombreDelArchivo(VALORES), /^Oferta de compra — Pantaleón Pérez 4782\.pdf$/);
  assert.match(nombreDelArchivo({}), /sin dirección/);
});

/* LA CARTA TIENE QUE ENTRAR EN DOS HOJAS, SIEMPRE.

   Al agregar la seña el SEGUNDO creció dos renglones, las firmas del oferente y del
   depositario no entraron abajo de la primera hoja y salió una tercera hoja suelta con dos
   rayas. El usuario lo vio enseguida. Este test cuenta las hojas con la carta MÁS LLENA
   posible: si un día alguien agrega un párrafo, falla acá y no en el teléfono. */
const TODO_LLENO = {
  nombre: "Diego Acosta Fernández", cedula: "3.456.789-0", telefono: "099 123 456",
  correo: "diego.acosta@mail.com", padron: "62295", calle: "Dr. Pantaleón Pérez 4782",
  barrio: "Maroñas", departamento: "Montevideo", precio: 134000, sena: 500,
  dias_reserva: 15, dias_validez: 5, fecha_oferta: "2026-08-19",
  propietario_nombre: "Ana María Gómez Rodríguez", propietario_cedula: "2.345.678-9",
  propietario_domicilio: "Avenida Italia 1234 apto 502", fecha_aceptacion: "2026-08-25",
};

function cuantasHojas(bytes) {
  return Number(/\/Count (\d+)/.exec(texto(bytes))[1]);
}

test("la carta llena entra en DOS hojas, con o sin botón", () => {
  const bloques = armar(TODO_LLENO, [], { agente: "Juan Andrés Otero" });
  assert.equal(cuantasHojas(armarPDF(bloques).bytes()), 2, "sin botón");
  assert.equal(cuantasHojas(armarPDF(bloques, {}, null, "https://x.y/#abc", "comprador").bytes()),
    2, "con el botón de firmar");
});

/* Se mira HOJA POR HOJA y no el archivo entero: "ACEPTACIÓN" aparece también en la
   cláusula QUINTA de la primera hoja, así que cortar por esa palabra da cualquier cosa. */
function hojas(bytes) {
  const t = texto(bytes);
  const partes = [];
  let desde = 0;
  while (true) {
    const arranque = t.indexOf("stream\n", desde);
    if (arranque < 0) break;
    const fin = t.indexOf("endstream", arranque);
    if (fin < 0) break;
    partes.push(t.slice(arranque, fin));
    desde = fin + 9;
  }
  return partes;
}

test("las dos firmas de la primera hoja NO se van a una hoja suelta", () => {
  const [primera, segunda] = hojas(
    armarPDF(armar(TODO_LLENO, [], { agente: "Juan Andrés Otero" })).bytes());
  assert.ok(primera.includes("OFERENTE"), "el oferente firma en la primera hoja");
  assert.ok(primera.includes("DEPOSITARIO"), "y el depositario también");
  assert.ok(segunda.includes("PROPIETARIO/S"), "el propietario firma en la segunda");
});

/* Un botón azul impreso en un papel no sirve para nada. */
test("el PDF para imprimir va SIN el botón de firmar", () => {
  const t = texto(armarPDF(armar(TODO_LLENO, [])).bytes());
  assert.ok(!t.includes("Firmar en el celular"));
  assert.ok(!t.includes("/Subtype /Link"), "ni el enlace invisible");
});

test("el botón va al lado de la firma que le toca a cada parte", () => {
  const bloques = armar(TODO_LLENO, [], { agente: "Juan Andrés Otero" });
  for (const turno of ["comprador", "propietario"]) {
    const t = texto(armarPDF(bloques, {}, null, "https://x.y/#abc", turno).bytes());
    assert.ok(t.includes("Firmar en el celular"), turno);
    assert.equal((t.match(/Firmar en el celular/g) || []).length, 1,
      `${turno}: un solo botón, no uno por firma`);
  }
});

/* Si esa parte YA firmó, el botón no tiene sentido. */
test("si esa parte ya firmó, el botón no aparece", async () => {
  const { deTrazos, aBytes: firmaABytes } = await import("../lib/firma.js");
  const firma = firmaABytes(deTrazos([[{ x: 10, y: 20 }, { x: 90, y: 60 }]]));
  const bloques = armar(TODO_LLENO, [], {
    agente: "Juan Andrés Otero", firmadas: ["oferente"],
  });
  const t = texto(armarPDF(bloques, { oferente: firma }, null, "https://x.y/#abc", "comprador").bytes());
  assert.ok(!t.includes("Firmar en el celular"));
});
