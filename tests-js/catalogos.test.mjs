/* Los desplegables del negocio y la regla de comision que sale de ellos. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  AGENTES, AGENTES_QUE_LLEVAN_NOMBRE, ORIGENES, ORIGEN_A_REGIMEN,
  regimenDe, marcaActual, admiteMarcas, MARCAS, TIPOS_NEGOCIO, YO,
  origenSegunReferidor, esOrigenDeReferido, normalizarOrigen,
} from "../lib/catalogos.js";

/* "Inmobiliaria exterior" se agregó para las búsquedas: ahí el aviso lo tiene, muchas veces,
   una inmobiliaria de afuera de RE/MAX. */
test("los agentes son la lista corta que se acordo, con la de afuera", () => {
  assert.deepEqual(AGENTES, [
    "Juan Andrés Otero", "Martin Sedes", "Team", "Ofi Único", "Otra Oficina",
    "Inmobiliaria exterior",
  ]);
});

test("una inmobiliaria de afuera lleva el nombre de cuál es", () => {
  assert.equal(AGENTES_QUE_LLEVAN_NOMBRE.has("Inmobiliaria exterior"), true);
});

test("solo los que son un grupo o una oficina llevan el nombre de la persona", () => {
  assert.equal(AGENTES_QUE_LLEVAN_NOMBRE.has("Team"), true);
  assert.equal(AGENTES_QUE_LLEVAN_NOMBRE.has("Otra Oficina"), true);
  assert.equal(AGENTES_QUE_LLEVAN_NOMBRE.has(YO), false, "Juan ya es alguien");
  assert.equal(AGENTES_QUE_LLEVAN_NOMBRE.has("Martin Sedes"), false);
});

test("los doce origenes estan completos", () => {
  assert.equal(ORIGENES.length, 12);
  for (const o of ["B.d.r.", "Ref. B.d.r.", "Ref. Team", "Ref. Martin", "Ref. Único", "Ref. Remax",
                   "Ref. Cliente", "Cliente antiguo", "Dueño Vende", "Redes sociales Orgánico",
                   "Redes sociales Campaña", "On mind"]) {
    assert.ok(ORIGENES.includes(o), `falta el origen ${o}`);
  }
});

/* La regla de plata sale del origen mas dos marcas sueltas, no de una sola casilla. */
test("un referido de Martin activa su regla", () => {
  assert.equal(regimenDe({ origen_captacion: "Ref. Martin" }), "ref_martin");
});

test("los referidos de Team, Unico y Remax son de otro colega", () => {
  for (const o of ["Ref. Team", "Ref. Único", "Ref. Remax"]) {
    assert.equal(regimenDe({ origen_captacion: o }), "ref_otro_colega", o);
  }
});

/* Ni un cliente ni alguien de su base de relaciones se llevan tajada: cobra entero. */
test("un origen que no es referido de colega no se lleva ninguna tajada", () => {
  for (const o of ["B.d.r.", "Ref. B.d.r.", "Ref. Cliente", "Dueño Vende", "On mind", "Cliente antiguo"]) {
    assert.equal(regimenDe({ origen_captacion: o }), "captacion_mia", o);
  }
});

/* El caso que pidio: llega por Dueño Vende y despues igual se refiere. */
test("un negocio que llega por Dueño Vende y despues se refiere paga como referido", () => {
  assert.equal(regimenDe({ origen_captacion: "Dueño Vende", yo_referi: true }), "yo_referi");
});

test("la suplencia le gana a todo lo demas", () => {
  assert.equal(regimenDe({ origen_captacion: "Ref. Martin", es_suplencia: true }), "suplencia");
});

test("las dos marcas son excluyentes: se elige una sola de tres", () => {
  assert.equal(MARCAS.length, 3);
  assert.equal(marcaActual({}), "");
  assert.equal(marcaActual({ es_suplencia: true }), "es_suplencia");
  assert.equal(marcaActual({ yo_referi: true }), "yo_referi");
});

/* Una propiedad que esta en la cartera la esta trabajando el: no puede ser ni una
   suplencia ni algo que le paso a otro. */
test("las marcas no se ofrecen en una propiedad de tu cartera", () => {
  assert.equal(admiteMarcas({ entity_id_cartera: "aaa" }), false);
  assert.equal(admiteMarcas({ entity_id_cartera: null }), true);
  assert.equal(admiteMarcas({}), true);
});

test("suplencia salio de los tipos de negocio: ya queda cubierta por la marca", () => {
  const claves = TIPOS_NEGOCIO.map(([v]) => v);
  assert.deepEqual(claves, ["venta", "alquiler", "renovacion_alquiler"]);
  assert.ok(!claves.includes("suplencia"));
});

/* Lo mas importante: la derivacion NO puede cambiarle la plata a ningun negocio ya
   cargado. Se prueba contra los 85 de verdad, no contra un ejemplo inventado. */
test("sobre los 85 negocios reales, el regimen derivado da exactamente el guardado", () => {
  const negocios = JSON.parse(
    readFileSync(new URL("../datos/negocios.json", import.meta.url), "utf8")
  );
  const distintos = negocios.filter((n) => regimenDe(n) !== n.regimen_comision);
  assert.deepEqual(distintos.map((n) => n.id), [], "estos cambiarian de plata");
  assert.ok(negocios.length >= 85);
});

test("el vocabulario viejo del Excel sigue mapeando igual", () => {
  assert.equal(ORIGEN_A_REGIMEN["Referido - Martín"], "ref_martin");
  assert.equal(ORIGEN_A_REGIMEN["Referido - RE/MAX"], "ref_otro_colega");
});

/* Un cliente que te recomienda no se lleva ninguna tajada. El importador lo tenia
   como referido de colega y estaba mal: en los dos negocios que quedaron asi, la
   ganancia fue el 45% pleno de la comision (360 sobre 800), no el 45% del 75%. */
test("un referido de cliente no paga tajada a nadie", () => {
  assert.equal(regimenDe({ origen_captacion: "Ref. Cliente" }), "captacion_mia");
  assert.equal(ORIGEN_A_REGIMEN["Ref. Cliente"], undefined);
});

/* Hubo un campo "Quien te lo refirio" que preguntaba lo mismo que el origen pero no movia
   la plata: se cargaba "Martin Sedes" y la comision quedaba igual. Se elimino, y lo que
   quedo cargado ahi se absorbe al origen, que es el que manda. */
test("lo cargado en el viejo referidor se pasa al origen", () => {
  assert.equal(origenSegunReferidor("Martin Sedes"), "Ref. Martin");
  assert.equal(origenSegunReferidor("Team"), "Ref. Team");
  assert.equal(origenSegunReferidor("Ofi Único"), "Ref. Único");
  assert.equal(origenSegunReferidor("Otra Oficina"), "Ref. Remax");
  assert.equal(origenSegunReferidor("Juan Andrés Otero"), null, "el no se refiere solo");
  assert.equal(origenSegunReferidor(null), null);
});

test("se reconoce cuando el origen ya dice que fue un referido", () => {
  assert.equal(esOrigenDeReferido("Ref. Martin"), true);
  assert.equal(esOrigenDeReferido("Referido - Martín"), true);
  assert.equal(esOrigenDeReferido("Ref. Cliente"), true);
  assert.equal(esOrigenDeReferido("B.d.r."), false);
  assert.equal(esOrigenDeReferido("Sin origen"), false);
  assert.equal(esOrigenDeReferido(null), false);
});

/* El Excel escribia los origenes distinto. Si no se traducen, el desplegable no encuentra
   el valor y aparece VACIO teniendo el dato cargado. */
test("el vocabulario del Excel se traduce al de hoy", () => {
  assert.equal(normalizarOrigen("Referido - BDR"), "Ref. B.d.r.");
  assert.equal(normalizarOrigen("BDR"), "B.d.r.");
  assert.equal(normalizarOrigen("Referido - Martín"), "Ref. Martin");
  assert.equal(normalizarOrigen("Referido - RE/MAX"), "Ref. Remax");
  assert.equal(normalizarOrigen("Referido - cliente"), "Ref. Cliente");
  assert.equal(normalizarOrigen("Redes pagas"), "Redes sociales Campaña");
});

test("lo que ya esta en el vocabulario nuevo no se toca", () => {
  for (const o of ORIGENES) assert.equal(normalizarOrigen(o), o);
});

test("un origen desconocido se conserva tal cual, no se borra", () => {
  assert.equal(normalizarOrigen("Otros"), "Otros");
  assert.equal(normalizarOrigen(null), null);
  assert.equal(normalizarOrigen(""), null);
});

/* Traducir NO puede cambiarle la regla de comision a ningun negocio. */
test("traducir el origen no cambia el regimen de ninguno de los 85", () => {
  const negocios = JSON.parse(
    readFileSync(new URL("../datos/negocios.json", import.meta.url), "utf8")
  );
  for (const n of negocios) {
    const traducido = { ...n, origen_captacion: normalizarOrigen(n.origen_captacion) };
    assert.equal(regimenDe(traducido), regimenDe(n), `${n.id} cambiaria de plata`);
  }
});

test("todo origen traducido cae en la lista que se ofrece", () => {
  const conocidos = new Set([...ORIGENES, "Otros", "Sin origen"]);
  for (const viejo of ["BDR", "Referido - BDR", "Referido - Martín", "Referido - RE/MAX",
                       "Referido - Team", "Referido - cliente", "Redes pagas"]) {
    assert.ok(conocidos.has(normalizarOrigen(viejo)), `${viejo} traduce a algo que no esta`);
  }
});
