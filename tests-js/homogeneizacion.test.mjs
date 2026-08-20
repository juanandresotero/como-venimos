import { test } from "node:test";
import assert from "node:assert/strict";
import { homogeneizar, POR_DEFECTO } from "../lib/homogeneizacion.js";

/* El ejemplo que dio Juan al pedirla: un semiconstruido de 100 m² al 25% suma 25 m². */
test("cada metro cuenta lo que se le diga, y el construido cuenta entero", () => {
  const r = homogeneizar(
    { padron: 0, construido: 100, semi: 100, otras: 100 },
    { semi: 0.25, otras: 0.5, patio: 0.25 },
  );
  assert.equal(r.total, 100 + 25 + 50);
});

test("los porcentajes de fábrica son los que usa Juan", () => {
  assert.deepEqual(POR_DEFECTO, { semi: 0.4, otras: 0.15, patio: 0.25 });
  const r = homogeneizar({ padron: 500, construido: 100, semi: 50, otras: 50 }, POR_DEFECTO);
  /* patio = 500 − 200 = 300.  100 + 50×0,40 + 50×0,15 + 300×0,25 = 202,5 */
  assert.equal(r.patio, 300);
  assert.equal(r.total, 202.5);
});

/* El patio no se carga a mano: se calcula. Así no puede quedar mal sumado. */
test("el patio es lo que queda del padrón sin construir", () => {
  const r = homogeneizar({ padron: 400, construido: 120, semi: 30, otras: 50 }, POR_DEFECTO);
  assert.equal(r.patio, 200);
});

test("sin padrón cargado no hay patio, pero lo construido igual cuenta", () => {
  const r = homogeneizar({ construido: 80, semi: 20 }, POR_DEFECTO);
  assert.equal(r.patio, 0);
  assert.equal(r.total, 80 + 8);
});

/* Una casa de dos plantas construye mas metros de los que pisa. Ahi el patio calculado
   queda corto y hay que avisar, no inventar un numero. */
test("si lo construido supera el padrón, avisa y no da patio negativo", () => {
  const r = homogeneizar({ padron: 200, construido: 300 }, POR_DEFECTO);
  assert.equal(r.patio, 0, "nunca negativo");
  assert.equal(r.seExcede, true);
  assert.equal(r.total, 300, "lo construido sigue contando entero");
});

test("con todo en cero no hay nada que mostrar", () => {
  const r = homogeneizar({}, POR_DEFECTO);
  assert.equal(r.total, 0);
  assert.equal(r.hayDatos, false);
  assert.deepEqual(r.partes, []);
});

test("basura en los campos no rompe ni ensucia la cuenta", () => {
  for (const basura of [null, undefined, "", "abc", -50, NaN, {}]) {
    const r = homogeneizar(
      { padron: basura, construido: 100, semi: basura, otras: basura },
      { semi: basura, otras: basura, patio: basura },
    );
    assert.equal(r.total, 100, JSON.stringify(basura));
    assert.ok(Number.isFinite(r.total));
  }
});

test("un porcentaje en cero es válido: significa que eso no computa", () => {
  const r = homogeneizar({ padron: 300, construido: 100 }, { semi: 0, otras: 0, patio: 0 });
  assert.equal(r.total, 100, "el patio existe pero no suma");
  assert.equal(r.patio, 200);
});

/* Lo que se muestra en pantalla tiene que dejar rehacer la cuenta a mano. */
test("devuelve el desglose, sin las filas vacías", () => {
  const r = homogeneizar({ padron: 300, construido: 100, semi: 40 }, POR_DEFECTO);
  assert.deepEqual(r.partes.map((p) => p.clave), ["construido", "semi", "patio"]);
  const suma = r.partes.reduce((n, p) => n + p.computa, 0);
  assert.equal(suma, r.total, "las partes tienen que sumar el total");
});
