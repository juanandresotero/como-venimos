import { test } from "node:test";
import assert from "node:assert/strict";
import { NIVELES, nivelDe, nivelDelObjetivo } from "../lib/niveles.js";

test("los siete escalones, con los montos que dio el usuario", () => {
  assert.deepEqual(NIVELES.map((n) => [n.nombre, n.desde]), [
    ["Rookie", 30000],
    ["Executive", 65000],
    ["Club 100%", 100000],
    ["Platinum", 150000],
    ["Chairman's Club", 225000],
    ["Titan", 300000],
    ["Diamond", 400000],
  ]);
});

test("debajo del primer escalon todavia no hay nivel", () => {
  const n = nivelDe(19750);
  assert.equal(n.actual, null);
  assert.equal(n.siguiente.nombre, "Rookie");
  assert.equal(n.falta, 10250);
});

test("justo en el monto ya cuenta como alcanzado", () => {
  assert.equal(nivelDe(30000).actual.nombre, "Rookie");
  assert.equal(nivelDe(29999).actual, null);
  assert.equal(nivelDe(65000).actual.nombre, "Executive");
});

test("en el medio de un tramo dice donde esta y cuanto falta", () => {
  const n = nivelDe(120000);
  assert.equal(n.actual.nombre, "Club 100%");
  assert.equal(n.siguiente.nombre, "Platinum");
  assert.equal(n.falta, 30000);
});

test("arriba del ultimo no se inventa un escalon que no existe", () => {
  const n = nivelDe(500000);
  assert.equal(n.actual.nombre, "Diamond");
  assert.equal(n.siguiente, null);
  assert.equal(n.falta, null);
  assert.equal(n.esElUltimo, true);
  assert.equal(n.avance, 1);
});

/* La barra va del escalon anterior al siguiente, no desde cero: con 145.000 sobre
   150.000 una barra desde cero se ve casi llena y no dice nada. */
test("el avance se mide dentro del tramo, no desde cero", () => {
  assert.ok(Math.abs(nivelDe(145000).avance - 0.9) < 1e-9);   // de 100.000 a 150.000
  assert.ok(Math.abs(nivelDe(100000).avance - 0) < 1e-9);
  assert.ok(Math.abs(nivelDe(125000).avance - 0.5) < 1e-9);
});

test("sin facturacion todavia, el primer escalon entero por delante", () => {
  const n = nivelDe(0);
  assert.equal(n.actual, null);
  assert.equal(n.falta, 30000);
  assert.equal(n.avance, 0);
  assert.equal(nivelDe(null).falta, 30000);
});

/* El objetivo personal del usuario (65.000) cae justo en Executive. */
test("un objetivo que cae justo en un escalon se reconoce", () => {
  assert.equal(nivelDelObjetivo(65000).nombre, "Executive");
  assert.equal(nivelDelObjetivo(30000).nombre, "Rookie");
  assert.equal(nivelDelObjetivo(70000), null);
  assert.equal(nivelDelObjetivo(null), null);
});
