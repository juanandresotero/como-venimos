import { test } from "node:test";
import assert from "node:assert/strict";
import {
  sanear, leer, guardar, mover, todos, POR_DEFECTO, INDICADORES, TIPOS,
} from "../lib/preferencias.js";

/* Un localStorage de mentira, para probar sin navegador. */
function almacen(inicial = {}) {
  const caja = { ...inicial };
  return {
    getItem: (k) => (k in caja ? caja[k] : null),
    setItem: (k, v) => { caja[k] = String(v); },
    caja,
  };
}

test("sanear: sin nada guardado devuelve los valores de fabrica", () => {
  const p = sanear(null);
  assert.equal(p.anios, null);
  assert.equal(p.graficoMes, "barras");
  assert.deepEqual(p.indicadores, POR_DEFECTO.indicadores);
});

test("sanear: una grafica que ya no existe cae al valor de fabrica", () => {
  const p = sanear({ graficoMes: "holograma", graficoAnual: "torta" });
  assert.equal(p.graficoMes, "barras");
  assert.equal(p.graficoAnual, "barras", "la anual nunca ofrecio torta");
});

test("sanear: un indicador que ya no existe se descarta sin romper el resto", () => {
  const p = sanear({ indicadores: ["barrios", "inventado", "meses"] });
  assert.deepEqual(p.indicadores, ["barrios", "meses"]);
});

test("sanear: no dejar ninguno es una eleccion valida, no un error", () => {
  const p = sanear({ indicadores: [] });
  assert.deepEqual(p.indicadores, [], "vacio es vacio: no se repone la lista de fabrica");
});

test("sanear: años basura no pasan", () => {
  const p = sanear({ anios: ["2024", "veinte", "24", "2025"] });
  assert.deepEqual(p.anios, ["2024", "2025"]);
});

test("leer: un JSON roto no deja la pantalla en blanco", () => {
  const p = leer(almacen({ "como-venimos:tablero": "{esto no es json" }));
  assert.equal(p.graficoMes, "barras");
  assert.deepEqual(p.indicadores, POR_DEFECTO.indicadores);
});

test("guardar y leer: da la vuelta completa", () => {
  const caja = almacen();
  guardar({ anios: ["2024"], graficoMes: "acumulado", indicadores: ["barrios"] }, caja);
  const p = leer(caja);
  assert.deepEqual(p.anios, ["2024"]);
  assert.equal(p.graficoMes, "acumulado");
  assert.deepEqual(p.indicadores, ["barrios"]);
});

test("guardar: sin lugar donde escribir la app sigue andando", () => {
  const roto = { getItem: () => null, setItem: () => { throw new Error("lleno"); } };
  assert.doesNotThrow(() => guardar({ graficoMes: "linea" }, roto));
});

test("los cinco indicadores de fabrica existen en el catalogo", () => {
  const claves = new Set(INDICADORES.map((i) => i.clave));
  for (const c of POR_DEFECTO.indicadores) assert.ok(claves.has(c), `falta ${c}`);
  assert.equal(INDICADORES.filter((i) => i.porDefecto).length, POR_DEFECTO.indicadores.length);
});

test("no se ofrece una torta de doce meses: es ilegible", () => {
  assert.ok(!TIPOS.graficoMes.some((t) => t.clave === "torta"));
  assert.ok(TIPOS.graficoReparto.some((t) => t.clave === "torta"));
});

/* ---------- El orden de las tarjetas ---------- */

/* El orden de la lista ES el orden en pantalla: mover una tarjeta es mover su clave. */
test("mover: sube y baja de a uno", () => {
  assert.deepEqual(mover(["a", "b", "c"], "c", -1), ["a", "c", "b"]);
  assert.deepEqual(mover(["a", "b", "c"], "a", 1), ["b", "a", "c"]);
});

test("mover: en los bordes no se cae de la lista", () => {
  assert.deepEqual(mover(["a", "b", "c"], "a", -1), ["a", "b", "c"]);
  assert.deepEqual(mover(["a", "b", "c"], "c", 1), ["a", "b", "c"]);
  assert.deepEqual(mover(["a", "b", "c"], "a", 99), ["b", "c", "a"]);
});

test("mover: una clave que no esta no rompe nada", () => {
  assert.deepEqual(mover(["a", "b"], "z", 1), ["a", "b"]);
});

test("mover: no toca la lista que recibe", () => {
  const original = ["a", "b", "c"];
  mover(original, "a", 1);
  assert.deepEqual(original, ["a", "b", "c"], "mutar la original rompe el redibujado");
});

test("mover: el orden sobrevive al guardado", () => {
  const caja = almacen();
  guardar({ indicadores: mover(["barrios", "meses", "puntas"], "puntas", -2) }, caja);
  assert.deepEqual(leer(caja).indicadores, ["puntas", "barrios", "meses"]);
});

test("todos: prende el catalogo entero", () => {
  assert.equal(todos().length, INDICADORES.length);
  assert.deepEqual(sanear({ indicadores: todos() }).indicadores, todos());
});
