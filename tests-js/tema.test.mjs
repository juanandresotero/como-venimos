import { test } from "node:test";
import assert from "node:assert/strict";
import { leer, guardar, opuesto, vigente, delSistema, CLARO, OSCURO } from "../lib/tema.js";

function almacen(inicial = {}) {
  const caja = { ...inicial };
  return {
    getItem: (k) => (k in caja ? caja[k] : null),
    setItem: (k, v) => { caja[k] = String(v); },
    caja,
  };
}
const sistema = (oscuro) => () => ({ matches: oscuro });

test("sin elegir nada, manda el sistema", () => {
  const caja = almacen();
  assert.equal(leer(caja), null, "null quiere decir 'todavia no eligio'");
  assert.equal(vigente(caja, sistema(true)), OSCURO);
  assert.equal(vigente(caja, sistema(false)), CLARO);
});

/* Lo que hace que el boton no sea un boton roto: en un telefono en modo oscuro, elegir
   claro tiene que ganarle al sistema. */
test("lo elegido a mano le gana al sistema", () => {
  const caja = almacen();
  guardar(CLARO, caja);
  assert.equal(vigente(caja, sistema(true)), CLARO);
  guardar(OSCURO, caja);
  assert.equal(vigente(caja, sistema(false)), OSCURO);
});

test("la eleccion sobrevive: se guarda y se vuelve a leer", () => {
  const caja = almacen();
  guardar(OSCURO, caja);
  assert.equal(leer(caja), OSCURO);
});

test("un valor raro guardado no rompe: se cae al sistema", () => {
  const caja = almacen({ "como-venimos:tema": "fucsia" });
  assert.equal(leer(caja), null);
  assert.equal(vigente(caja, sistema(true)), OSCURO);
});

test("guardar cualquier cosa distinta de oscuro deja claro", () => {
  const caja = almacen();
  assert.equal(guardar("verde", caja), CLARO);
});

test("opuesto va y vuelve", () => {
  assert.equal(opuesto(CLARO), OSCURO);
  assert.equal(opuesto(OSCURO), CLARO);
  assert.equal(opuesto(opuesto(OSCURO)), OSCURO);
});

test("sin lugar para guardar la app sigue andando", () => {
  const roto = { getItem: () => null, setItem: () => { throw new Error("lleno"); } };
  assert.doesNotThrow(() => guardar(OSCURO, roto));
});

test("sin matchMedia no explota: se asume claro", () => {
  assert.equal(delSistema(() => { throw new Error("no existe"); }), CLARO);
});
