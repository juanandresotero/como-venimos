import { test } from "node:test";
import assert from "node:assert/strict";
import {
  aTexto, desdeTexto, clavesGuardadas, queHayGuardado, nombreDelArchivo, QUE_ES,
} from "../lib/respaldo.js";

function depositoFalso(inicial = {}) {
  const caja = new Map(Object.entries(inicial));
  return {
    get length() { return caja.size; },
    key: (i) => [...caja.keys()][i],
    getItem: (k) => (caja.has(k) ? caja.get(k) : null),
    setItem: (k, v) => caja.set(k, String(v)),
    caja,
  };
}

/* Lo que de verdad hay en el teléfono de Juan. */
const LLENO = {
  "como-venimos:token": "ghp_secretisimo",
  "como-venimos:carta-firma": '{"trazos":[1,2,3]}',
  "como-venimos:carta-historial": '[{"id":"c1"}]',
  "como-venimos:cuentas": '{"mia":{"banco":"BBVA"}}',
  "como-venimos:personal": '{"arranque":{"uyu":3800}}',
  "como-venimos:tema": "oscuro",
  /* De otra app que vive en el mismo navegador: no es asunto nuestro. */
  "otra-app:cosa": "no me toques",
};

/* LO MÁS IMPORTANTE DE TODO EL ARCHIVO. Un respaldo termina en Descargas, en un mail o en una
   carpeta compartida. Una llave ahí adentro es una puerta abierta, y Juan lo dijo él mismo:
   "capaz claves y llaves no, pero sí todo lo demás". */
test("la llave de GitHub NUNCA entra en la copia", () => {
  const texto = aTexto(depositoFalso(LLENO));
  assert.ok(!texto.includes("ghp_secretisimo"), "el token no puede estar en el archivo");
  assert.ok(!texto.includes("como-venimos:token"));
});

test("y tampoco se puede meter una llave editando el archivo a mano", () => {
  const d = depositoFalso({});
  desdeTexto(JSON.stringify({
    version: 1, datos: { "como-venimos:token": "metido a mano" },
  }), d);
  assert.equal(d.getItem("como-venimos:token"), null);
});

/* ---------- Lo que sí se copia ---------- */

test("entra todo lo que vive sólo en el teléfono", () => {
  const guardadas = clavesGuardadas(depositoFalso(LLENO));
  assert.ok(guardadas.includes("como-venimos:carta-firma"), "la firma no está en ningún otro lado");
  assert.ok(guardadas.includes("como-venimos:carta-historial"));
  assert.ok(guardadas.includes("como-venimos:cuentas"));
  assert.ok(guardadas.includes("como-venimos:personal"));
});

test("no se mete con lo de otras apps del navegador", () => {
  assert.ok(!clavesGuardadas(depositoFalso(LLENO)).includes("otra-app:cosa"));
});

test("la copia va y vuelve entera", () => {
  const texto = aTexto(depositoFalso(LLENO));
  const vacio = depositoFalso({});
  const r = desdeTexto(texto, vacio);
  assert.equal(r.claves.length, 5, "las cinco que se copian, sin el token");
  assert.equal(vacio.getItem("como-venimos:carta-firma"), '{"trazos":[1,2,3]}');
  assert.equal(vacio.getItem("como-venimos:personal"), '{"arranque":{"uyu":3800}}');
});

/* Borrar de más al restaurar es la forma más fácil de convertir un respaldo en una pérdida. */
test("restaurar una copia vieja no borra lo que la copia no trae", () => {
  const ahora = depositoFalso({
    "como-venimos:carta-firma": "la firma de hoy",
    "como-venimos:personal": "los gastos de hoy",
  });
  desdeTexto(JSON.stringify({
    version: 1, datos: { "como-venimos:personal": "los gastos de antes" },
  }), ahora);
  assert.equal(ahora.getItem("como-venimos:personal"), "los gastos de antes", "se restauró");
  assert.equal(ahora.getItem("como-venimos:carta-firma"), "la firma de hoy",
    "y la firma, que la copia no traía, sigue estando");
});

/* ---------- Archivos que no sirven ---------- */

test("un archivo que no es una copia se rechaza en vez de vaciar todo", () => {
  const d = depositoFalso({ "como-venimos:personal": "lo mío" });
  assert.equal(desdeTexto("no soy json", d), null);
  assert.equal(desdeTexto("[1,2,3]", d), null);
  assert.equal(desdeTexto('{"version":1}', d), null, "sin datos adentro no sirve");
  assert.equal(d.getItem("como-venimos:personal"), "lo mío", "y no se tocó nada");
});

test("una copia vacía no cuenta como restaurada", () => {
  assert.equal(desdeTexto('{"version":1,"datos":{}}', depositoFalso({})), null);
});

test("sin lugar donde guardar no rompe", () => {
  assert.equal(desdeTexto('{"version":1,"datos":{}}', null), null);
});

/* ---------- Lo que se muestra antes de bajar ---------- */

/* Que se vea QUÉ se está copiando, en criollo y no con nombres internos. */
test("dice en castellano qué hay adentro", () => {
  const hay = queHayGuardado(depositoFalso(LLENO));
  const firma = hay.find((x) => x.clave === "como-venimos:carta-firma");
  assert.equal(firma.nombre, "Tu firma");
  assert.ok(firma.bytes > 0, "y cuánto ocupa, para saber si hay algo de verdad");
  assert.ok(!hay.some((x) => x.clave.includes("token")));
});

test("todas las claves de la app tienen su nombre en castellano", () => {
  for (const clave of clavesGuardadas(depositoFalso(LLENO))) {
    assert.ok(QUE_ES[clave], `falta el nombre en castellano de ${clave}`);
  }
});

test("el archivo se llama con la fecha adelante, para que ordenen solos", () => {
  assert.equal(nombreDelArchivo("2026-08-21"), "como-venimos-respaldo-2026-08-21.json");
});
