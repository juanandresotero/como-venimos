/* Encontrar a que propiedad de la cartera corresponde un negocio. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalizar, partirDireccion, parecido, puntaje, sugerencias } from "../lib/cruce.js";

test("normalizar deja comparables dos formas de escribir lo mismo", () => {
  assert.equal(normalizar("Flammarión 5.000"), "flammarion 5 000");
  assert.equal(normalizar("  JUANA de Ibarbourou  "), "juana de ibarbourou");
});

test("partir separa el nombre de la calle del numero de puerta", () => {
  const r = partirDireccion("Juana de Ibarbourou 200 apto 4");
  assert.equal(r.calle, "juana ibarbourou");
  assert.deepEqual(r.numeros, ["200"]);
});

test("el parecido aguanta los errores de tipeo del Excel", () => {
  assert.ok(parecido("ibarburu", "ibarbourou") > 0.5);
  assert.ok(parecido("flamarrion", "flammarion") > 0.7);
  assert.equal(parecido("gutenberg", "gutenberg"), 1);
  assert.equal(parecido("garzon", "gutenberg"), 0);
});

/* El caso real: el Excel dice "juana de ibarburu" y RE/MAX "Juana de Ibarbourou 200". */
test("encuentra Juana de Ibarbourou pese a estar mal escrita y sin numero", () => {
  const s = sugerencias(
    { direccion: "juana de ibarburu" },
    { a: { entity_id: "a", direccion: "Juana de Ibarbourou 200" } }
  );
  assert.equal(s.length, 1);
  assert.equal(s[0].propiedad.entity_id, "a");
});

test("dos calles distintas no se sugieren nunca", () => {
  for (const [a, b] of [
    ["Garzon 1560", "Gutenberg 6100"],
    ["Grecia 3491", "Minas 1600"],
    ["b.v. argitas", "Camino Tomkinson 2200"],
    ["osvaldo martinez", "Ovidio Fernandez Rios 3900"],
  ]) {
    assert.ok(puntaje(a, b) < 0.62, `${a} no deberia sugerir ${b}: ${puntaje(a, b)}`);
  }
});

test("la misma calle con numero muy distinto pesa menos que con el mismo numero", () => {
  const igual = puntaje("Gutenberg 6100", "Gutenberg 6100");
  const lejos = puntaje("Gutenberg 100", "Gutenberg 6100");
  assert.equal(igual, 1);
  assert.ok(lejos < igual);
});

test("no se sugiere nada si ya esta enganchada", () => {
  const cartera = { a: { entity_id: "a", direccion: "Juana de Ibarbourou 200" } };
  assert.deepEqual(sugerencias({ direccion: "juana de ibarburu", entity_id_cartera: "a" }, cartera), []);
});

/* Si el usuario ya dijo que no es ninguna, no se le vuelve a preguntar en cada arranque. */
test("no se vuelve a sugerir despues de que el usuario dijo que no", () => {
  const cartera = { a: { entity_id: "a", direccion: "Juana de Ibarbourou 200" } };
  const negocio = { direccion: "juana de ibarburu", sin_propiedad_en_cartera: true };
  assert.deepEqual(sugerencias(negocio, cartera), []);
});

test("una direccion vacia no sugiere cualquier cosa", () => {
  const cartera = { a: { entity_id: "a", direccion: "Juana de Ibarbourou 200" } };
  assert.deepEqual(sugerencias({ direccion: "" }, cartera), []);
  assert.deepEqual(sugerencias({ direccion: null }, cartera), []);
});

/* Sobre los datos reales se prueban las reglas, no casos concretos: el usuario va
   enganchando negocios a medida que usa la app, y cada uno que engancha deja de tener
   sugerencia. Fijar un caso puntual haria fallar el test por el trabajo bien hecho. */
test("sobre la cartera y los negocios de verdad no se sugiere ninguna barbaridad", () => {
  const leer = (n) => JSON.parse(readFileSync(new URL(`../datos/${n}.json`, import.meta.url), "utf8"));
  const negocios = leer("negocios");
  const cartera = leer("cartera");

  for (const n of negocios) {
    const propuestas = sugerencias(n, cartera);
    if (n.entity_id_cartera || n.sin_propiedad_en_cartera) {
      assert.equal(propuestas.length, 0, `${n.id} ya esta resuelto y sigue preguntando`);
      continue;
    }
    for (const p of propuestas) {
      assert.ok(p.puntaje >= 0.62, `${n.id} sugerido con puntaje bajo`);
      // Toda sugerencia comparte letras del nombre de la calle: nada traido de los pelos.
      assert.ok(
        parecido(partirDireccion(n.direccion).calle, partirDireccion(p.propiedad.direccion).calle) > 0.5,
        `${n.id} -> ${p.propiedad.direccion} no se parecen en nada`
      );
    }
  }
});
