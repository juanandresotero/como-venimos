import { test } from "node:test";
import assert from "node:assert/strict";
import {
  aTexto, desdeTexto, clavesGuardadas, queHayGuardado, nombreDelArchivo, QUE_ES, NO_ENTRA,
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
  "como-venimos:cuentas": '{"mia":{"banco":"BBVA","pesos":"123456789"}}',
  "como-venimos:carta-historial": JSON.stringify([{
    id: "c1", nombre: "Rivera 2020", valores: { precio: 150000 },
    firmas: { oferente: [9, 9, 9], propietario: [8, 8] },
  }]),
  "como-venimos:personal": '{"arranque":{"uyu":3800}}',
  "como-venimos:tema": "oscuro",
  /* De otra app que vive en el mismo navegador: no es asunto nuestro. */
  "otra-app:cosa": "no me toques",
};

/* LO MÁS IMPORTANTE DE TODO EL ARCHIVO. Un respaldo termina en Descargas, en un mail o en una
   carpeta compartida. Las tres cosas que van afuera no son datos, son PUERTAS: con la llave
   se escribe en el repo, con la firma se firma en su nombre, y con la cuenta se le dice a un
   cliente "transferí acá". Las eligió Juan. */
test("las tres puertas NUNCA entran en la copia", () => {
  const texto = aTexto(depositoFalso(LLENO));
  assert.ok(!texto.includes("ghp_secretisimo"), "la llave de GitHub");
  assert.ok(!texto.includes("trazos"), "la firma");
  assert.ok(!texto.includes("123456789"), "las cuentas bancarias");
});

/* NO ALCANZA CON SACAR LA FIRMA DE SU LUGAR: el historial guarda adentro las firmas de cada
   carta, la de Juan y las de sus clientes. Sacar "Tu firma" y dejar el historial habría sido
   no sacar nada. */
test("y tampoco salen las firmas guardadas DENTRO del historial de cartas", () => {
  const texto = aTexto(depositoFalso(LLENO));
  assert.ok(!texto.includes("firmas"), "ni el campo");
  assert.ok(!texto.includes("oferente"), "ni lo que tenía adentro");
  assert.ok(texto.includes("Rivera 2020"), "pero el registro de la carta sí se conserva");
});

test("una firma metida a mano en el archivo tampoco vuelve al teléfono", () => {
  const d = depositoFalso({});
  desdeTexto(JSON.stringify({
    version: 2,
    datos: {
      "como-venimos:carta-historial": JSON.stringify([{ id: "x", firmas: { a: [1, 2] } }]),
    },
  }), d);
  assert.ok(!(d.getItem("como-venimos:carta-historial") || "").includes("firmas"));
});

test("y tampoco se puede meter una llave editando el archivo a mano", () => {
  const d = depositoFalso({});
  desdeTexto(JSON.stringify({
    version: 1, datos: { "como-venimos:token": "metido a mano" },
  }), d);
  assert.equal(d.getItem("como-venimos:token"), null);
});

/* ---------- Lo que sí se copia ---------- */

test("entra lo que vive sólo en el teléfono y no es una puerta", () => {
  const guardadas = clavesGuardadas(depositoFalso(LLENO));
  assert.ok(guardadas.includes("como-venimos:carta-historial"));
  assert.ok(guardadas.includes("como-venimos:personal"));
  assert.ok(!guardadas.includes("como-venimos:carta-firma"));
  assert.ok(!guardadas.includes("como-venimos:cuentas"));
  assert.ok(!guardadas.includes("como-venimos:token"));
});

/* Lo que queda afuera se dice en pantalla: que falte tiene que ser una decisión visible, no
   una sorpresa el día que se restaura. */
/* Las tres primeras son PUERTAS, no datos: con la llave se escribe en su repo, con la firma
   se firma en su nombre y con las cuentas se cobra. Las fotos son la cuarta y por otro motivo:
   viven en IndexedDB y esto sólo lee localStorage. Su respaldo es el Drive. */
test("se puede decir en criollo qué NO entra", () => {
  assert.deepEqual(NO_ENTRA, [
    "La llave de GitHub",
    "Tu firma",
    "Las cuentas bancarias",
    "Las fotos de los inventarios (esas van al Drive)",
  ]);
});

test("no se mete con lo de otras apps del navegador", () => {
  assert.ok(!clavesGuardadas(depositoFalso(LLENO)).includes("otra-app:cosa"));
});

test("la copia va y vuelve", () => {
  const texto = aTexto(depositoFalso(LLENO));
  const vacio = depositoFalso({});
  const r = desdeTexto(texto, vacio);
  assert.equal(r.claves.length, 3, "historial, personal y tema");
  assert.equal(vacio.getItem("como-venimos:personal"), '{"arranque":{"uyu":3800}}');
  assert.ok(vacio.getItem("como-venimos:carta-historial").includes("Rivera 2020"));
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
  const historial = hay.find((x) => x.clave === "como-venimos:carta-historial");
  assert.equal(historial.nombre, "Historial de cartas oferta (sin las firmas)");
  assert.ok(historial.bytes > 0, "y cuánto ocupa, para saber si hay algo de verdad");
  assert.ok(!hay.some((x) => x.clave.includes("token")));
  assert.ok(!hay.some((x) => x.clave.includes("firma")));
  assert.ok(!hay.some((x) => x.clave.includes("cuentas")));
});

test("todas las claves de la app tienen su nombre en castellano", () => {
  for (const clave of clavesGuardadas(depositoFalso(LLENO))) {
    assert.ok(QUE_ES[clave], `falta el nombre en castellano de ${clave}`);
  }
});

test("el archivo se llama con la fecha adelante, para que ordenen solos", () => {
  assert.equal(nombreDelArchivo("2026-08-21"), "como-venimos-respaldo-2026-08-21.json");
});
