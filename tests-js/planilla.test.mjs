/* La planilla para mirar los datos afuera de la app. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { celda, aCsv, negociosACsv, carteraACsv, nombrePlanilla } from "../lib/planilla.js";

test("las celdas van entrecomilladas y las comillas de adentro se duplican", () => {
  assert.equal(celda('Casa "grande"'), '"Casa ""grande"""');
  assert.equal(celda("Maroñas"), '"Maroñas"');
});

/* Excel toma por formula todo lo que empieza con = + - o @. Una direccion no es formula. */
test("una direccion que arranca con signo no se convierte en formula", () => {
  assert.equal(celda("-Gutenberg 6100"), `"'-Gutenberg 6100"`);
  assert.equal(celda("=SUMA(A1)"), `"'=SUMA(A1)"`);
});

test("los numeros van con coma decimal, como los lee Excel en español", () => {
  assert.equal(celda(1234.5), "1234,5");
  assert.equal(celda(1000), "1000");
});

test("vacio es vacio y no la palabra null", () => {
  assert.equal(celda(null), "");
  assert.equal(celda(undefined), "");
});

test("los booleanos se leen en criollo", () => {
  assert.equal(celda(true), '"sí"');
  assert.equal(celda(false), '"no"');
});

test("el archivo arranca con el BOM y separa con punto y coma", () => {
  const csv = aCsv([{ nombre: "A", valor: (x) => x.a }], [{ a: 1 }]);
  assert.ok(csv.startsWith("\uFEFF"), "sin el BOM los acentos se ven rotos en Excel");
  assert.ok(csv.includes(";") || csv.split("\r\n")[0] === '\uFEFF"A"');
  assert.ok(csv.endsWith("\r\n"));
});

test("una fila por negocio, mas la cabecera", () => {
  const negocios = JSON.parse(
    readFileSync(new URL("../datos/negocios.json", import.meta.url), "utf8")
  );
  const lineas = negociosACsv(negocios).trim().split("\r\n");
  assert.equal(lineas.length, negocios.length + 1);
  assert.ok(lineas[0].includes("Ganancia"));
  assert.ok(lineas[0].includes("Facturación RE/MAX"), "las dos cifras, siempre");
});

test("la cartera tambien sale, con lo que carga el usuario y lo que ve el robot", () => {
  const cartera = JSON.parse(
    readFileSync(new URL("../datos/cartera.json", import.meta.url), "utf8")
  );
  const lineas = carteraACsv(cartera).trim().split("\r\n");
  assert.equal(lineas.length, Object.keys(cartera).length + 1);
  assert.ok(lineas[0].includes("De dónde salió"));
});

test("sin datos igual sale la cabecera y no revienta", () => {
  assert.ok(negociosACsv(null).includes("Ganancia"));
  assert.ok(carteraACsv(null).includes("Dirección"));
});

test("el nombre del archivo dice que es y de cuando", () => {
  assert.equal(nombrePlanilla("negocios", "2026-08-17"), "como-venimos-negocios-2026-08-17.csv");
});
