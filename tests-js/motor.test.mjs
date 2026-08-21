import { test } from "node:test";
import assert from "node:assert/strict";
import {
  base, splitVigente, calcular, pctPorDefecto, revisar, REGIMENES,
  plantillaNegocio, esBusqueda, ATAJOS, comoEstaContando, estaCaido, CAIDO, hayAlgoEnMarcha, volvioAlMercado, esReferidaMia } from "../lib/motor.js";

const AJUSTES = {
  agente: { nombre: "Juan Andrés Otero" },
  categorias: [{ categoria: "RAP", split_pct: 0.45, fee_mensual_usd: 70, desde: "2026-01-01", hasta: null }],
  defaults_comision: { venta: { 1: 0.03, 2: 0.06 }, alquiler: { 1: 1.0, 2: 2.0 } },
  regla_martin: { facturacion: 0.5, ganancia: 0.35 },
  pct_suplencia: 0.125,
  pct_referido_saliente: 0.25,
  pct_referido_entrante_otro: 0.75,
};

test("base: precio por porcentaje", () => {
  assert.equal(base(100000, 0.03), 3000);
  assert.equal(base(333, 2), 666);
});

test("base: sin datos da cero", () => {
  assert.equal(base(null, 0.03), 0);
  assert.equal(base(100000, null), 0);
});

test("pctPorDefecto: los optimos de venta y alquiler", () => {
  assert.equal(pctPorDefecto("venta", 1, AJUSTES), 0.03);
  assert.equal(pctPorDefecto("venta", 2, AJUSTES), 0.06);
  assert.equal(pctPorDefecto("alquiler", 1, AJUSTES), 1);
  assert.equal(pctPorDefecto("alquiler", 2, AJUSTES), 2);
  assert.equal(pctPorDefecto("renovacion_alquiler", 1, AJUSTES), 1);
});

test("splitVigente: la categoria de esa fecha", () => {
  assert.deepEqual(splitVigente("2026-03-15", AJUSTES), ["RAP", 0.45]);
});

test("splitVigente: antes de la historia no hay categoria", () => {
  assert.deepEqual(splitVigente("2023-05-01", AJUSTES), [null, null]);
  assert.deepEqual(splitVigente(null, AJUSTES), [null, null]);
});

// Los mismos siete casos que verifica el motor de Python, sobre el ejemplo del usuario:
// propiedad de 100.000 al 3% -> BASE 3.000 (1 punta) / 6.000 (2 puntas).
test("captacion mia, una punta", () => {
  assert.deepEqual(calcular("captacion_mia", 3000, "2026-03-15", AJUSTES), [3000, 1350]);
});

test("captacion mia, dos puntas", () => {
  assert.deepEqual(calcular("captacion_mia", 6000, "2026-03-15", AJUSTES), [6000, 2700]);
});

test("referida de Martin: mitad de facturacion, 35% del total", () => {
  assert.deepEqual(calcular("ref_martin", 3000, "2026-03-15", AJUSTES), [1500, 1050]);
  assert.deepEqual(calcular("ref_martin", 6000, "2026-03-15", AJUSTES), [3000, 2100]);
});

test("referida de otro colega: paga 25% de referido antes de su tajada", () => {
  assert.deepEqual(calcular("ref_otro_colega", 3000, "2026-03-15", AJUSTES), [3000, 1012.5]);
  assert.deepEqual(calcular("ref_otro_colega", 6000, "2026-03-15", AJUSTES), [6000, 2025]);
});

test("yo referi: solo factura su parte", () => {
  assert.deepEqual(calcular("yo_referi", 3000, "2026-03-15", AJUSTES), [750, 337.5]);
  assert.deepEqual(calcular("yo_referi", 6000, "2026-03-15", AJUSTES), [1500, 675]);
});

test("suplencia: no factura, y el 12,5% va entero al bolsillo", () => {
  assert.deepEqual(calcular("suplencia", 6000, "2026-03-15", AJUSTES), [0, 750]);
});

test("sin categoria vigente no se calcula ganancia", () => {
  assert.deepEqual(calcular("captacion_mia", 3000, "2023-05-01", AJUSTES), [3000, null]);
});

test("la plata se redondea a centavos", () => {
  // 0,45 x 0,75 x 3000 da 1012.5000000000001 en binario.
  const [, ganancia] = calcular("ref_otro_colega", 3000, "2026-03-15", AJUSTES);
  assert.equal(String(ganancia), "1012.5");
});

test("un regimen desconocido avisa", () => {
  assert.throws(() => calcular("cualquier_cosa", 3000, "2026-03-15", AJUSTES), /desconocido/);
});

test("REGIMENES tiene los cinco", () => {
  assert.equal(REGIMENES.length, 5);
  assert.ok(REGIMENES.includes("suplencia"));
});

function negocio(x = {}) {
  return {
    id: "excel-5", tipo_negocio: "venta", estado: "cerrado",
    fecha_inicio: "2026-01-10", fecha_boleto: "2026-02-10", fecha_fin: "2026-03-15",
    direccion: "Calle 100", barrio: "Cerrito",
    precio_operacion: 100000, pct_comision_total: 0.03,
    regimen_comision: "captacion_mia", puntas: 1,
    agente_vende: "Juan Andrés Otero", agente_compra: "Otro",
    origen_captacion: "BDR",
    base: 3000, facturacion: 3000, ganancia: 1350,
    ficha_completa: false, avisos: [], ...x,
  };
}

const tipos = (n) => n.avisos.map((a) => a.tipo);

test("revisar: un negocio completo no genera avisos", () => {
  assert.deepEqual(tipos(revisar(negocio(), AJUSTES, "2026-08-17")), []);
});

/* Estos dos campos no se podian cargar desde la ficha, asi que el aviso quedaba pegado
   para siempre. Ahora se regeneran mirando el dato, y desaparecen al completarlo. */
test("revisar: avisa si no dice quien puso cada lado", () => {
  const sin = revisar(negocio({ agente_vende: null, agente_compra: null }), AJUSTES, "2026-08-17");
  assert.ok(tipos(sin).includes("faltan_agentes"));
  const con = revisar(negocio({ agente_vende: null, agente_compra: "Juan Andrés Otero" }), AJUSTES, "2026-08-17");
  assert.ok(!tipos(con).includes("faltan_agentes"));
});

test("revisar: avisa si no dice de donde salio, y 'Sin origen' no cuenta como cargado", () => {
  assert.ok(tipos(revisar(negocio({ origen_captacion: null }), AJUSTES, "2026-08-17")).includes("origen_sin_clasificar"));
  assert.ok(tipos(revisar(negocio({ origen_captacion: "Sin origen" }), AJUSTES, "2026-08-17")).includes("origen_sin_clasificar"));
  assert.ok(!tipos(revisar(negocio({ origen_captacion: "Otros" }), AJUSTES, "2026-08-17")).includes("origen_sin_clasificar"));
});

test("revisar: avisa si falta la fecha de inicio", () => {
  assert.ok(tipos(revisar(negocio({ fecha_inicio: null }), AJUSTES, "2026-08-17")).includes("falta_fecha_inicio"));
});

test("revisar: avisa si falta el boleto en una venta, pero no en un alquiler", () => {
  assert.ok(tipos(revisar(negocio({ fecha_boleto: null }), AJUSTES, "2026-08-17")).includes("falta_fecha_boleto"));
  const alq = revisar(negocio({ tipo_negocio: "alquiler", fecha_boleto: null }), AJUSTES, "2026-08-17");
  assert.ok(!tipos(alq).includes("falta_fecha_boleto"));
});

test("revisar: al completar el dato, el aviso desaparece", () => {
  const antes = revisar(negocio({ fecha_inicio: null }), AJUSTES, "2026-08-17");
  assert.ok(tipos(antes).includes("falta_fecha_inicio"));
  const despues = revisar({ ...antes, fecha_inicio: "2026-01-10" }, AJUSTES, "2026-08-17");
  assert.ok(!tipos(despues).includes("falta_fecha_inicio"));
});

test("revisar: una firma futura no puede estar cobrada", () => {
  const n = revisar(negocio({ fecha_fin: "2026-12-05" }), AJUSTES, "2026-08-17");
  assert.equal(n.estado, "en_curso");
  assert.equal(n.fecha_fin_estimada, true);
  assert.ok(tipos(n).includes("firma_futura"));
});

test("revisar: al corregir la firma futura vuelve a cerrado", () => {
  const futuro = revisar(negocio({ fecha_fin: "2026-12-05" }), AJUSTES, "2026-08-17");
  const corregido = revisar({ ...futuro, fecha_fin: "2026-07-01" }, AJUSTES, "2026-08-17");
  assert.equal(corregido.estado, "cerrado");
  assert.equal(corregido.fecha_fin_estimada, false);
});

test("revisar: avisa si las fechas estan dadas vuelta", () => {
  const n = revisar(negocio({ fecha_boleto: "2026-05-05", fecha_fin: "2026-04-20" }), AJUSTES, "2026-08-17");
  assert.ok(tipos(n).includes("fechas_al_reves"));
});

test("revisar: recalcula la plata con los datos nuevos", () => {
  const n = revisar(negocio({ precio_operacion: 200000 }), AJUSTES, "2026-08-17");
  assert.equal(n.base, 6000);
  assert.equal(n.facturacion, 6000);
  assert.equal(n.ganancia, 2700);
});

test("revisar: no recalcula los negocios anteriores a 2026", () => {
  const n = revisar(negocio({ fecha_fin: "2024-05-01", facturacion: 999, ganancia: 111 }), AJUSTES, "2026-08-17");
  assert.equal(n.facturacion, 999);
  assert.equal(n.ganancia, 111);
});

test("revisar: una ficha dada por completa no genera avisos de faltantes", () => {
  const n = revisar(negocio({ fecha_inicio: null, ficha_completa: true }), AJUSTES, "2026-08-17");
  assert.deepEqual(tipos(n), []);
});

/* Los avisos del importador eran todos "tu Excel dice X pero la cuenta da Y". El usuario
   decidio que ese Excel quedo viejo y que la app es la fuente de verdad, asi que discutir
   con una planilla que no va a volver a abrir es ruido. Se descartan al revisar. */
test("revisar: los avisos que venian del Excel ya no se conservan", () => {
  const conAvisosViejos = negocio({
    avisos: [
      { tipo: "separador_decimal", detalle: "x" },
      { tipo: "recalculo_distinto", detalle: "x" },
      { tipo: "aritmetica_no_cierra", detalle: "x" },
      { tipo: "comision_absurda", detalle: "x" },
      { tipo: "firma_inventada", detalle: "x" },
    ],
  });
  assert.deepEqual(tipos(revisar(conAvisosViejos, AJUSTES, "2026-08-17")), []);
});

test("revisar: pero lo que SI se puede arreglar se sigue avisando", () => {
  const t = tipos(revisar(
    negocio({ fecha_inicio: null, avisos: [{ tipo: "separador_decimal", detalle: "x" }] }),
    AJUSTES, "2026-08-17"
  ));
  assert.deepEqual(t, ["falta_fecha_inicio"]);
});

test("revisar: no modifica el negocio original", () => {
  const original = negocio({ fecha_inicio: null });
  revisar(original, AJUSTES, "2026-08-17");
  assert.deepEqual(original.avisos, []);
});

/* Bug real del 2026-08-17: al cargar "desde cuándo sos RAP", el <input type="date"> mandó
   el cambio a medio tipear y quedó guardado el año 0001. Con una fecha así fuera de rango,
   ningún negocio de 2026 tendría categoría vigente y la ganancia se volvía null en
   silencio: la plata desaparecía sin que nada lo dijera. */
test("revisar: si no hay categoria vigente, avisa en vez de borrar la ganancia", () => {
  const rotos = { ...AJUSTES, categorias: [
    { categoria: "RAP", split_pct: 0.45, fee_mensual_usd: 70, desde: "2030-01-01", hasta: null },
  ] };
  const r = revisar(negocio({ ganancia: 1350 }), rotos, "2026-08-17");
  assert.ok(tipos(r).includes("sin_categoria"));
  assert.equal(r.ganancia, 1350, "la ganancia que ya estaba no se pierde");
  assert.equal(r.facturacion, 3000, "la facturacion no depende de la categoria");
});

test("revisar: con la categoria bien puesta no avisa nada de eso", () => {
  assert.ok(!tipos(revisar(negocio(), AJUSTES, "2026-08-17")).includes("sin_categoria"));
});

/* Lo que dijo mirando Flammarion: si la propiedad sigue en la cartera en negociacion,
   la app YA SABE que todavia no hay boleto ni firma. Pedirselos es pedirle un dato que
   no existe. */
const CARTERA_VIVA = { flam: { entity_id: "flam", activa: true, estado: "en_negociacion" } };

test("revisar: no pide firma ni boleto si la propiedad sigue viva en la cartera", () => {
  const enMarcha = negocio({
    entity_id_cartera: "flam", fecha_fin: null, fecha_boleto: null,
  });
  const t = tipos(revisar(enMarcha, AJUSTES, "2026-08-17", CARTERA_VIVA));
  assert.ok(!t.includes("sin_fecha_fin"));
  assert.ok(!t.includes("falta_fecha_boleto"));
});

test("revisar: si la propiedad ya no esta en la cartera, si las pide", () => {
  const cerrada = { flam: { entity_id: "flam", activa: false } };
  const t = tipos(revisar(
    negocio({ entity_id_cartera: "flam", fecha_fin: null, fecha_boleto: null }),
    AJUSTES, "2026-08-17", cerrada
  ));
  assert.ok(t.includes("sin_fecha_fin"));
  assert.ok(t.includes("falta_fecha_boleto"));
});

test("revisar: un negocio sin propiedad de la cartera sigue pidiendo las fechas", () => {
  const t = tipos(revisar(
    negocio({ fecha_fin: null, fecha_boleto: null }), AJUSTES, "2026-08-17", CARTERA_VIVA
  ));
  assert.ok(t.includes("sin_fecha_fin"));
});

test("revisar: la fecha en que se publico se pide siempre, este viva o no", () => {
  const t = tipos(revisar(
    negocio({ entity_id_cartera: "flam", fecha_inicio: null }),
    AJUSTES, "2026-08-17", CARTERA_VIVA
  ));
  assert.ok(t.includes("falta_fecha_inicio"));
});

/* Un alquiler casi nunca pasa por negociacion: no se le reclama esa fecha. */
test("revisar: a un alquiler no se le pide la fecha de boleto", () => {
  const t = tipos(revisar(
    negocio({ tipo_negocio: "alquiler", fecha_boleto: null }), AJUSTES, "2026-08-17"
  ));
  assert.ok(!t.includes("falta_fecha_boleto"));
});

/* El regimen se deriva: no se puede quedar pegado uno viejo al cambiar el origen. */
test("revisar: cambiar el origen cambia la regla de comision sola", () => {
  const n = revisar(negocio({ origen_captacion: "Ref. Martin" }), AJUSTES, "2026-08-17");
  assert.equal(n.regimen_comision, "ref_martin");
  assert.equal(n.facturacion, 1500, "la regla de Martin factura la mitad");
  assert.equal(n.ganancia, 1050, "y deja el 35% del total");
});

test("revisar: marcar una suplencia la hace cobrar el 12,5% y no facturar", () => {
  const n = revisar(negocio({ es_suplencia: true }), AJUSTES, "2026-08-17");
  assert.equal(n.regimen_comision, "suplencia");
  assert.equal(n.facturacion, 0);
  assert.equal(n.ganancia, 375);
});

/* El ciclo de vida que planteo el usuario: marca "ficha completa" con la propiedad en
   negociacion, y despues la propiedad avanza. La marca tiene que dejar de valer sola. */
const propiedadEn = (estado, extra = {}) => ({
  flam: {
    entity_id: "flam", activa: estado !== "fuera", estado: estado === "fuera" ? "reservada" : estado,
    visto_primera_vez: "2026-02-01", fecha_negociacion: null, fecha_reservada: null,
    fecha_desaparicion: estado === "fuera" ? "2026-09-10" : null,
    desenlace_propuesto: estado === "fuera" ? "vendida" : null,
    ...extra,
  },
});

const completo = (extra = {}) => negocio({
  entity_id_cartera: "flam", estado: "en_curso", fecha_fin: null, fecha_boleto: null,
  ficha_completa: true, ficha_completa_momento: "en_negociacion", ...extra,
});

test("ficha completa aguanta mientras la propiedad no se mueve", () => {
  const n = revisar(completo({ puntas_confirmadas: true }), AJUSTES, "2026-08-17",
    propiedadEn("en_negociacion"));
  assert.equal(n.ficha_vigente, true);
  assert.deepEqual(tipos(n), []);
});

/* LA EXCEPCIÓN, y es a propósito. "Ficha completa" quiere decir "ya cargué todo lo que se
   puede cargar hoy", y las puntas no son un dato que falte: son un número puesto solo que
   puede duplicar la plata proyectada. Callarlo con la marca dejaba sin revisar justo los
   negocios más viejos, que son los que más tiempo llevan contando de más. */
test("las puntas se piden aunque la ficha esté dada por completa", () => {
  const n = revisar(completo(), AJUSTES, "2026-08-17", propiedadEn("en_negociacion"));
  assert.equal(n.ficha_vigente, true, "la marca sigue valiendo para todo lo demás");
  assert.deepEqual(tipos(n), ["revisar_puntas"]);
});

test("si la propiedad pasa a reservada, el negocio vuelve a la bandeja", () => {
  const n = revisar(completo(), AJUSTES, "2026-08-17", propiedadEn("reservada"));
  assert.equal(n.ficha_vigente, false, "la marca deja de aplicar");
  assert.equal(n.ficha_completa, true, "pero no se borra: el usuario decide");
  assert.ok(tipos(n).includes("ficha_reabierta"));
});

test("al pasar a reservada, la fecha del boleto se llena sola con la del robot", () => {
  const cartera = propiedadEn("reservada", { fecha_reservada: "2026-08-20" });
  const n = revisar(completo(), AJUSTES, "2026-08-25", cartera);
  assert.equal(n.fecha_boleto, "2026-08-20", "el robot ya la vio: no hay que pedirla");
});

test("la fecha de negociacion tambien se llena sola", () => {
  const cartera = propiedadEn("en_negociacion", { fecha_negociacion: "2026-06-05" });
  const n = revisar(negocio({ entity_id_cartera: "flam", fecha_negociacion: null }),
    AJUSTES, "2026-08-17", cartera);
  assert.equal(n.fecha_negociacion, "2026-06-05");
});

test("lo que el usuario cargo a mano no se pisa con lo del robot", () => {
  const cartera = propiedadEn("reservada", { fecha_reservada: "2026-08-20" });
  const n = revisar(completo({ fecha_boleto: "2026-08-01" }), AJUSTES, "2026-08-25", cartera);
  assert.equal(n.fecha_boleto, "2026-08-01");
});

/* Lo mas importante: cuando la propiedad se va de RE/MAX estando reservada, el robot
   entiende que se vendio. Ahi hay que cargar el cierre, y es plata. */
test("cuando la propiedad se va de la cartera, el negocio pide el cierre", () => {
  const n = revisar(completo(), AJUSTES, "2026-09-15", propiedadEn("fuera"));
  assert.equal(n.ficha_vigente, false, "la marca deja de valer");
  const t = tipos(n);
  assert.ok(t.includes("ficha_reabierta"));
  assert.ok(t.includes("cerrar_negocio"));
  assert.ok(t.includes("sin_fecha_fin"), "ahora si se puede pedir la fecha de firma");
  assert.match(n.avisos.find((a) => a.tipo === "cerrar_negocio").detalle, /estando reservada/);
});

/* UNA SOLA PREGUNTA. Lo demás la app lo sabe: la fecha de firma es el día que dejó de
   aparecer y lo cobrado sale del precio de cierre ya cargado. Lo pidió Juan así. */
test("al irse de la cartera se pregunta UNA cosa: si se concretó o se cayó", () => {
  const cartera = propiedadEn("fuera", { desenlace_propuesto: "caida" });
  const n = revisar(completo(), AJUSTES, "2026-09-15", cartera);
  const texto = n.avisos.find((a) => a.tipo === "cerrar_negocio").detalle;
  assert.match(texto, /¿Se concretó o se cayó\?/);
  assert.doesNotMatch(texto, /Cargá la fecha/, "la fecha ya no se pide: la pone sola");
  assert.doesNotMatch(texto, /lo que cobraste/, "y lo cobrado sale del precio de cierre");
});

test("una vez cargado el cierre, deja de reclamarse", () => {
  const cerrado = completo({
    ficha_completa: false, ficha_completa_momento: null,
    fecha_fin: "2026-09-12", fecha_boleto: "2026-08-20", estado: "cerrado",
  });
  const t = tipos(revisar(cerrado, AJUSTES, "2026-09-15", propiedadEn("fuera")));
  assert.ok(!t.includes("cerrar_negocio"));
  assert.ok(!t.includes("sin_fecha_fin"));
});

test("volver a marcar ficha completa en el momento nuevo la mantiene callada", () => {
  const reMarcado = completo({ ficha_completa_momento: "fuera_de_cartera" });
  const n = revisar(reMarcado, AJUSTES, "2026-09-15", propiedadEn("fuera"));
  assert.equal(n.ficha_vigente, true);
  assert.ok(!tipos(n).includes("ficha_reabierta"));
});

test("un negocio sin propiedad de la cartera conserva su ficha completa para siempre", () => {
  const suelto = negocio({
    ficha_completa: true, ficha_completa_momento: null, fecha_fin: null,
    puntas_confirmadas: true,
  });
  const n = revisar(suelto, AJUSTES, "2026-08-17", {});
  assert.equal(n.ficha_vigente, true);
  assert.deepEqual(tipos(n), []);
});

/* Repasar dos veces tiene que dar lo mismo: la app lo hace en cada arranque. */
test("revisar es idempotente: pasarlo dos veces no cambia nada", () => {
  const cartera = propiedadEn("fuera");
  const una = revisar(completo(), AJUSTES, "2026-09-15", cartera);
  const dos = revisar(una, AJUSTES, "2026-09-15", cartera);
  assert.deepEqual(tipos(dos), tipos(una));
  assert.equal(dos.ficha_vigente, una.ficha_vigente);
  assert.equal(dos.facturacion, una.facturacion);
  assert.equal(dos.ganancia, una.ganancia);
});

/* Lo que hizo el usuario en vivo con Juana de Ibarbourou: borro la fecha de firma que
   habia inventado. El negocio quedaba marcado como CERRADO y sin fecha, que no puede ser:
   sin firma no hay nada cobrado. */
test("revisar: borrar la fecha de firma no puede dejar el negocio como cerrado", () => {
  const conFirmaInventada = revisar(
    negocio({ fecha_fin: "2026-12-05" }), AJUSTES, "2026-08-17"
  );
  assert.equal(conFirmaInventada.estado, "en_curso");

  const sinFecha = revisar({ ...conFirmaInventada, fecha_fin: null }, AJUSTES, "2026-08-17");
  assert.equal(sinFecha.estado, "en_curso", "sin firma no hay nada cobrado");
  assert.equal(sinFecha.fecha_fin_estimada, false);
  assert.ok(tipos(sinFecha).includes("sin_fecha_fin"));
});

test("revisar: un negocio cerrado al que le borran la firma vuelve a en curso", () => {
  const n = revisar(negocio({ estado: "cerrado", fecha_fin: null }), AJUSTES, "2026-08-17");
  assert.equal(n.estado, "en_curso");
});

test("revisar: con la firma cargada y pasada, si cierra", () => {
  const n = revisar(
    negocio({ estado: "en_curso", fecha_fin: "2026-07-01", fecha_fin_estimada: true }),
    AJUSTES, "2026-08-17"
  );
  assert.equal(n.estado, "cerrado");
  assert.equal(n.fecha_fin_estimada, false);
});

test("revisar: pero no cierra solo si la propiedad sigue viva en la cartera", () => {
  const n = revisar(
    negocio({ entity_id_cartera: "flam", estado: "en_curso",
              fecha_fin: "2026-07-01", fecha_fin_estimada: true }),
    AJUSTES, "2026-08-17", CARTERA_VIVA
  );
  assert.equal(n.estado, "en_curso", "la propiedad sigue publicada: no se cobro");
});

/* El caso exacto del usuario: cargo "Martin Sedes" en el campo que no movia la plata,
   sobre una venta de 40.000 al 6%. La ganancia seguia en 1.080 en vez de bajar a 840. */
test("revisar: el referidor viejo se absorbe y la comision se corrige sola", () => {
  const venta = negocio({
    precio_operacion: 40000, pct_comision_total: 0.06, puntas: 2,
    origen_captacion: "Sin origen", referidor: "Martin Sedes",
  });
  const n = revisar(venta, AJUSTES, "2026-08-17");
  assert.equal(n.origen_captacion, "Ref. Martin");
  assert.equal(n.referidor, null, "el campo viejo se vacia para no volver a confundir");
  assert.equal(n.regimen_comision, "ref_martin");
  assert.equal(n.base, 2400);
  assert.equal(n.facturacion, 1200, "la regla de Martin factura la mitad");
  assert.equal(n.ganancia, 840, "y deja el 35% del total, no el 45%");
});

test("revisar: si el origen ya decia quien refirio, el referidor viejo no lo pisa", () => {
  const n = revisar(
    negocio({ origen_captacion: "Ref. Cliente", referidor: "Martin Sedes" }),
    AJUSTES, "2026-08-17"
  );
  assert.equal(n.origen_captacion, "Ref. Cliente");
  assert.equal(n.regimen_comision, "captacion_mia");
});

/* El bug que cazo el usuario: cambio el origen a "Ref. Martin" en una venta EN CURSO, el
   cartel decia la regla de Martin y los numeros seguian siendo los de antes.

   La causa: la plata solo se recalculaba si habia fecha de firma. Un negocio en curso no
   la tiene todavia, asi que no se recalculaba NUNCA. */
test("revisar: un negocio sin fecha de firma tambien recalcula la plata", () => {
  const enCurso = negocio({
    fecha_fin: null, precio_operacion: 40000, pct_comision_total: 0.06,
    origen_captacion: "Ref. Martin",
    facturacion: 2400, ganancia: 1080,   // los numeros viejos, de cuando era captacion mia
  });
  const n = revisar(enCurso, AJUSTES, "2026-08-17");
  assert.equal(n.base, 2400);
  assert.equal(n.facturacion, 1200, "Martin factura la mitad");
  assert.equal(n.ganancia, 840, "y deja el 35% del total, no el 45%");
});

test("revisar: sin fecha de firma se usa la categoria de HOY", () => {
  const n = revisar(
    negocio({ fecha_fin: null, precio_operacion: 100000, pct_comision_total: 0.03 }),
    AJUSTES, "2026-08-17"
  );
  assert.equal(n.categoria_vigente, "RAP");
  assert.equal(n.ganancia, 1350, "45% de 3.000");
});

/* La regla de corte no se toca: lo anterior a 2026 sigue respetando el Excel. */
test("revisar: un negocio viejo con fecha sigue sin recalcularse", () => {
  const n = revisar(
    negocio({ fecha_fin: "2024-05-01", facturacion: 999, ganancia: 111 }),
    AJUSTES, "2026-08-17"
  );
  assert.equal(n.facturacion, 999);
  assert.equal(n.ganancia, 111);
});

/* ---------- Una busqueda no tiene fecha de publicacion propia ---------- */

/* La propiedad la publico OTRO agente: cuando salio a la venta no se sabe y no sirve. */
test("ninguna busqueda inventa cuando se publico", () => {
  for (const atajo of ["busqueda", "busqueda_alquiler"]) {
    const p = plantillaNegocio(atajo, AJUSTES, "2026-08-18");
    assert.equal(p.fecha_inicio, null, `${atajo} no deberia inventar cuando se publico`);
    assert.equal(esBusqueda(p, AJUSTES), true);
  }
});

/* Una busqueda DE VENTA se carga el dia que aparecio el comprador: eso es la negociacion. */
test("una busqueda de venta arranca con la negociacion de hoy", () => {
  const p = plantillaNegocio("busqueda", AJUSTES, "2026-08-18");
  assert.equal(p.fecha_negociacion, "2026-08-18");
  assert.equal(p.fecha_boleto, null);
});

/* Pero una busqueda DE ALQUILER se carga recien cuando YA hay reserva. Juan: "la cargo solo
   si consegui la reserva del alquiler". Ahi la fecha que se pone sola es la de la reserva. */
test("una busqueda de alquiler arranca con la reserva de hoy, sin negociacion", () => {
  const p = plantillaNegocio("busqueda_alquiler", AJUSTES, "2026-08-18");
  assert.equal(p.fecha_boleto, "2026-08-18");
  assert.equal(p.fecha_negociacion, null, "un alquiler no pasa por negociacion");
});

/* UNA SUPLENCIA SE ANOTA CUANDO YA PASO, así que la fecha viene puesta con el día de la
   carga —y queda editable, por si la anotó tarde—. Pero la que se pone es LA RESERVA, no la
   negociación: la negociación es un estado del portal de OTRO agente, que ni ve.
   Y "cuándo se publicó" no se pide: esa propiedad ni es suya. */
test("una suplencia de venta nace con la reserva de hoy, sin negociación", () => {
  const p = plantillaNegocio("suplencia", AJUSTES, "2026-08-18");
  assert.equal(p.fecha_boleto, "2026-08-18");
  assert.equal(p.fecha_negociacion, null, "el portal es de otro: ese estado no lo ves");
  assert.equal(p.fecha_inicio, null, "cuándo se publicó no importa: no es tu propiedad");
});

/* EN UN ALQUILER NO HAY NEGOCIACIÓN: se firma y listo. Ahí la que se pone es la reserva. */
test("una suplencia de alquiler nace con la reserva de hoy, sin negociación", () => {
  const p = plantillaNegocio("suplencia_alquiler", AJUSTES, "2026-08-18");
  assert.equal(p.fecha_boleto, "2026-08-18");
  assert.equal(p.fecha_negociacion, null, "un alquiler no pasa por negociación");
  assert.equal(p.tipo_negocio, "alquiler");
});

test("las dos suplencias cobran igual: el 12,5% y no facturan", () => {
  for (const atajo of ["suplencia", "suplencia_alquiler"]) {
    const p = plantillaNegocio(atajo, AJUSTES, "2026-08-18");
    assert.equal(p.es_suplencia, true);
    assert.equal(p.puntas, 0);
  }
});

test("un referido que das sigue arrancando con la fecha de publicación", () => {
  const p = plantillaNegocio("yo_referi", AJUSTES, "2026-08-18");
  assert.equal(p.fecha_inicio, "2026-08-18");
  assert.equal(p.fecha_negociacion, null);
});

test("a una busqueda no se le reclama la fecha de publicacion", () => {
  const p = plantillaNegocio("busqueda", AJUSTES, "2026-08-18");
  const r = revisar({ ...p, id: "n1" }, AJUSTES, "2026-08-18", {});
  assert.ok(!(r.avisos || []).some((a) => a.tipo === "falta_fecha_inicio"),
    "no tiene por que saber cuando publico otro agente");
});

test("a un negocio propio sin fecha de inicio SI se le reclama", () => {
  const p = plantillaNegocio("venta", AJUSTES, "2026-08-18");
  const r = revisar({ ...p, id: "n1", fecha_inicio: null }, AJUSTES, "2026-08-18", {});
  assert.ok((r.avisos || []).some((a) => a.tipo === "falta_fecha_inicio"));
});

/* Si la busqueda se carga tarde, la reserva puede quedar antes que su propia negociacion. */
test("avisa cuando el boleto es anterior a la negociacion", () => {
  const r = revisar({
    id: "n1", tipo_negocio: "venta", estado: "en_curso",
    fecha_negociacion: "2026-08-18", fecha_boleto: "2026-08-10",
  }, AJUSTES, "2026-08-18", {});
  assert.ok((r.avisos || []).some((a) => a.tipo === "fechas_al_reves"
    && /anterior a la negociación/.test(a.detalle)));
});

test("en el orden correcto no avisa nada", () => {
  const r = revisar({
    id: "n1", tipo_negocio: "venta", estado: "en_curso",
    fecha_negociacion: "2026-08-10", fecha_boleto: "2026-08-18",
  }, AJUSTES, "2026-08-18", {});
  assert.ok(!(r.avisos || []).some((a) => a.tipo === "fechas_al_reves"));
});

test("con una sola de las dos fechas no inventa un aviso", () => {
  for (const parcial of [{ fecha_negociacion: "2026-08-18" }, { fecha_boleto: "2026-08-10" }]) {
    const r = revisar({ id: "n1", tipo_negocio: "venta", estado: "en_curso", ...parcial },
      AJUSTES, "2026-08-18", {});
    assert.ok(!(r.avisos || []).some((a) => a.tipo === "fechas_al_reves"));
  }
});

/* ---------- Una punta o dos ---------- */

/* EL PROBLEMA QUE ESTO EVITA: cuando una propiedad de la cartera pasa a negociación, el
   negocio nace con Juan de los DOS lados —la propiedad es suya, así que el aviso es suyo— y
   eso da 2 puntas. Pero al comprador casi siempre lo trae otro agente: ahí es 1, y ese
   negocio está proyectando el DOBLE de la ganancia que va a entrar.

   Mirando la pantalla no se nota: un 2 puesto por defecto se ve igual que un 2 confirmado. */
test("revisar: un negocio en curso pide confirmar si es una punta o dos", () => {
  const n = revisar(negocio({ estado: "en_curso", fecha_fin: null, puntas: 2 }),
    AJUSTES, "2026-08-17");
  assert.ok(tipos(n).includes("revisar_puntas"));
  assert.match(n.avisos.find((a) => a.tipo === "revisar_puntas").detalle, /vale la mitad/);
});

/* No alcanza con avisar cuando el dato FALTA: acá el dato está, lo que no se sabe es si
   alguien lo miró. Por eso se pide hasta que se confirma a mano. */
test("revisar: el aviso se apaga recién cuando se confirma", () => {
  const n = revisar(negocio({ estado: "en_curso", fecha_fin: null, puntas_confirmadas: true }),
    AJUSTES, "2026-08-17");
  assert.ok(!tipos(n).includes("revisar_puntas"));
});

/* Un negocio ya cobrado no hace falta revisarlo: la plata entró y se sabe cuánta fue.
   Pedirlo para los ochenta y pico cerrados sería un aluvión que no cambia nada. */
test("revisar: a un negocio ya cobrado no se le pide", () => {
  assert.ok(!tipos(revisar(negocio(), AJUSTES, "2026-08-17")).includes("revisar_puntas"));
});

/* UNA BUSQUEDA ES SIEMPRE UNA PUNTA, Y SIEMPRE LA COMPRADORA. Es la definicion: le
   encontraste vos la propiedad a un comprador, el aviso era de otro. Lo dijo Juan como
   regla, asi que no hay nada que preguntar: se fija sola. */
test("en una búsqueda las puntas no se preguntan: se fijan solas", () => {
  const n = revisar(negocio({
    estado: "en_curso", fecha_fin: null, puntas: 2,
    agente_vende: "Otro", agente_compra: "Juan Andrés Otero",
  }), AJUSTES, "2026-08-17");
  assert.equal(n.puntas, 1, "una búsqueda es una punta, aunque estuviera cargada con dos");
  assert.equal(n.puntas_confirmadas, true);
  assert.ok(!tipos(n).includes("revisar_puntas"), "y no se pregunta nada");
});
test("comoEstaContando dice qué está contando y qué pasa si está mal", () => {
  assert.match(comoEstaContando({ puntas: 2 }, AJUSTES), /LAS DOS PUNTAS/);
  assert.match(comoEstaContando({ puntas: 1 }, AJUSTES), /el doble/);
  assert.match(comoEstaContando({ puntas: 0 }, AJUSTES), /no está sumando ganancia/);
});

/* ---------- Un negocio se puede caer ---------- */

/* EL CASO EXACTO QUE REPORTÓ JUAN: le borró la fecha de negociación a un negocio para avisar
   que se había caído. La app se la reponía sola desde la cartera —la propiedad seguía
   figurando en negociación en RE/MAX— y encima le seguía pidiendo confirmar las puntas. */
test("a un negocio caído no se le repone la fecha que se borró", () => {
  const cartera = propiedadEn("en_negociacion", { fecha_negociacion: "2026-08-07" });
  const sinFecha = negocio({
    estado: CAIDO, fecha_fin: null, fecha_negociacion: null,
    entity_id_cartera: "flam",
  });
  const n = revisar(sinFecha, AJUSTES, "2026-08-20", cartera);
  assert.equal(n.fecha_negociacion, null, "la fecha borrada NO vuelve");
  assert.equal(n.estado, CAIDO, "y no revive solo");
});

test("a un negocio caído no se le pide nada", () => {
  const n = revisar(negocio({ estado: CAIDO, fecha_fin: null, direccion: null, barrio: null }),
    AJUSTES, "2026-08-20");
  assert.deepEqual(tipos(n), [], "ni las puntas ni los datos que falten");
  assert.equal(estaCaido(n), true);
});

/* Todos los cálculos filtran por "en_curso" o "cerrado", así que un caído queda afuera solo:
   no suma a lo encaminado ni a lo cobrado. */
test("un caído no es ni en curso ni cerrado, así que no suma en ningún lado", () => {
  const n = revisar(negocio({ estado: CAIDO, fecha_fin: null }), AJUSTES, "2026-08-20");
  assert.notEqual(n.estado, "en_curso");
  assert.notEqual(n.estado, "cerrado");
});

/* ---------- Las puntas sólo cuando hay algo pasando ---------- */

/* Una ficha abierta donde todavía no pasó nada no tiene puntas que confirmar. Preguntarlo
   ahí es preguntar algo que la app puede saber mirando las fechas y la propiedad. */
test("sin nada en marcha no se pregunta por las puntas", () => {
  const n = revisar(negocio({
    estado: "en_curso", fecha_fin: null, fecha_negociacion: null, fecha_boleto: null,
  }), AJUSTES, "2026-08-20", {});
  assert.ok(!tipos(n).includes("revisar_puntas"));
});

test("con fecha de negociación sí se pregunta", () => {
  const n = revisar(negocio({
    estado: "en_curso", fecha_fin: null, fecha_negociacion: "2026-08-07",
  }), AJUSTES, "2026-08-20", {});
  assert.ok(tipos(n).includes("revisar_puntas"));
});

test("y también si la propiedad está en negociación aunque el negocio no tenga fechas", () => {
  const cartera = propiedadEn("en_negociacion");
  const n = revisar(negocio({
    estado: "en_curso", fecha_fin: null, fecha_negociacion: null, fecha_boleto: null,
    entity_id_cartera: "flam", ficha_completa: false,
  }), AJUSTES, "2026-08-20", cartera);
  assert.ok(tipos(n).includes("revisar_puntas"));
});

test("hayAlgoEnMarcha mira las fechas y el estado de la propiedad", () => {
  assert.equal(hayAlgoEnMarcha({ fecha_negociacion: "2026-08-07" }, null), true);
  assert.equal(hayAlgoEnMarcha({ fecha_boleto: "2026-08-07" }, null), true);
  assert.equal(hayAlgoEnMarcha({}, { activa: true, estado: "reservada" }), true);
  assert.equal(hayAlgoEnMarcha({}, { activa: true, estado: "publicada" }), false);
  assert.equal(hayAlgoEnMarcha({}, { activa: false, estado: "en_negociacion" }), false);
  assert.equal(hayAlgoEnMarcha({}, null), false);
});

/* ---------- El estado sigue al portal ---------- */

/* LA REGLA QUE PUSO JUAN, y que es la primera de todas: la app tiene que ser FIEL A LO QUE
   PASA EN SU PORTAL DE RE/MAX. Si ahí la propiedad volvió a estar publicada, el negocio que
   estaba en negociación no existe más — y la app puede verlo sola, sin preguntar.

   El dato ya estaba: el robot guarda `fecha_negociacion` la primera vez que entra y no la
   limpia al salir, así que "tiene fecha pero hoy figura publicada" es volver para atrás. */
test("volvioAlMercado: estuvo en negociación y hoy está publicada", () => {
  assert.equal(volvioAlMercado(
    { activa: true, estado: "publicada", fecha_negociacion: "2026-08-07" }), true);
  assert.equal(volvioAlMercado(
    { activa: true, estado: "publicada", fecha_reservada: "2026-08-07" }), true);
});

test("volvioAlMercado: una publicada que nunca negoció no volvió de ningún lado", () => {
  assert.equal(volvioAlMercado({ activa: true, estado: "publicada" }), false);
});

test("volvioAlMercado: si sigue en negociación no volvió nada", () => {
  assert.equal(volvioAlMercado(
    { activa: true, estado: "en_negociacion", fecha_negociacion: "2026-08-07" }), false);
});

/* Una propiedad que se fue de la cartera es otro caso: ahí se pide el cierre, no se da por
   caído — irse casi siempre significa que se vendió. */
test("volvioAlMercado: una que se fue de la cartera no cuenta", () => {
  assert.equal(volvioAlMercado(
    { activa: false, estado: "publicada", fecha_negociacion: "2026-08-07" }), false);
});

test("el negocio se da por caído solo cuando la propiedad vuelve al mercado", () => {
  const cartera = propiedadEn("publicada", { fecha_negociacion: "2026-08-07" });
  const n = revisar(negocio({
    estado: "en_curso", fecha_fin: null, entity_id_cartera: "flam",
  }), AJUSTES, "2026-08-20", cartera);
  assert.equal(estaCaido(n), true);
  assert.equal(n.se_cayo_solo, true);
  assert.ok(tipos(n).includes("se_cayo_solo"), "y se avisa: los números cambiaron");
});

/* Simétrico: si vuelve a negociación, revive solo. Fiel al portal en las dos direcciones. */
test("y revive solo si la propiedad vuelve a negociación", () => {
  const caido = revisar(negocio({
    estado: "en_curso", fecha_fin: null, entity_id_cartera: "flam",
  }), AJUSTES, "2026-08-20", propiedadEn("publicada", { fecha_negociacion: "2026-08-07" }));
  assert.equal(estaCaido(caido), true);

  const revivido = revisar(caido, AJUSTES, "2026-08-21",
    propiedadEn("en_negociacion", { fecha_negociacion: "2026-08-07" }));
  assert.equal(revivido.estado, "en_curso");
  assert.equal(revivido.se_cayo_solo, false);
});

/* Una corrección explícita le gana al portal: puede haber republicado la propiedad para
   buscar otro comprador mientras el primero define, y eso en RE/MAX no se ve. */
test("si lo marcó a mano, el portal deja de mandar", () => {
  const cartera = propiedadEn("publicada", { fecha_negociacion: "2026-08-07" });
  const n = revisar(negocio({
    estado: "en_curso", fecha_fin: null, entity_id_cartera: "flam", estado_a_mano: true,
  }), AJUSTES, "2026-08-20", cartera);
  assert.equal(n.estado, "en_curso", "él dijo que sigue en marcha y eso manda");
});

/* Un negocio ya cobrado no se toca: la plata entró. */
test("con fecha de firma no se da por caído nada", () => {
  const cartera = propiedadEn("publicada", { fecha_negociacion: "2026-08-07" });
  const n = revisar(negocio({ entity_id_cartera: "flam" }), AJUSTES, "2026-08-20", cartera);
  assert.equal(n.estado, "cerrado");
});

/* ---------- Lo que la app puede averiguar sola ---------- */

/* La dirección y el barrio estaban entre los que pedía TENIÉNDOLOS: si el negocio cuelga de
   una propiedad, esos datos están en la cartera. Juan: "sólo pregunte si por algún motivo no
   pudo averiguarlo y ese campo quedó vacío". */
test("la dirección y el barrio salen de la propiedad, no se preguntan", () => {
  const cartera = { flam: { entity_id: "flam", activa: true, estado: "en_negociacion",
    direccion: "Flammarion 5046", barrio: "Prado", fecha_negociacion: "2026-08-17" } };
  const n = revisar(negocio({
    direccion: null, barrio: null, entity_id_cartera: "flam", ficha_completa: false,
  }), AJUSTES, "2026-08-20", cartera);
  assert.equal(n.direccion, "Flammarion 5046");
  assert.equal(n.barrio, "Prado");
  assert.ok(!tipos(n).includes("falta_direccion"));
  assert.ok(!tipos(n).includes("falta_barrio"));
});

/* Pero si NO se pudieron averiguar, se piden: es el caso que Juan dejó abierto. */
test("si no hay propiedad de donde sacarlos, ahí sí se piden", () => {
  const n = revisar(negocio({
    direccion: null, barrio: null, entity_id_cartera: null, ficha_completa: false,
  }), AJUSTES, "2026-08-20", {});
  assert.ok(tipos(n).includes("falta_direccion"));
  assert.ok(tipos(n).includes("falta_barrio"));
});

/* ---------- Las búsquedas ---------- */

/* Una búsqueda cargada YA ESTÁ en negociación: por eso se cargó. Decírselo es contarle lo
   que acaba de escribir. Sólo se pide lo que falta. */
test("una búsqueda completa no genera ningún aviso", () => {
  const n = revisar(negocio({
    estado: "en_curso", fecha_fin: null,
    agente_vende: "Inmobiliaria exterior", agente_compra: "Juan Andrés Otero",
    origen_captacion: "B.d.r.", precio_operacion: 134000,
    fecha_negociacion: "2026-08-18", fecha_boleto: null,
    direccion: "Calle 6", barrio: "Pinar",
    ficha_completa: false, entity_id_cartera: null,
  }), AJUSTES, "2026-08-20", {});
  assert.deepEqual(tipos(n), [], "está todo cargado: no hay nada que pedir");
});

test("y si le falta algo, se pide eso y sólo eso", () => {
  const n = revisar(negocio({
    estado: "en_curso", fecha_fin: null,
    agente_vende: "Inmobiliaria exterior", agente_compra: "Juan Andrés Otero",
    origen_captacion: null, precio_operacion: null,
    fecha_negociacion: "2026-08-18", fecha_boleto: null,
    direccion: "Calle 6", barrio: "Pinar",
    ficha_completa: false, entity_id_cartera: null,
  }), AJUSTES, "2026-08-20", {});
  const texto = n.avisos.find((a) => a.tipo === "busqueda_en_curso").detalle;
  assert.match(texto, /de dónde salió el comprador/);
  assert.match(texto, /a qué precio se cierra/);
  assert.doesNotMatch(texto, /quién tiene el aviso/, "ese sí está cargado");
});

/* ---------- Una comisión imposible en una venta ---------- */

/* Salió de la auditoría del 2026-08-21: `excel-62` dice precio 4.800 con 25% de comisión.
   Los 1.200 facturados cuadran con 48.000 al 2,5%, así que lo que falta es un cero en el
   precio. No cambia la plata ya cobrada, pero ensucia el precio promedio y el ticket. */
test("una venta con 25% de comisión se avisa: no existe", () => {
  const n = revisar(negocio({ pct_comision_total: 0.25, facturacion: 1200 }),
    AJUSTES, "2026-08-21");
  const av = n.avisos.find((a) => a.tipo === "comision_absurda");
  assert.ok(av);
  assert.match(av.detalle, /le falta un cero/, "dice qué revisar, no sólo que está mal");
});

/* EN LOS ALQUILERES NO APLICA: ahí el "porcentaje" son MESES de comisión, y 1,5 quiere decir
   mes y medio. Sin esta distinción, 46 alquileres de Juan saltarían como error. */
test("en un alquiler, 1,5 son meses y no se avisa nada", () => {
  const n = revisar(negocio({ tipo_negocio: "alquiler", pct_comision_total: 1.5 }),
    AJUSTES, "2026-08-21");
  assert.ok(!tipos(n).includes("comision_absurda"));
});

test("una venta con una comisión normal no dispara nada", () => {
  assert.ok(!tipos(revisar(negocio({ pct_comision_total: 0.03 }), AJUSTES, "2026-08-21"))
    .includes("comision_absurda"));
});

/* ---------- Una propiedad que referiste ---------- */

/* Es el ESPEJO de una búsqueda. En una búsqueda tenés la punta compradora y el aviso es de
   otro; acá NO TENÉS NINGUNA PUNTA — la propiedad no es tuya, no está en tu cartera y el
   negocio lo hace el colega. Te toca el 25% de la comisión TOTAL, de una punta o de dos, y de
   ahí tu split. Lo explicó Juan el 2026-08-21. */
test("de un referido que diste te toca el 25% de la comisión total, y de ahí tu split", () => {
  const [factura, bolsillo] = calcular("yo_referi", 12000, "2026-08-21", AJUSTES);
  assert.equal(factura, 3000, "el 25% de los 12.000 de comisión total");
  assert.equal(bolsillo, 1350, "y el 45% de RAP sobre esos 3.000");
});

/* No cambia con las puntas: el 25% es del total de la operación, la haya hecho el colega con
   una punta o con las dos. */
test("el 25% es del total, no cambia con las puntas", () => {
  const [unaPunta] = calcular("yo_referi", 6000, "2026-08-21", AJUSTES);
  const [dosPuntas] = calcular("yo_referi", 12000, "2026-08-21", AJUSTES);
  assert.equal(unaPunta, 1500);
  assert.equal(dosPuntas, 3000, "el doble de comisión total, el doble para vos");
});

test("una referida se reconoce por la marca, no por los agentes", () => {
  assert.equal(esReferidaMia({ yo_referi: true }), true);
  assert.equal(esReferidaMia({ yo_referi: false }), false);
  assert.equal(esReferidaMia(null), false);
});

/* No tenés ninguna punta, así que preguntarlas no tiene sentido. */
test("a una referida no se le preguntan las puntas", () => {
  const n = revisar(negocio({
    yo_referi: true, regimen_comision: "yo_referi", estado: "en_curso", fecha_fin: null,
    fecha_negociacion: "2026-08-18", fecha_boleto: null, referido_a: "Otra Oficina",
    referido_a_nombre: "Ana Pérez", precio_operacion: 200000, ficha_completa: false,
  }), AJUSTES, "2026-08-21", {});
  assert.ok(!tipos(n).includes("revisar_puntas"));
});

/* PUEDE CARGARSE ANTES DE QUE NEGOCIE: la refirió hoy y el colega todavía no la vendió. Ahí no
   se le pide la fecha ni el precio — no existen. */
test("una referida sin negociar todavía no pide precio ni fecha", () => {
  const n = revisar(negocio({
    yo_referi: true, regimen_comision: "yo_referi", estado: "en_curso", fecha_fin: null,
    fecha_negociacion: null, fecha_boleto: null, fecha_inicio: null,
    referido_a_nombre: "Ana Pérez", direccion: "Rivera 2020", ficha_completa: false,
  }), AJUSTES, "2026-08-21", {});
  const av = n.avisos.find((a) => a.tipo === "referida_en_curso");
  assert.ok(av);
  assert.match(av.detalle, /todavía sin negociar/);
  assert.doesNotMatch(av.detalle, /Falta/, "no le falta nada: es que todavía no pasó");
});

test("pero si ya negoció y no está el precio, ahí sí se pide", () => {
  const n = revisar(negocio({
    yo_referi: true, regimen_comision: "yo_referi", estado: "en_curso", fecha_fin: null,
    fecha_negociacion: "2026-08-18", fecha_boleto: null,
    referido_a_nombre: "Ana Pérez", direccion: "Rivera 2020",
    precio_operacion: null, ficha_completa: false,
  }), AJUSTES, "2026-08-21", {});
  assert.match(n.avisos.find((a) => a.tipo === "referida_en_curso").detalle,
    /a qué precio se cierra/);
});

test("y se pide a quién se la referiste, que es el único que sabe cómo va", () => {
  const n = revisar(negocio({
    yo_referi: true, regimen_comision: "yo_referi", estado: "en_curso", fecha_fin: null,
    fecha_negociacion: null, fecha_boleto: null, fecha_inicio: null,
    referido_a: null, referido_a_nombre: null, direccion: "Rivera 2020",
    ficha_completa: false,
  }), AJUSTES, "2026-08-21", {});
  assert.match(n.avisos.find((a) => a.tipo === "referida_en_curso").detalle,
    /a quién se la referiste/);
});

/* ---------- La plata acordada a mano ---------- */

/* Hay operaciones que no salen de ningún porcentaje. Juan: "es una excepción porque Martín me
   hizo un favor por otro favor que le había hecho y me quiso dar ese monto. Respeta únicamente
   el monto facturado y a mi bolsillo, lo demás dejalo". */
test("con la plata acordada, el porcentaje imposible deja de avisarse", () => {
  const n = revisar(negocio({
    pct_comision_total: 0.25, facturacion: 1200, plata_acordada: true,
  }), AJUSTES, "2026-08-21");
  assert.ok(!tipos(n).includes("comision_absurda"));
});

/* Y lo más importante: esos montos NO se vuelven a calcular. Una regla que nunca se aplicó no
   puede pisarle los números al arreglo que de verdad hubo. */
test("un negocio con la plata acordada no se recalcula nunca", () => {
  const n = revisar(negocio({
    plata_acordada: true, fecha_fin: "2026-06-10", estado: "cerrado",
    base: 3000, facturacion: 1200, ganancia: 540,
    regimen_comision: "captacion_mia",
  }), AJUSTES, "2026-08-21");
  assert.equal(n.facturacion, 1200, "el monto acordado se respeta");
  assert.equal(n.ganancia, 540);
});

/* Sin la marca, ese mismo negocio SÍ se recalcula: es el comportamiento normal. */
test("sin la marca, la plata se recalcula como siempre", () => {
  const n = revisar(negocio({
    fecha_fin: "2026-06-10", estado: "cerrado",
    base: 3000, facturacion: 1200, ganancia: 540,
    regimen_comision: "captacion_mia",
  }), AJUSTES, "2026-08-21");
  assert.equal(n.facturacion, 3000, "vuelve a salir de la regla");
});

/* ---------- Cada tipo pide lo suyo ---------- */

/* Todo lo que se carga desde "+ Nuevo" trae `atajo`: ahí ya se eligió qué es, y volver a
   preguntarlo adentro deja la puerta abierta a que las dos respuestas no coincidan. */
test("los negocios cargados a mano traen el atajo con el que se crearon", () => {
  for (const atajo of ["busqueda", "suplencia", "suplencia_alquiler", "yo_referi", "venta"]) {
    assert.equal(plantillaNegocio(atajo, AJUSTES, "2026-08-21").atajo, atajo);
  }
});

/* Ni la vendedora ni la compradora son tuyas: el negocio lo hace el colega. Antes los dos
   campos aparecían, y encima marcados como "falta", pidiendo un dato que no existe. */
test("en una referida no se pide ningún agente del negocio", () => {
  const p = plantillaNegocio("yo_referi", AJUSTES, "2026-08-21");
  assert.equal(p.agente_vende, null);
  assert.equal(p.agente_compra, null);
});

/* En una búsqueda el comprador lo trajiste vos: es la definición. */
test("en una búsqueda vos sos el que trae al comprador", () => {
  const p = plantillaNegocio("busqueda", AJUSTES, "2026-08-21");
  assert.equal(p.agente_compra, "Juan Andrés Otero");
  assert.notEqual(p.agente_vende, "Juan Andrés Otero", "el aviso es de otro");
});

/* ================================================================== EL COBRO DE UNA SUPLENCIA

   Juan: "no importa las puntas sino el monto que cobro para sumarlo a mis ganancias. la
   realidad que de ahi no facturo nada a remax".

   Cubrir una visita no sale de ningun porcentaje: es lo que arreglo con el colega. Si lo
   escribe, ese es el numero. Si no, sigue valiendo la cuenta vieja del 12,5%, que es de
   donde salen las suplencias que vinieron del Excel. */

test("en una suplencia manda el monto que cobraste, y no factura nada", () => {
  const n = revisar({
    ...plantillaNegocio("suplencia", AJUSTES, "2026-08-18"),
    id: "s-1",
    precio_operacion: 200000,
    pct_comision_total: 0.03,
    cobrado_suplencia: 400,
    fecha_fin: "2026-08-18",
  }, AJUSTES, "2026-08-20");
  assert.equal(n.ganancia, 400, "lo que entra es lo que cobraste");
  assert.equal(n.facturacion, 0, "una suplencia no factura por RE/MAX");
});

test("sin monto cargado, una suplencia sigue calculando el 12,5%", () => {
  const n = revisar({
    ...plantillaNegocio("suplencia", AJUSTES, "2026-08-18"),
    id: "s-2",
    precio_operacion: 200000,
    pct_comision_total: 0.03,
    fecha_fin: "2026-08-18",
  }, AJUSTES, "2026-08-20");
  assert.equal(n.ganancia, 750, "el 12,5% de 6.000");
  assert.equal(n.facturacion, 0);
});

test("el monto cobrado manda aunque el precio diga otra cosa", () => {
  const uno = { id: "s-3", es_suplencia: true, tipo_negocio: "venta", puntas: 0,
    precio_operacion: 200000, pct_comision_total: 0.03, cobrado_suplencia: 400,
    fecha_fin: "2026-08-18" };
  const a = revisar(uno, AJUSTES, "2026-08-20");
  const b = revisar({ ...uno, precio_operacion: 900000 }, AJUSTES, "2026-08-20");
  assert.equal(a.ganancia, b.ganancia, "cambiar el precio no puede mover lo que cobraste");
});

test("un cobro de cero es un dato, no un campo vacio", () => {
  const n = revisar({
    id: "s-4", es_suplencia: true, tipo_negocio: "venta", puntas: 0,
    precio_operacion: 200000, pct_comision_total: 0.03, cobrado_suplencia: 0,
    fecha_fin: "2026-08-18",
  }, AJUSTES, "2026-08-20");
  assert.equal(n.ganancia, 0, "si cobraste cero, entraron cero: no el 12,5%");
});

/* ==================================================== LO QUE LE FALTA A UNA SUPLENCIA

   Juan, mirando la ficha de una suplencia recién cargada: "en el apartado de que falta aca
   esta todo mal". Le reclamaba cuándo se publicó y de dónde salió — dos campos que ni
   siquiera existen en una suplencia, porque esa propiedad no es tuya y ese cliente no llegó
   a vos. Pedía datos que el propio formulario no ofrece.

   Lo único que falta en una suplencia es la fecha del día que te la pagan. */

const unaSuplencia = (extra = {}) => revisar({
  ...plantillaNegocio("suplencia", AJUSTES, "2026-08-18"),
  id: "sup", direccion: "Buenos Aires y Río Danubio", barrio: "Lagomar",
  agente_vende: "Martin Sedes", cobrado_suplencia: 16800, ...extra,
}, AJUSTES, "2026-08-21");

const tiposDe = (n) => (n.avisos || []).map((a) => a.tipo);

test("a una suplencia no se le pide cuándo se publicó ni de dónde salió", () => {
  const t = tiposDe(unaSuplencia());
  assert.ok(!t.includes("falta_fecha_inicio"), "ese campo no existe en una suplencia");
  assert.ok(!t.includes("origen_sin_clasificar"), "el negocio no salió de vos");
  assert.ok(!t.includes("faltan_agentes"), "los agentes de esa operación no son puntas tuyas");
});

test("lo único que le falta a una suplencia cargada es la fecha de cierre", () => {
  const n = unaSuplencia();
  assert.deepEqual(tiposDe(n), ["suplencia_sin_cobrar"]);
  assert.match(n.avisos[0].detalle, /fecha de cierre/);
});

test("si además falta el monto o a quién cubriste, lo dice en el mismo aviso", () => {
  const n = unaSuplencia({ cobrado_suplencia: undefined, agente_vende: null });
  const [a] = n.avisos.filter((x) => x.tipo === "suplencia_sin_cobrar");
  assert.match(a.detalle, /cuánto cobraste/);
  assert.match(a.detalle, /a quién cubriste/);
  assert.match(a.detalle, /fecha de cierre/);
});

test("una suplencia ya cobrada deja de reclamar nada", () => {
  const n = unaSuplencia({ fecha_fin: "2026-08-21" });
  assert.ok(!tiposDe(n).includes("suplencia_sin_cobrar"));
});
