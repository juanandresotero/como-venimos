import { test } from "node:test";
import assert from "node:assert/strict";
import { ORDENES, ordenar } from "../vistas/negocios.js";

const n = (x) => ({ id: "x", direccion: "", ...x });

/* La fecha va partida en dos: "por fecha" a secas no decia si era la de cierre o la de
   publicacion, y son dos preguntas distintas. */
test("los cinco criterios existen y tienen nombre", () => {
  assert.equal(ORDENES.length, 5);
  assert.deepEqual(ORDENES.map((o) => o.clave),
    ["cierre", "inicio", "ticket", "ganancia", "direccion"]);
  assert.ok(ORDENES.every((o) => o.nombre.length > 2));
});

test("por fecha de cierre: lo ultimo que cerraste arriba", () => {
  const lista = ordenar([
    n({ id: "viejo", fecha_fin: "2023-01-01" }),
    n({ id: "nuevo", fecha_fin: "2026-08-01" }),
    n({ id: "medio", fecha_fin: "2025-05-01" }),
  ], "cierre");
  assert.deepEqual(lista.map((x) => x.id), ["nuevo", "medio", "viejo"]);
});

/* Son dos preguntas distintas y tienen que dar distinto: el que cerro ultimo puede ser el
   que se publico primero. */
test("por fecha de publicacion ordena por otra cosa que por la de cierre", () => {
  const datos = [
    n({ id: "viejo-largo", fecha_inicio: "2024-01-01", fecha_fin: "2026-08-01" }),
    n({ id: "nuevo-rapido", fecha_inicio: "2026-07-01", fecha_fin: "2026-07-15" }),
  ];
  assert.deepEqual(ordenar(datos, "cierre").map((x) => x.id), ["viejo-largo", "nuevo-rapido"]);
  assert.deepEqual(ordenar(datos, "inicio").map((x) => x.id), ["nuevo-rapido", "viejo-largo"]);
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

test("un negocio sin cerrar cae al final del orden por cierre, no arriba", () => {
  const lista = ordenar([
    n({ id: "encurso", fecha_inicio: "2026-08-01" }),
    n({ id: "cerrado", fecha_fin: "2024-01-01" }),
  ], "cierre");
  assert.deepEqual(lista.map((x) => x.id), ["cerrado", "encurso"]);
});

test("un criterio inventado cae en fecha y no deja la lista vacia", () => {
  const datos = [n({ id: "a", fecha_fin: "2024-01-01" }), n({ id: "b", fecha_fin: "2026-01-01" })];
  assert.deepEqual(ordenar(datos, "loquesea").map((x) => x.id), ["b", "a"]);   // cae en cierre
});

test("ordenar no toca la lista que recibe", () => {
  const original = [n({ id: "a", fecha_fin: "2024-01-01" }), n({ id: "b", fecha_fin: "2026-01-01" })];
  ordenar(original, "cierre");
  assert.deepEqual(original.map((x) => x.id), ["a", "b"]);
});
