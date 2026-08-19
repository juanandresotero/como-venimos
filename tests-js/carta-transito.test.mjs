import { test } from "node:test";
import assert from "node:assert/strict";
import {
  nuevoId, anotarMandada, anotarVuelta, anotarEntregada,
  estadoDeCarta, comoVaLaCarta, estaPronta, faltanVolver, mandadas, vueltas,
} from "../lib/carta-transito.js";

const vacia = () => ({ valores: {}, quitadas: [], firmas: {} });

test("una carta que nunca salió del teléfono es un borrador", () => {
  assert.equal(estadoDeCarta(vacia()), "borrador");
  assert.equal(comoVaLaCarta(vacia()), "Sin mandar");
  assert.equal(estaPronta(vacia()), false);
});

test("al mandarla se le pone número propio y pasa a tránsito", () => {
  const mandada = anotarMandada(vacia(), "comprador", "2026-08-19");
  assert.equal(estadoDeCarta(mandada), "transito");
  assert.equal(typeof mandada.id, "string");
  assert.equal(mandada.id.length, 6);
  assert.deepEqual(mandadas(mandada), { comprador: "2026-08-19" });
});

test("el número que ya tenía no se cambia al volver a mandarla", () => {
  const primera = anotarMandada(vacia(), "comprador", "2026-08-19");
  const segunda = anotarMandada(primera, "propietario", "2026-08-20");
  assert.equal(segunda.id, primera.id);
  assert.deepEqual(Object.keys(mandadas(segunda)).sort(), ["comprador", "propietario"]);
});

/* Es LO que pidió Juan: ver quién contestó y quién no, sin abrir la carta. */
test("dice a quién se está esperando", () => {
  let c = anotarMandada(vacia(), "comprador", "2026-08-19");
  c = anotarMandada(c, "propietario", "2026-08-19");
  assert.equal(comoVaLaCarta(c), "Esperando al comprador y al propietario");

  c = anotarVuelta(c, "comprador", "2026-08-20");
  assert.deepEqual(faltanVolver(c), ["propietario"]);
  assert.equal(comoVaLaCarta(c), "Esperando al propietario");
  assert.equal(estaPronta(c), false);

  c = anotarVuelta(c, "propietario", "2026-08-21");
  assert.equal(comoVaLaCarta(c), "Pronta para enviar a las partes");
  assert.equal(estaPronta(c), true);
  assert.equal(estadoDeCarta(c), "transito", "hasta que no se envía sigue en el tablero");
});

test("cuando se envía a las partes deja el tablero y queda completa", () => {
  let c = anotarMandada(vacia(), "comprador", "2026-08-19");
  c = anotarVuelta(c, "comprador", "2026-08-20");
  c = anotarEntregada(c, "2026-08-21");
  assert.equal(estadoDeCarta(c), "completa");
  assert.equal(estaPronta(c), false);
  assert.equal(comoVaLaCarta(c), "Enviada a las partes");
});

/* Si se la vuelve a mandar a alguien es porque lo anterior no sirvió. Dejar marcada la
   vuelta vieja diría "ya contestó" cuando lo que contestó quedó viejo. */
test("volver a mandársela a una parte borra su respuesta anterior", () => {
  let c = anotarMandada(vacia(), "comprador", "2026-08-19");
  c = anotarVuelta(c, "comprador", "2026-08-20");
  c = anotarMandada(c, "comprador", "2026-08-21");
  assert.deepEqual(vueltas(c), {});
  assert.deepEqual(faltanVolver(c), ["comprador"]);
});

test("una parte que no existe no ensucia nada", () => {
  const c = vacia();
  assert.equal(anotarMandada(c, "escribano", "2026-08-19"), c);
  assert.equal(anotarVuelta(c, "", "2026-08-19"), c);
});

test("los números de carta no se repiten entre cartas abiertas a la vez", () => {
  const vistos = new Set();
  for (let i = 0; i < 400; i++) vistos.add(nuevoId());
  assert.ok(vistos.size > 395, `salieron ${vistos.size} distintos de 400`);
});

test("basura guardada no rompe el tablero", () => {
  for (const rota of [null, undefined, {}, { mandadas: "x", vueltas: 3 }, { mandadas: [] }]) {
    assert.doesNotThrow(() => estadoDeCarta(rota));
    assert.doesNotThrow(() => comoVaLaCarta(rota));
    assert.deepEqual(faltanVolver(rota), []);
  }
});

/* Pasó de verdad: la página del cliente anota la vuelta sin fecha, y mirando el VALOR en
   vez de la clave la parte seguía figurando como que no había contestado. */
test("una vuelta anotada sin fecha igual cuenta como contestada", () => {
  let c = anotarMandada(vacia(), "comprador", "2026-08-19");
  c = anotarVuelta(c, "comprador", null);
  assert.deepEqual(faltanVolver(c), []);
  assert.equal(estaPronta(c), true);
  assert.equal(comoVaLaCarta(c), "Pronta para enviar a las partes");
});
