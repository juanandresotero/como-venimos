import { test } from "node:test";
import assert from "node:assert/strict";
import { ratios, capas, ritmo, porAnio, metricas, comparativaCategorias } from "../lib/salud.js";

const AJUSTES = {
  probabilidades_cierre: { reservada: 0.9, en_negociacion: 0.6, publicada: 0.25 },
  objetivo_personal: { "2026": 65000 },
};

const AJUSTES_CAT = {
  categorias: [{ categoria: "RAP", split_pct: 0.45, fee_mensual_usd: 70, desde: "2026-01-01", hasta: null }],
  escalones: [
    { categoria: "RAP", split_pct: 0.45, fee_mensual_usd: 70 },
    { categoria: "ALTO", split_pct: 0.60, fee_mensual_usd: 425 },
    { categoria: "PURO", split_pct: 0.80, fee_mensual_usd: 975 },
  ],
};

function negocio(x = {}) {
  return {
    id: "n1", tipo_negocio: "venta", estado: "cerrado",
    fecha_fin: "2026-03-01", precio_operacion: 100000,
    facturacion: 3000, ganancia: 1350, entity_id_cartera: null,
    direccion: "Calle 100", ...x,
  };
}

function propiedad(x = {}) {
  return {
    entity_id: "p1", direccion: "Calle 200", precio: 100000,
    estado: "publicada", activa: true, usar_en_proyeccion: true, ...x,
  };
}

test("ratios: usa la mediana, no el promedio", () => {
  // Con un dato roto, el promedio se dispara y la mediana aguanta.
  const lista = [
    negocio({ precio_operacion: 100000, facturacion: 4500, ganancia: 2000 }),
    negocio({ precio_operacion: 100000, facturacion: 4500, ganancia: 2000 }),
    negocio({ precio_operacion: 100, facturacion: 900000, ganancia: 900000 }),
  ];
  const r = ratios(lista);
  assert.equal(r.venta.fact, 0.045);
});

test("ratios: separa venta de alquiler", () => {
  const lista = [
    negocio({ tipo_negocio: "venta", precio_operacion: 100000, facturacion: 4500, ganancia: 1800 }),
    negocio({ tipo_negocio: "alquiler", precio_operacion: 400, facturacion: 800, ganancia: 280 }),
  ];
  const r = ratios(lista);
  assert.equal(r.venta.fact, 0.045);
  assert.equal(r.alquiler.fact, 2);
});

test("ratios: sin datos devuelve cero y no revienta", () => {
  const r = ratios([]);
  assert.equal(r.venta.fact, 0);
  assert.equal(r.alquiler.gan, 0);
});

test("capa 1: solo lo cerrado del año", () => {
  const lista = [
    negocio({ estado: "cerrado", facturacion: 3000, ganancia: 1350 }),
    negocio({ estado: "en_curso", facturacion: 5000, ganancia: 2000 }),
    negocio({ estado: "cerrado", fecha_fin: "2025-03-01", facturacion: 9000, ganancia: 4000 }),
  ];
  const c = capas(lista, {}, AJUSTES, "2026");
  assert.equal(c.capa1.facturacion, 3000);
  assert.equal(c.capa1.negocios, 1);
});

test("capa 2: los en curso van con su cifra real, sin probabilidad", () => {
  const lista = [negocio({ estado: "en_curso", facturacion: 5394, ganancia: 2427 })];
  const c = capas(lista, {}, AJUSTES, "2026");
  assert.equal(c.capa2.facturacion, 5394);
  assert.equal(c.capa2.ganancia, 2427);
});

test("capa 3: proyecta por ratio y probabilidad del estado", () => {
  const lista = [negocio({ precio_operacion: 100000, facturacion: 4500, ganancia: 1800 })];
  const cartera = { p1: propiedad({ precio: 200000, estado: "publicada" }) };
  const c = capas(lista, cartera, AJUSTES, "2026");
  // 200.000 x 4,5% x 25% = 2.250
  assert.equal(Math.round(c.capa3.facturacion), 2250);
});

test("capa 3: la reservada pesa mucho mas que la publicada", () => {
  const lista = [negocio({ precio_operacion: 100000, facturacion: 4500, ganancia: 1800 })];
  const publicada = capas(lista, { p1: propiedad({ estado: "publicada" }) }, AJUSTES, "2026");
  const reservada = capas(lista, { p1: propiedad({ estado: "reservada" }) }, AJUSTES, "2026");
  assert.ok(reservada.capa3.facturacion > publicada.capa3.facturacion * 3);
});

test("capa 3: ignora las propiedades dadas de baja", () => {
  const lista = [negocio()];
  const c = capas(lista, { p1: propiedad({ activa: false }) }, AJUSTES, "2026");
  assert.equal(c.capa3.propiedades, 0);
});

test("capa 3: ignora las excluidas por el usuario (duplicados)", () => {
  const lista = [negocio()];
  const c = capas(lista, { p1: propiedad({ usar_en_proyeccion: false }) }, AJUSTES, "2026");
  assert.equal(c.capa3.propiedades, 0);
});

test("anti-doble-conteo: si la propiedad ya esta en capa 2, no va en capa 3", () => {
  const lista = [
    negocio({ precio_operacion: 100000, facturacion: 4500, ganancia: 1800 }),
    negocio({ id: "n2", estado: "en_curso", facturacion: 5394, ganancia: 2427, entity_id_cartera: "p1" }),
  ];
  const cartera = { p1: propiedad({ entity_id: "p1", estado: "reservada" }) };
  const c = capas(lista, cartera, AJUSTES, "2026");
  assert.equal(c.capa3.propiedades, 0);
  assert.equal(c.capa2.facturacion, 5394);
});

test("el detalle de capa 3 dice que propiedades entraron", () => {
  const lista = [negocio({ precio_operacion: 100000, facturacion: 4500, ganancia: 1800 })];
  const cartera = { p1: propiedad({ direccion: "Gutenberg 6100", precio: 490000 }) };
  const c = capas(lista, cartera, AJUSTES, "2026");
  assert.equal(c.capa3.detalle.length, 1);
  assert.equal(c.capa3.detalle[0].direccion, "Gutenberg 6100");
  assert.equal(c.capa3.detalle[0].probabilidad, 0.25);
});

test("el total suma las tres capas", () => {
  const lista = [
    negocio({ facturacion: 3000, ganancia: 1350 }),
    negocio({ id: "n2", estado: "en_curso", facturacion: 5000, ganancia: 2000 }),
  ];
  const c = capas(lista, {}, AJUSTES, "2026");
  assert.equal(c.total.facturacion, 8000);
  assert.equal(c.total.ganancia, 3350);
});

test("ritmo: con mas avance que calendario, va a ritmo", () => {
  // 30 de junio es el dia 181 de 365 (49,6%); con 50% del objetivo va bien.
  const r = ritmo(32500, 65000, "2026", "2026-06-30");
  assert.equal(r.aRitmo, true);
});

test("ritmo: el corte es exacto, no aproximado", () => {
  // El 2 de julio ya es el dia 183 (50,1%): con 50% del objetivo, va atrasado.
  assert.equal(ritmo(32500, 65000, "2026", "2026-07-02").aRitmo, false);
});

test("ritmo: el caso real del usuario, va atrasado", () => {
  // 20.079 cobrados al 17 de agosto contra un objetivo de 65.000.
  const r = ritmo(20079, 65000, "2026", "2026-08-17");
  assert.equal(r.aRitmo, false);
  assert.ok(Math.abs(r.avance - 0.3089) < 0.001);
  assert.ok(Math.abs(r.calendario - 0.6274) < 0.001);
});

test("ritmo: proyecta a fin de año al mismo paso", () => {
  const r = ritmo(20079, 65000, "2026", "2026-08-17");
  assert.equal(Math.round(r.proyeccion), 32004);
});

test("ritmo: dice cuanto falta y cuanto por mes", () => {
  const r = ritmo(20079, 65000, "2026", "2026-08-17");
  assert.equal(r.falta, 44921);
  // Quedan 136 dias, o sea 4,47 meses.
  assert.ok(r.porMes > 9000 && r.porMes < 11000);
});

test("ritmo: si ya se paso el objetivo, no falta nada", () => {
  const r = ritmo(70000, 65000, "2026", "2026-08-17");
  assert.equal(r.falta, 0);
  assert.equal(r.aRitmo, true);
});

test("ritmo: sin objetivo devuelve null", () => {
  assert.equal(ritmo(20079, 0, "2026", "2026-08-17"), null);
});

test("porAnio agrupa y suma solo lo cerrado", () => {
  const lista = [
    negocio({ fecha_fin: "2025-03-01", facturacion: 1000, ganancia: 450 }),
    negocio({ fecha_fin: "2026-03-01", facturacion: 3000, ganancia: 1350 }),
    negocio({ fecha_fin: "2026-05-01", facturacion: 2000, ganancia: 900 }),
    negocio({ fecha_fin: "2026-06-01", estado: "en_curso", facturacion: 9999, ganancia: 9999 }),
  ];
  const filas = porAnio(lista);
  assert.equal(filas.length, 2);
  assert.deepEqual(filas[1], { anio: "2026", negocios: 2, facturacion: 5000, ganancia: 2250 });
});

test("metricas: ticket mediano y puntas promedio", () => {
  const lista = [
    negocio({ precio_operacion: 60000, puntas: 2 }),
    negocio({ precio_operacion: 100000, puntas: 1 }),
    negocio({ precio_operacion: 140000, puntas: 2 }),
  ];
  const m = metricas(lista, "2026");
  assert.equal(m.ticketVenta, 100000);
  assert.ok(Math.abs(m.puntasPromedio - 1.667) < 0.01);
});

test("metricas: plazo mediano de inicio a firma", () => {
  const lista = [
    negocio({ fecha_inicio: "2026-01-01", fecha_fin: "2026-03-02" }),   // 60 dias
    negocio({ fecha_inicio: "2026-01-01", fecha_fin: "2026-05-01" }),   // 120 dias
    negocio({ fecha_inicio: "2026-01-01", fecha_fin: "2026-04-01" }),   // 90 dias
  ];
  assert.equal(metricas(lista, "2026").plazoVenta, 90);
});

test("metricas: cuenta los negocios por tipo", () => {
  const lista = [
    negocio({ tipo_negocio: "venta" }),
    negocio({ tipo_negocio: "alquiler" }),
    negocio({ tipo_negocio: "alquiler" }),
  ];
  const m = metricas(lista, "2026");
  assert.equal(m.ventas, 1);
  assert.equal(m.alquileres, 2);
});

test("metricas: ranking de barrios por ganancia", () => {
  const lista = [
    negocio({ barrio: "Cerrito", ganancia: 500 }),
    negocio({ barrio: "Centro", ganancia: 2000 }),
    negocio({ barrio: "Cerrito", ganancia: 800 }),
  ];
  const m = metricas(lista, "2026");
  assert.equal(m.barrios[0].nombre, "Centro");
  assert.equal(m.barrios[1].ganancia, 1300);
});

test("metricas: ranking de origen de captacion", () => {
  const lista = [
    negocio({ origen_captacion: "BDR", ganancia: 500 }),
    negocio({ origen_captacion: "Referido - Martín", ganancia: 2000 }),
  ];
  const m = metricas(lista, "2026");
  assert.equal(m.origenes[0].nombre, "Referido - Martín");
  assert.ok(Math.abs(m.origenes[0].porcentaje - 0.8) < 0.001);
});

test("comparativa: dice cuanto se pierde por no ser ALTO", () => {
  // Facturacion alta: conviene ALTO pese al fee mas caro.
  const lista = [negocio({ facturacion: 60000, ganancia: 27000, regimen_comision: "captacion_mia", base: 60000 })];
  const c = comparativaCategorias(lista, AJUSTES_CAT, "2026", "2026-12-31");
  const alto = c.find((x) => x.categoria === "ALTO");
  assert.ok(alto.diferencia > 0, "con 60.000 facturados, ALTO tendria que convenir");
});

test("comparativa: con facturacion baja conviene seguir en RAP", () => {
  const lista = [negocio({ facturacion: 5000, ganancia: 2250, regimen_comision: "captacion_mia", base: 5000 })];
  const c = comparativaCategorias(lista, AJUSTES_CAT, "2026", "2026-12-31");
  const alto = c.find((x) => x.categoria === "ALTO");
  assert.ok(alto.diferencia < 0, "con 5.000 facturados, ALTO tendria que perder");
});

test("comparativa: la categoria actual queda marcada y con diferencia cero", () => {
  const lista = [negocio({ facturacion: 20000, ganancia: 9000, regimen_comision: "captacion_mia", base: 20000 })];
  const c = comparativaCategorias(lista, AJUSTES_CAT, "2026", "2026-08-17");
  const rap = c.find((x) => x.categoria === "RAP");
  assert.equal(rap.actual, true);
  assert.equal(rap.diferencia, 0);
});
