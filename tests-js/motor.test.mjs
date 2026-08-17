import { test } from "node:test";
import assert from "node:assert/strict";
import { base, splitVigente, calcular, pctPorDefecto, revisar, REGIMENES } from "../lib/motor.js";

const AJUSTES = {
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
  const n = revisar(completo(), AJUSTES, "2026-08-17", propiedadEn("en_negociacion"));
  assert.equal(n.ficha_vigente, true);
  assert.deepEqual(tipos(n), []);
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
  assert.match(n.avisos.find((a) => a.tipo === "cerrar_negocio").detalle, /se cerró/);
});

test("si se va sin estar reservada, se pregunta si se concreto o se cayo", () => {
  const cartera = propiedadEn("fuera", { desenlace_propuesto: "caida" });
  const n = revisar(completo(), AJUSTES, "2026-09-15", cartera);
  assert.match(n.avisos.find((a) => a.tipo === "cerrar_negocio").detalle, /si se cayó/);
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
  const suelto = negocio({ ficha_completa: true, ficha_completa_momento: null, fecha_fin: null });
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
