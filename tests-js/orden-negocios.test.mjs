import { test } from "node:test";
import assert from "node:assert/strict";
import { ORDENES, ordenar } from "../vistas/negocios.js";

const n = (x) => ({ id: "x", direccion: "", ...x });

test("los cuatro criterios existen y tienen nombre", () => {
  assert.equal(ORDENES.length, 4);
  assert.deepEqual(ORDENES.map((o) => o.clave), ["fecha", "ticket", "ganancia", "direccion"]);
});

test("por fecha: lo mas reciente arriba", () => {
  const lista = ordenar([
    n({ id: "viejo", fecha_fin: "2023-01-01" }),
    n({ id: "nuevo", fecha_fin: "2026-08-01" }),
    n({ id: "medio", fecha_fin: "2025-05-01" }),
  ], "fecha");
  assert.deepEqual(lista.map((x) => x.id), ["nuevo", "medio", "viejo"]);
});

test("por ticket y por ganancia: lo mas grande arriba", () => {
  const datos = [n({ id: "a", precio_operacion: 100000, ganancia: 500 }),
    n({ id: "b", precio_operacion: 250000, ganancia: 100 })];
  assert.deepEqual(ordenar(datos, "ticket").map((x) => x.id), ["b", "a"]);
  assert.deepEqual(ordenar(datos, "ganancia").map((x) => x.id), ["a", "b"]);
});

test("por direccion va de la A a la Z, al reves que la plata", () => {
  const lista = ordenar([
    n({ id: "z", direccion: "Zorrilla 100" }),
    n({ id: "a", direccion: "Ansina 200" }),
  ], "direccion");
  assert.deepEqual(lista.map((x) => x.id), ["a", "z"]);
});

/* Un negocio sin precio no es "el mas barato": no tiene precio. Si se ordenara como 0 se
   apilarian todos arriba en el orden ascendente y abajo en el descendente, tapando lo que
   se vino a mirar. */
test("los que no tienen el dato caen al final, no se mezclan con los ceros", () => {
  const lista = ordenar([
    n({ id: "sin" }),
    n({ id: "caro", precio_operacion: 300000 }),
    n({ id: "barato", precio_operacion: 1000 }),
  ], "ticket");
  assert.deepEqual(lista.map((x) => x.id), ["caro", "barato", "sin"]);
});

test("sin fecha de firma se usa la de inicio antes de darlo por vacio", () => {
  const lista = ordenar([
    n({ id: "sinnada" }),
    n({ id: "encurso", fecha_inicio: "2026-08-01" }),
  ], "fecha");
  assert.deepEqual(lista.map((x) => x.id), ["encurso", "sinnada"]);
});

test("un criterio inventado cae en fecha y no deja la lista vacia", () => {
  const datos = [n({ id: "a", fecha_fin: "2024-01-01" }), n({ id: "b", fecha_fin: "2026-01-01" })];
  assert.deepEqual(ordenar(datos, "loquesea").map((x) => x.id), ["b", "a"]);
});

test("ordenar no toca la lista que recibe", () => {
  const original = [n({ id: "a", fecha_fin: "2024-01-01" }), n({ id: "b", fecha_fin: "2026-01-01" })];
  ordenar(original, "fecha");
  assert.deepEqual(original.map((x) => x.id), ["a", "b"]);
});
