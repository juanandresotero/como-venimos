/* A quién le referiste la propiedad: la guía de agentes de RE/MAX Uruguay.

   Antes era un campo de texto libre y ahí moría. Ahora se elige oficina y después agente, y
   lo que queda anotado es el ID del colega — la llave para poder pedirle su cartera. */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  oficinasParaElegir, agentesParaElegir, agentesDe, nombreDeAgente, nombreDeOficina,
  miOficina, miId, comoSeLlamaElColega, TEAM, EXTERIOR, SLUGS_DEL_TEAM,
} from "../lib/colegas.js";

const GUIA = {
  oficinas: [
    { id: "of-unico", nombre: "REMAX Único" },
    { id: "of-mar", nombre: "REMAX Mar" },
  ],
  agentes: [
    { id: "a1", nombre: "Juan Andrés Otero", oficina_id: "of-unico", slug: "juan-andres-otero" },
    { id: "a2", nombre: "Martin Sedes", oficina_id: "of-unico", slug: "martin-sedes" },
    { id: "a4", nombre: "Leticia Varela", oficina_id: "of-unico", slug: "leticia-varela" },
    { id: "a5", nombre: "Otro de Único", oficina_id: "of-unico", slug: "otro-de-unico" },
    { id: "a3", nombre: "Pepito Pérez", oficina_id: "of-mar", slug: "pepito-perez" },
  ],
};

const AJUSTES = { agente: { nombre: "Juan Andrés Otero" } };
const claves = (pares) => pares.map(([v]) => v);

test("las doce oficinas se eligen, y al final las dos que no lo son", () => {
  const opciones = oficinasParaElegir(GUIA);
  assert.deepEqual(claves(opciones), ["", "of-unico", "of-mar", TEAM, EXTERIOR]);
});

test("elegida la oficina, aparecen sólo sus agentes", () => {
  assert.deepEqual(agentesDe(GUIA, "of-mar").map((a) => a.nombre), ["Pepito Pérez"]);
  assert.deepEqual(claves(agentesParaElegir(GUIA, "of-mar")), ["", "a3"]);
});

/* EL TEAM SON LOS OCHO QUE DIO JUAN, no toda la oficina: en RE/MAX Único son 66. Se
   identifican por SLUG, que no lleva acentos ni depende de cómo esté escrito el nombre. */
test("el Team son los que dio Juan, no toda la oficina", () => {
  const yo = miId(GUIA, AJUSTES);
  assert.deepEqual(agentesDe(GUIA, TEAM, null, yo).map((a) => a.nombre),
    ["Martin Sedes", "Leticia Varela"], "en su orden, y sin él mismo");
  assert.equal(SLUGS_DEL_TEAM.length, 8);
});

/* VOS NO ESTAS EN NINGUNA LISTA: no te podés referir una propiedad a vos mismo, y verte ahí
   sólo sirve para elegirte sin querer. */
test("no aparecés entre los colegas a los que referir", () => {
  const yo = miId(GUIA, AJUSTES);
  assert.equal(yo, "a1", "te encuentra en la guía por tu nombre de Ajustes");
  const unico = agentesDe(GUIA, "of-unico", null, yo).map((a) => a.nombre);
  assert.ok(!unico.includes("Juan Andrés Otero"));
  assert.equal(unico.length, 3, "los otros tres de Único sí");
});

test("la oficina propia se sigue sabiendo sola", () => {
  assert.equal(miOficina(GUIA, AJUSTES), "of-unico", "sale de la guía, no se carga a mano");
});

/* UNA OFICINA DEL EXTERIOR no está en la guía uruguaya: ahí el nombre va a mano y lo que
   sirve es el link de su cartera. Ofrecer una lista de agentes sería ofrecer una lista vacía. */
test("una oficina del exterior no ofrece agentes", () => {
  assert.deepEqual(agentesDe(GUIA, EXTERIOR, "of-unico", "a1"), []);
});

test("sin guía bajada todavía, no se rompe nada", () => {
  assert.deepEqual(claves(oficinasParaElegir(null)), ["", TEAM, EXTERIOR]);
  assert.deepEqual(agentesDe(undefined, "of-mar"), []);
  assert.equal(miOficina({}, AJUSTES), null);
});

test("los nombres se pueden recuperar para mostrarlos en una lista", () => {
  assert.equal(nombreDeAgente(GUIA, "a3"), "Pepito Pérez");
  assert.equal(nombreDeOficina(GUIA, "of-mar"), "REMAX Mar");
  assert.equal(nombreDeOficina(GUIA, TEAM), "Mi Team");
});

/* El nombre escrito a mano vale cuando no hay agente elegido: es el caso del exterior, y
   también el de los referidos viejos que vinieron del Excel. */
test("el colega tiene nombre lo hayas elegido o escrito", () => {
  assert.equal(comoSeLlamaElColega({ referido_a_agente: "a3" }, GUIA), "Pepito Pérez");
  assert.equal(comoSeLlamaElColega({ referido_a_nombre: "Ana, RE/MAX Madrid" }, GUIA),
    "Ana, RE/MAX Madrid");
  assert.equal(comoSeLlamaElColega({}, GUIA), null);
});
