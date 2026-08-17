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

test("revisar: conserva los avisos que solo el importador puede saber", () => {
  // 'separador_decimal' salio de comparar contra la celda del Excel; la app no puede
  // recalcularlo, asi que no se pierde al editar.
  const conAviso = negocio({ avisos: [{ tipo: "separador_decimal", detalle: "x" }] });
  assert.ok(tipos(revisar(conAviso, AJUSTES, "2026-08-17")).includes("separador_decimal"));
});

test("revisar: no modifica el negocio original", () => {
  const original = negocio({ fecha_inicio: null });
  revisar(original, AJUSTES, "2026-08-17");
  assert.deepEqual(original.avisos, []);
});
