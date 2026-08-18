import { test } from "node:test";
import assert from "node:assert/strict";
import {
  medir, comoTermino, vale_la_pena_ajustar, ESTADOS, MINIMO_PARA_MEDIR,
} from "../lib/seguridad.js";

const AJUSTES = { probabilidades_cierre: { reservada: 0.9, en_negociacion: 0.6, publicada: 0.25 } };

/* Una propiedad que ya se fue de la cartera, con el estado en el que estaba y como termino. */
const ida = (estado, desenlace, i = 0) => ({
  entity_id: `p${estado}${desenlace}${i}`, activa: false,
  estado_al_desaparecer: estado, desenlace_propuesto: desenlace,
});
const varias = (estado, desenlace, cuantas) =>
  Object.fromEntries(Array.from({ length: cuantas }, (_, i) => {
    const p = ida(estado, desenlace, i);
    return [p.entity_id, p];
  }));

const fila = (r, clave) => r.find((x) => x.clave === clave);

test("los tres estados del camino, en orden", () => {
  assert.deepEqual(ESTADOS.map((e) => e.clave), ["reservada", "en_negociacion", "publicada"]);
});

test("comoTermino: vendida y alquilada cerraron; caída y retirada no", () => {
  assert.equal(comoTermino({ desenlace_propuesto: "vendida" }), "cerro");
  assert.equal(comoTermino({ desenlace_propuesto: "alquilada" }), "cerro");
  assert.equal(comoTermino({ desenlace_propuesto: "caida" }), "no_cerro");
  assert.equal(comoTermino({ desenlace_propuesto: "retirada" }), "no_cerro");
  assert.equal(comoTermino({}), "sin_saber", "sin desenlace no se puede medir");
});

test("lo que confirmó el usuario le gana a lo que propuso el robot", () => {
  assert.equal(comoTermino({ desenlace_propuesto: "vendida", desenlace_confirmado: "caida" }), "no_cerro");
});

/* Hoy es el caso real: las 12 propiedades siguen activas y no hay nada que medir. */
test("sin propiedades idas, se siguen usando los números cargados", () => {
  const activas = { a: { entity_id: "a", activa: true, estado: "en_negociacion" } };
  const r = medir(activas, AJUSTES);
  const neg = fila(r, "en_negociacion");
  assert.equal(neg.casos, 0);
  assert.equal(neg.medido, null);
  assert.equal(neg.alcanza, false);
  assert.equal(neg.usar, 0.6, "hasta que haya datos, manda el número cargado");
  assert.equal(neg.faltan, MINIMO_PARA_MEDIR);
});

test("una propiedad viva no cuenta: todavía no se sabe cómo termina", () => {
  const cartera = {
    ...varias("en_negociacion", "vendida", 3),
    viva: { entity_id: "viva", activa: true, estado: "en_negociacion" },
  };
  assert.equal(fila(medir(cartera, AJUSTES), "en_negociacion").casos, 3);
});

/* Lo que planteó el usuario: si de 10 en negociación se caen 9, el número tiene que bajar. */
test("de 10 en negociación se caen 9: la seguridad baja a 10%", () => {
  const cartera = {
    ...varias("en_negociacion", "caida", 9),
    ...varias("en_negociacion", "vendida", 1),
  };
  const neg = fila(medir(cartera, AJUSTES), "en_negociacion");
  assert.equal(neg.casos, 10);
  assert.equal(neg.medido, 0.1);
  assert.equal(neg.usar, 0.1, "ya hay datos: manda lo medido");
  assert.ok(vale_la_pena_ajustar(neg), "de 60% a 10% hay que avisarle");
});

test("de 10 en negociación avanzan las 10: la seguridad sube a 100%", () => {
  const neg = fila(medir(varias("en_negociacion", "vendida", 10), AJUSTES), "en_negociacion");
  assert.equal(neg.medido, 1);
  assert.equal(neg.usar, 1);
});

/* Con dos casos, uno solo mueve el numero cincuenta puntos: eso no es medir. */
test("con pocos casos NO se cambia el número: parecería medido y sería azar", () => {
  const cartera = { ...varias("publicada", "vendida", 2), ...varias("publicada", "caida", 1) };
  const pub = fila(medir(cartera, AJUSTES), "publicada");
  assert.equal(pub.casos, 3);
  assert.ok(Math.abs(pub.medido - 2 / 3) < 1e-9, "se calcula igual, para poder mostrarlo");
  assert.equal(pub.alcanza, false);
  assert.equal(pub.usar, 0.25, "pero se sigue usando el cargado");
  assert.equal(pub.faltan, 2);
  assert.equal(vale_la_pena_ajustar(pub), false);
});

test("las que se fueron sin saber cómo terminaron no ensucian la cuenta", () => {
  const cartera = {
    ...varias("reservada", "vendida", 5),
    x: { entity_id: "x", activa: false, estado_al_desaparecer: "reservada" },
  };
  const res = fila(medir(cartera, AJUSTES), "reservada");
  assert.equal(res.casos, 5, "la del desenlace desconocido no cuenta");
  assert.equal(res.sin_saber, 1, "pero se sabe que está");
  assert.equal(res.medido, 1);
});

test("no se avisa por diferencias chicas: cambiarlas es perseguir ruido", () => {
  // 5 de negociación, 3 cerraron: 60% medido contra 60% cargado.
  const cartera = {
    ...varias("en_negociacion", "vendida", 3),
    ...varias("en_negociacion", "caida", 2),
  };
  const neg = fila(medir(cartera, AJUSTES), "en_negociacion");
  assert.equal(neg.medido, 0.6);
  assert.equal(vale_la_pena_ajustar(neg), false);
});

test("sin cartera ni ajustes no explota", () => {
  assert.doesNotThrow(() => medir(null, null));
  assert.equal(medir(null, null).length, 3);
  assert.equal(fila(medir(null, null), "reservada").usar, null);
});
