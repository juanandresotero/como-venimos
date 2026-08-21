/* Los negocios que nacen solos al mirar la cartera. La regla la puso Juan:
   "el negocio se crea cuando pasa a negociacion pero entra en cartera cuando la ve
   publicada" / "negociacion o reservada dependiendo si es alquiler o venta claramente". */

import { test } from "node:test";
import assert from "node:assert/strict";
import { negociosQueFaltan } from "../lib/nacen-solos.js";

const AJUSTES = {
  agente: { nombre: "Juan Andrés Otero" },
  categorias: [{ categoria: "RAP", split_pct: 0.45, desde: "2026-01-01", hasta: null }],
  defaults_comision: { venta: { 1: 0.03, 2: 0.06 }, alquiler: { 1: 1.0, 2: 2.0 } },
  pct_suplencia: 0.125, pct_referido_saliente: 0.25, pct_referido_entrante_otro: 0.75,
  regla_martin: { facturacion: 0.5, ganancia: 0.35 },
  tipo_cambio: { usd_uyu: 40 },
};

const HOY = "2026-08-21";

const propiedad = (extra = {}) => ({
  entity_id: "p1", activa: true, operacion: "venta", estado: "en_negociacion",
  direccion: "Minas 1600", barrio: "Cordón", precio: 165000, moneda: "USD",
  tipo: "departamento_estandar", origen_captacion: "Ref. Martin",
  fecha_captacion_real: "2026-05-14", fecha_negociacion: "2026-08-17",
  ...extra,
});

const cartera = (...ps) => Object.fromEntries(ps.map((p) => [p.entity_id, p]));
const faltan = (c, negocios = []) => negociosQueFaltan(c, negocios, AJUSTES, HOY);

/* ---------- Cuándo nace ---------- */

test("una venta que pasa a negociación estrena su negocio", () => {
  const [n] = faltan(cartera(propiedad()));
  assert.equal(n.tipo_negocio, "venta");
  assert.equal(n.entity_id_cartera, "p1");
  assert.equal(n.nacio_solo, true);
});

test("una propiedad recién publicada NO estrena nada todavía", () => {
  assert.deepEqual(faltan(cartera(propiedad({ estado: "publicada", fecha_negociacion: null }))), [],
    "entra en cartera al publicarse, pero el negocio nace al negociar");
});

/* UN ALQUILER NO PASA POR NEGOCIACION: va de publicado a reservado y se va del portal. */
test("un alquiler nace recién cuando queda reservado", () => {
  const enNegociacion = propiedad({ operacion: "alquiler", estado: "en_negociacion" });
  assert.deepEqual(faltan(cartera(enNegociacion)), [], "ese estado no existe en un alquiler");

  const [n] = faltan(cartera(propiedad({
    operacion: "alquiler", estado: "reservada", fecha_reservada: "2026-08-19",
  })));
  assert.equal(n.tipo_negocio, "alquiler");
  assert.equal(n.fecha_boleto, "2026-08-19");
});

test("una venta que ya está reservada también nace: se saltó la negociación", () => {
  const [n] = faltan(cartera(propiedad({ estado: "reservada", fecha_reservada: "2026-08-19" })));
  assert.equal(n.fecha_boleto, "2026-08-19");
});

test("una propiedad que ya no está en el portal no estrena nada", () => {
  assert.deepEqual(faltan(cartera(propiedad({ activa: false }))), []);
});

/* ---------- Qué se copia ---------- */

test("copia todo lo que el portal ya dice, para no pedírselo de nuevo", () => {
  const [n] = faltan(cartera(propiedad()));
  assert.equal(n.direccion, "Minas 1600");
  assert.equal(n.barrio, "Cordón");
  assert.equal(n.precio_operacion, 165000);
  assert.equal(n.moneda, "USD");
  assert.equal(n.origen_captacion, "Ref. Martin");
  assert.equal(n.fecha_inicio, "2026-05-14", "cuándo se publicó lo sabe el robot");
  assert.equal(n.fecha_negociacion, "2026-08-17");
});

test("el precio negociado manda sobre el publicado", () => {
  const [n] = faltan(cartera(propiedad({ precio_negociacion: 150000 })));
  assert.equal(n.precio_operacion, 150000, "una oferta aceptada no es el precio de la vidriera");
});

/* LA MONEDA SALE DEL PORTAL, no del tipo de operación: un alquiler nace en pesos por
   defecto, pero si RE/MAX dice que ese está en dólares, está en dólares. */
test("la moneda sale del portal aunque sea un alquiler", () => {
  const [n] = faltan(cartera(propiedad({
    operacion: "alquiler", estado: "reservada", moneda: "USD", precio: 900,
  })));
  assert.equal(n.moneda, "USD");
  const [p] = faltan(cartera(propiedad({
    operacion: "alquiler", estado: "reservada", moneda: "UYU", precio: 40000,
  })));
  assert.equal(p.moneda, "UYU");
  assert.equal(p.tipo_cambio, 40, "y si es en pesos, se guarda a cuánto estaba el dólar");
});

/* ---------- Que no se duplique ---------- */

test("no crea otro si esa propiedad ya tiene su negocio abierto", () => {
  const hay = [{ id: "excel-1", entity_id_cartera: "p1", estado: "en_curso" }];
  assert.deepEqual(faltan(cartera(propiedad()), hay), []);
});

/* UN CAIDO NO REVIVE: "se cayó" es una respuesta, no un hueco por llenar. Sin esto, la app
   le volvería a crear el negocio que él acaba de dar por perdido, todos los días. */
test("un negocio caído no vuelve a nacer solo", () => {
  const hay = [{ id: "excel-1", entity_id_cartera: "p1", estado: "caido" }];
  assert.deepEqual(faltan(cartera(propiedad()), hay), []);
});

/* PERO UN APARTAMENTO SE ALQUILA TODOS LOS AÑOS. El del año pasado está cerrado y cobrado;
   el de este año es un negocio nuevo. Sin la comparación de fechas, la app no volvería a
   crear ninguno nunca más sobre una propiedad que ya dio plata una vez. */
test("un alquiler cerrado el año pasado no tapa el de este año", () => {
  const p = propiedad({
    operacion: "alquiler", estado: "reservada", fecha_reservada: "2026-08-19",
  });
  const viejo = [{
    id: "excel-1", entity_id_cartera: "p1", estado: "cerrado", fecha_fin: "2025-09-01",
  }];
  assert.equal(faltan(cartera(p), viejo).length, 1);

  const deEstaVuelta = [{
    id: "excel-1", entity_id_cartera: "p1", estado: "cerrado", fecha_fin: "2026-08-20",
  }];
  assert.deepEqual(faltan(cartera(p), deEstaVuelta), [], "ese ya es el de esta vuelta");
});

test("varias propiedades a la vez no se pisan el id", () => {
  const nuevos = faltan(cartera(
    propiedad(),
    propiedad({ entity_id: "p2", direccion: "Vidal 3100" }),
    propiedad({ entity_id: "p3", direccion: "Gutenberg 6100" }),
  ), [{ id: "manual-1" }, { id: "manual-2" }]);
  assert.deepEqual(nuevos.map((n) => n.id), ["manual-3", "manual-4", "manual-5"]);
});

/* ---------- Borrarlo tiene que servir de algo ---------- */

/* Si borrás el negocio que la app te estrenó y al abrirla mañana vuelve a estar, borrarlo no
   sirvió de nada: terminarías borrando lo mismo todos los días. Se anota en la propiedad,
   que es lo único que sobrevive al borrado del negocio. */
test("un negocio que borraste no vuelve a nacer", () => {
  const p = propiedad({ sin_negocio: true });
  assert.deepEqual(faltan(cartera(p)), []);
});
