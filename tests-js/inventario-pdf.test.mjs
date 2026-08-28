/* El inventario armado en hojas. Es el documento que se firma, así que lo que se prueba acá
   no es "que salga": es que salga PROLIJO. Juan lo pidió así — "hagámoslo mucho más prolijo
   de lo que ya hay". */

import { test } from "node:test";
import assert from "node:assert/strict";
import { armarPDF, nombreArchivo, enRenglones } from "../lib/inventario-pdf.js";
import { nuevoInventario, nuevoAmbiente, AVISO_RECLAMO } from "../lib/inventario.js";

const texto = (bytes) => Buffer.from(bytes).toString("latin1");
const paginas = (t) => Number((t.match(/\/Count\s+(\d+)/) || [])[1]);

const conAmbientes = (...tipos) => {
  const inv = nuevoInventario("2026-05-30");
  inv.direccion = "Leyenda Patria 2914";
  inv.unidad = "1001";
  inv.aviso_reclamo = AVISO_RECLAMO;
  inv.ambientes = tipos.map((t) => nuevoAmbiente(t));
  return inv;
};

/* ---------- Cortar el texto ---------- */

/* Una palabra partida al medio en un documento que se firma se lee como un error de la app. */
test("no parte palabras", () => {
  const renglones = enRenglones("Falta encerado y plastificado antes de la firma", 80);
  assert.ok(renglones.length > 1, "con 80 puntos no entra en uno solo");
  assert.ok(renglones.every((r) => !r.startsWith(" ")));
  assert.equal(renglones.join(" "), "Falta encerado y plastificado antes de la firma");
});

test("un texto vacío es un renglón vacío, no cero renglones", () => {
  assert.deepEqual(enRenglones("", 200), [""]);
  assert.deepEqual(enRenglones(null, 200), [""]);
});

/* ---------- Las hojas ---------- */

/* EL MOTOR DE PDF YA VIENE CON UNA HOJA ABIERTA. Pedirle una antes de dibujar dejaba la
   primera en blanco, y un documento que se firma con una hoja vacía adelante es exactamente
   lo que no puede pasar. Pasó de verdad y sólo se vio abriendo el archivo. */
test("no hay una hoja en blanco al principio", () => {
  const { doc, hojas } = armarPDF(conAmbientes("living"));
  assert.equal(paginas(texto(doc.bytes())), hojas);
});

test("un inventario largo ocupa varias hojas y todas tienen contenido", () => {
  const { doc, hojas } = armarPDF(conAmbientes(
    "living", "recibidor", "dormitorio", "dormitorio", "dormitorio",
    "bano", "bano_suite", "bano_servicio", "cocina", "pasillo", "terraza"));
  assert.ok(hojas >= 5, `un inventario de once ambientes no entra en cuatro hojas (dio ${hojas})`);
  assert.equal(paginas(texto(doc.bytes())), hojas);
});

/* LA CANTIDAD DE HOJAS SE CUENTA SOLA. Es el punto 4 de las cláusulas, que hoy escribe a mano
   y por eso a veces queda mal. El número no se sabe hasta terminar de dibujar. */
test("la cláusula dice la cantidad de hojas de verdad", () => {
  const { doc, hojas } = armarPDF(conAmbientes("living", "cocina", "dormitorio", "bano"));
  const t = texto(doc.bytes());
  assert.ok(t.includes(`formado por ${hojas} hojas`), "tiene que decir el número real");
  assert.ok(!t.includes("{HOJAS}"), "la marca no puede quedar impresa");
});

/* ---------- Lo que dice ---------- */

test("el encabezado lleva la propiedad y la fecha", () => {
  const t = texto(armarPDF(conAmbientes("living")).doc.bytes());
  assert.ok(t.includes("Inventario del inmueble"));
  assert.ok(t.includes("Leyenda Patria 2914 apto 1001"));
  assert.ok(t.includes("2026-05-30"));
});

test("cada ambiente lleva su título y sus cosas", () => {
  const t = texto(armarPDF(conAmbientes("cocina")).doc.bytes());
  assert.ok(t.includes("COCINA"));
  assert.ok(t.includes("Conexi"), "los ítems de la cocina tienen que estar");
});

/* Lo que se marcó como "no tiene" no se imprime: una fila que dice "no tiene" en un
   inventario es una fila que hay que leer para descubrir que no dice nada. */
test("lo que no tiene no se imprime", () => {
  const inv = conAmbientes("living");
  const item = inv.ambientes[0].items.find((i) => i.nombre === "Ventanal");
  item.estado = "no_tiene";
  assert.ok(!texto(armarPDF(inv).doc.bytes()).includes("Ventanal"));
});

test("un ambiente que quedó sin nada no deja un título huérfano", () => {
  const inv = conAmbientes("living", "terraza");
  for (const i of inv.ambientes[1].items) i.estado = "no_tiene";
  const t = texto(armarPDF(inv).doc.bytes());
  assert.ok(!t.includes("TERRAZA"));
  assert.ok(t.includes("LIVING COMEDOR"));
});

test("el detalle escrito sale impreso entero", () => {
  const inv = conAmbientes("terraza");
  const toldos = inv.ambientes[0].items.find((i) => i.nombre === "Toldos");
  toldos.estado = "malo";
  toldos.detalle = "Con hongos, mecanismo roto";
  const t = texto(armarPDF(inv).doc.bytes());
  assert.ok(t.includes("Con hongos, mecanismo roto"));
});

test("el nombre del archivo se puede guardar en cualquier lado", () => {
  const nombre = nombreArchivo({
    direccion: "Leyenda Patria 2914", unidad: "1001", barrio: "Punta Carretas",
    fecha: "2026-05-30",
  });
  assert.match(nombre, /\.pdf$/);
  assert.ok(!/[\/:*?"<>|]/.test(nombre), "esos caracteres no valen en un nombre de archivo");
});

test("uno vacío no rompe: sale igual, con lo que haya", () => {
  const { doc, hojas } = armarPDF({ ambientes: [] });
  assert.equal(hojas, 1);
  assert.ok(texto(doc.bytes()).includes("Inventario del inmueble"));
});
