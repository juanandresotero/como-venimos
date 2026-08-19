import { test } from "node:test";
import assert from "node:assert/strict";
import {
  nuevoId, anotarMandada, anotarVuelta, anotarEntregada,
  estadoDeCarta, comoVaLaCarta, estaPronta, faltanVolver, mandadas, vueltas,
  ordenarParaElHistorial,
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

/* Juan: "quedan al final porque en teoría no las usaré más y es solo a modo de registro". */
test("las cartas ya enviadas quedan al final del historial", () => {
  const enviada = (n) => anotarEntregada(
    anotarMandada({ nombre: n, valores: {}, firmas: {} }, "comprador", "2026-08-19"), "2026-08-20");
  const borrador = (n) => ({ nombre: n, valores: {}, firmas: {} });

  const orden = ordenarParaElHistorial([
    enviada("vieja 1"), borrador("a medias 1"), enviada("vieja 2"), borrador("a medias 2"),
  ]).map((c) => c.nombre);

  assert.deepEqual(orden, ["a medias 1", "a medias 2", "vieja 1", "vieja 2"]);
});

test("ordenar no cambia el orden entre las del mismo tipo ni toca la lista original", () => {
  const lista = [
    { nombre: "primera", valores: {}, firmas: {} },
    { nombre: "segunda", valores: {}, firmas: {} },
  ];
  assert.deepEqual(ordenarParaElHistorial(lista).map((c) => c.nombre), ["primera", "segunda"]);
  assert.notEqual(ordenarParaElHistorial(lista), lista, "tiene que devolver una lista nueva");
});

/* Pasó: se archivó una carta, se la volvió a mandar desde la ventanita, y siguió figurando
   como archivada — o sea, dando vueltas sin aparecer en ningún tablero. */
test("volver a mandar una carta archivada la devuelve al tablero", () => {
  let c = anotarMandada(vacia(), "comprador", "2026-08-19");
  c = anotarVuelta(c, "comprador", "2026-08-20");
  c = anotarEntregada(c, "2026-08-21");
  assert.equal(estadoDeCarta(c), "completa");

  c = anotarMandada(c, "propietario", "2026-08-22");
  assert.equal(estadoDeCarta(c), "transito", "vuelve al tablero");
  assert.equal(c.entregada, null);
  assert.equal(comoVaLaCarta(c), "Esperando al propietario");
  assert.deepEqual(vueltas(c), { comprador: "2026-08-20" }, "lo que ya contestaron se conserva");
});
