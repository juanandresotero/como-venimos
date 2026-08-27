import { test } from "node:test";
import assert from "node:assert/strict";
import { ratios, capas, ritmo, porAnio, metricas, comparativaCategorias, estimacionPorPuntas,
  formaDelAnio,
} from "../lib/salud.js";

const AJUSTES = {
  probabilidades_cierre: { reservada: 0.9, en_negociacion: 0.6, publicada: 0.25 },
  objetivo_personal: { "2026": 65000 },
  // La estimacion de lo publicado sale de la comision de una punta y de la tajada de hoy.
  defaults_comision: { venta: { 1: 0.03, 2: 0.06 }, alquiler: { 1: 1.0, 2: 2.0 } },
  categorias: [{ categoria: "RAP", split_pct: 0.45, fee_mensual_usd: 70, desde: "2026-01-01", hasta: null }],
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
    facturacion: 3000, ganancia: 1350, entity_id_cartera: null, puntas: 1,
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
  assert.equal(c.cobrado.facturacion, 3000);
  assert.equal(c.cobrado.negocios, 1);
});

/* Los cuatro grupos: cobrado / reservado / en negociacion / publicado.

   Un negocio EN CURSO no tiene fecha de firma: todavia no firmo. El filtro viejo pedia
   una fecha del año y los dejaba a todos afuera, asi que "casi seguro" daba CERO teniendo
   propiedades reservadas. */
test("un negocio en curso sin fecha de firma igual cuenta", () => {
  const lista = [negocio({ estado: "en_curso", fecha_fin: null, facturacion: 5394, ganancia: 2427 })];
  const c = capas(lista, {}, AJUSTES, "2026");
  assert.equal(c.negociacion.facturacion, 5394);
  assert.equal(c.negociacion.ganancia, 2427);
  assert.equal(c.avanzado.facturacion, 5394);
});

test("cada propiedad cae en el grupo de su estado", () => {
  const lista = [negocio({ precio_operacion: 100000, facturacion: 4500, ganancia: 1800 })];
  const cartera = {
    a: propiedad({ entity_id: "a", estado: "reservada", precio: 100000 }),
    b: propiedad({ entity_id: "b", estado: "en_negociacion", precio: 100000 }),
    c: propiedad({ entity_id: "c", estado: "publicada", precio: 100000 }),
  };
  const c = capas(lista, cartera, AJUSTES, "2026");
  assert.equal(c.reservado.cantidad, 1);
  assert.equal(c.negociacion.cantidad, 1);
  assert.equal(c.publicado.cantidad, 1);
});

/* Al 100%: la pregunta es "cuanto cobro si esto cierra", no "cuanto vale hoy". */
test("los grupos van al 100%, sin descontar probabilidad", () => {
  const lista = [negocio({ precio_operacion: 100000, facturacion: 4500, ganancia: 1800, puntas: 1 })];
  const cartera = { p1: propiedad({ precio: 200000, estado: "publicada" }) };
  const c = capas(lista, cartera, AJUSTES, "2026");
  // Cierra con 1 punta en promedio -> 3%. 200.000 x 3% = 6.000, entero.
  assert.equal(Math.round(c.publicado.facturacion), 6000);
  // La cuenta realista sí lo descuenta: cobrado (4.500) + 6.000 x 25% = 6.000
  assert.equal(Math.round(c.ponderado.facturacion), 6000);
});

test("una reservada pesa mucho mas que una publicada en la cuenta realista", () => {
  const lista = [negocio({ precio_operacion: 100000, facturacion: 4500, ganancia: 1800 })];
  const publicada = capas(lista, { p1: propiedad({ estado: "publicada" }) }, AJUSTES, "2026");
  const reservada = capas(lista, { p1: propiedad({ estado: "reservada" }) }, AJUSTES, "2026");
  // Se compara solo la parte proyectada, sin lo ya cobrado que es igual en las dos.
  const soloPipeline = (x) => x.ponderado.facturacion - x.cobrado.facturacion;
  assert.ok(soloPipeline(reservada) > soloPipeline(publicada) * 3);
});

test("ignora las propiedades dadas de baja", () => {
  const c = capas([negocio()], { p1: propiedad({ activa: false }) }, AJUSTES, "2026");
  assert.equal(c.publicado.cantidad, 0);
});

test("ignora las excluidas por el usuario (duplicados)", () => {
  const c = capas([negocio()], { p1: propiedad({ usar_en_proyeccion: false }) }, AJUSTES, "2026");
  assert.equal(c.publicado.cantidad, 0);
});

/* Si la propiedad ya tiene un negocio cargado, manda ESE numero: es el precio y la
   comision de verdad, no una estimacion con el ratio historico. */
test("una propiedad con negocio cargado usa su cifra real, no la estimada", () => {
  const lista = [
    negocio({ precio_operacion: 100000, facturacion: 4500, ganancia: 1800 }),
    negocio({ id: "n2", estado: "en_curso", fecha_fin: null, facturacion: 5394,
              ganancia: 2427, entity_id_cartera: "p1" }),
  ];
  const cartera = { p1: propiedad({ entity_id: "p1", estado: "reservada", precio: 999999 }) };
  const c = capas(lista, cartera, AJUSTES, "2026");
  assert.equal(c.reservado.cantidad, 1);
  assert.equal(c.reservado.facturacion, 5394, "la cifra del negocio, no el ratio sobre 999.999");
  assert.equal(c.reservado.detalle[0].estimado, false);
});

test("no se cuenta dos veces: la propiedad y su negocio son una sola linea", () => {
  const lista = [
    negocio({ precio_operacion: 100000, facturacion: 4500, ganancia: 1800 }),
    negocio({ id: "n2", estado: "en_curso", fecha_fin: null, facturacion: 5394,
              ganancia: 2427, entity_id_cartera: "p1" }),
  ];
  const cartera = { p1: propiedad({ entity_id: "p1", estado: "reservada" }) };
  const c = capas(lista, cartera, AJUSTES, "2026");
  assert.equal(c.reservado.cantidad + c.negociacion.cantidad + c.publicado.cantidad, 1);
  assert.equal(c.avanzado.facturacion, 5394);
});

test("el detalle dice que propiedades entraron y si el numero es estimado", () => {
  const lista = [negocio({ precio_operacion: 100000, facturacion: 4500, ganancia: 1800 })];
  const cartera = { p1: propiedad({ direccion: "Gutenberg 6100", precio: 490000 }) };
  const c = capas(lista, cartera, AJUSTES, "2026");
  assert.equal(c.publicado.detalle.length, 1);
  assert.equal(c.publicado.detalle[0].direccion, "Gutenberg 6100");
  assert.equal(c.publicado.detalle[0].estimado, true, "sin negocio cargado, es una estimacion");
  assert.equal(c.publicado.detalle[0].probabilidad, 0.25);
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

/* "Cuanto voy ganando y cuanto si cierro todo lo que esta en negociacion y reservado":
   los dos numeros que el usuario pidio tener siempre a mano. */
test("avanzado: reservado mas negociacion, al 100%, sin lo apenas publicado", () => {
  const cartera = {
    pub: { entity_id: "pub", activa: true, estado: "publicada", operacion: "venta",
           precio: 100000, usar_en_proyeccion: true },
    neg: { entity_id: "neg", activa: true, estado: "en_negociacion", operacion: "venta",
           precio: 100000, usar_en_proyeccion: true },
    res: { entity_id: "res", activa: true, estado: "reservada", operacion: "venta",
           precio: 100000, usar_en_proyeccion: true },
  };
  const negocios = [
    { id: "a", fecha_fin: "2026-03-01", estado: "cerrado", tipo_negocio: "venta",
      precio_operacion: 100000, facturacion: 4000, ganancia: 1800, puntas: 1 },
  ];
  const c = capas(negocios, cartera, AJUSTES, "2026");

  // Lo apenas publicado NO entra en "avanzado": todavia no se movio.
  assert.equal(c.avanzado.cantidad, 2);
  assert.ok(!c.avanzado.detalle.some((x) => x.entity_id === "pub"));
  assert.equal(c.reservado.facturacion, c.negociacion.facturacion,
    "al 100% valen igual: la pregunta es 'si cierra todo'");
  assert.equal(c.avanzado.facturacion, c.reservado.facturacion + c.negociacion.facturacion);
});

test("avanzado: una propiedad que ya tiene su negocio en curso no se cuenta dos veces", () => {
  const cartera = {
    neg: { entity_id: "neg", activa: true, estado: "en_negociacion", operacion: "venta",
           precio: 100000, usar_en_proyeccion: true },
  };
  const negocios = [
    { id: "b", fecha_fin: "2026-09-01", estado: "en_curso", tipo_negocio: "venta",
      entity_id_cartera: "neg", precio_operacion: 100000, facturacion: 3000, ganancia: 1350 },
  ];
  const c = capas(negocios, cartera, AJUSTES, "2026");
  assert.equal(c.avanzado.cantidad, 1);
  assert.equal(c.avanzado.facturacion, 3000);
});

test("avanzado: lo apagado de la proyeccion tampoco entra acá", () => {
  const cartera = {
    neg: { entity_id: "neg", activa: true, estado: "reservada", operacion: "venta",
           precio: 100000, usar_en_proyeccion: false },
  };
  const c = capas([], cartera, AJUSTES, "2026");
  assert.equal(c.avanzado.cantidad, 0);
  assert.equal(c.avanzado.facturacion, 0);
});

/* Lo potencial NO suma: es lo que hay dando vueltas, no lo que esta por entrar. */
test("encaminado suma cobrado, reservado y negociacion, y deja fuera lo publicado", () => {
  const cartera = {
    res: { entity_id: "res", activa: true, estado: "reservada", operacion: "venta",
           precio: 100000, usar_en_proyeccion: true },
    pub: { entity_id: "pub", activa: true, estado: "publicada", operacion: "venta",
           precio: 100000, usar_en_proyeccion: true },
  };
  const negocios = [
    { id: "a", fecha_fin: "2026-03-01", estado: "cerrado", tipo_negocio: "venta",
      precio_operacion: 100000, facturacion: 4000, ganancia: 1800, puntas: 1 },
  ];
  const c = capas(negocios, cartera, AJUSTES, "2026");

  assert.equal(
    c.encaminado.facturacion,
    c.cobrado.facturacion + c.reservado.facturacion + c.negociacion.facturacion
  );
  assert.ok(c.publicado.facturacion > 0, "lo publicado existe...");
  assert.ok(c.encaminado.facturacion < c.total.facturacion, "...pero no entra en lo encaminado");
  assert.equal(c.total.facturacion, c.encaminado.facturacion + c.publicado.facturacion);
});

/* La estimacion sale de las PUNTAS PROMEDIO, no de una mediana opaca: si cerras con 1,61
   puntas y una punta cobra el 3%, lo esperable de una venta nueva es el 4,83%. */
test("la estimacion se arma con la comision de una punta por las puntas promedio", () => {
  const cerrados = [
    negocio({ id: "a", estado: "cerrado", tipo_negocio: "venta", puntas: 2 }),
    negocio({ id: "b", estado: "cerrado", tipo_negocio: "venta", puntas: 1 }),
  ];
  const e = estimacionPorPuntas(cerrados, AJUSTES);
  assert.equal(e.venta.puntas, 1.5);
  assert.equal(e.venta.unaPunta, 0.03);
  assert.equal(e.venta.pct, 0.045, "3% x 1,5 puntas");
});

test("las renovaciones cuentan como alquiler", () => {
  const cerrados = [
    negocio({ id: "a", estado: "cerrado", tipo_negocio: "alquiler", puntas: 2 }),
    negocio({ id: "b", estado: "cerrado", tipo_negocio: "renovacion_alquiler", puntas: 2 }),
  ];
  assert.equal(estimacionPorPuntas(cerrados, AJUSTES).alquiler.puntas, 2);
});

test("sin historial no se inventa: se asume una punta", () => {
  const e = estimacionPorPuntas([], AJUSTES);
  assert.equal(e.venta.puntas, 1);
  assert.equal(e.venta.pct, 0.03);
});

test("lo en curso no cuenta para el promedio: todavia no se sabe como cerro", () => {
  const lista = [
    negocio({ id: "a", estado: "cerrado", tipo_negocio: "venta", puntas: 1 }),
    negocio({ id: "b", estado: "en_curso", tipo_negocio: "venta", puntas: 2 }),
  ];
  assert.equal(estimacionPorPuntas(lista, AJUSTES).venta.puntas, 1);
});

test("una propiedad publicada se proyecta con esa comision y la tajada de hoy", () => {
  const cerrados = [
    negocio({ id: "a", estado: "cerrado", tipo_negocio: "venta", puntas: 2,
              precio_operacion: 100000, facturacion: 6000, ganancia: 2700 }),
  ];
  const cartera = { p1: propiedad({ precio: 490000, estado: "publicada" }) };
  const c = capas(cerrados, cartera, AJUSTES, "2026");
  const p = c.publicado.detalle[0];
  // 2 puntas promedio x 3% = 6%  ->  490.000 x 6% = 29.400, y el 45% queda para el
  assert.equal(p.pct, 0.06);
  assert.equal(Math.round(p.facturacion), 29400);
  assert.equal(Math.round(p.ganancia), Math.round(29400 * 0.45));
  assert.equal(p.estimado, true);
});

/* ---------- El precio de negociacion manda sobre el publicado ---------- */

test("si se cargo a que precio se negocia, ESE se usa para proyectar", () => {
  const cerrado = negocio({ tipo_negocio: "venta", puntas: 2, estado: "cerrado" });
  const cartera = {
    p1: propiedad({
      entity_id: "p1", estado: "en_negociacion", operacion: "venta",
      precio: 240000, precio_negociacion: 200000,
    }),
  };
  const c = capas([cerrado], cartera, AJUSTES, "2026");
  const fila = c.negociacion.detalle[0];
  // 2 puntas x 3% = 6% sobre 200.000 (lo negociado) y no sobre 240.000 (lo publicado).
  assert.ok(Math.abs(fila.facturacion - 12000) < 1e-6, `dio ${fila.facturacion}`);
  assert.equal(fila.precio, 200000);
  assert.equal(fila.precio_publicado, 240000);
  assert.equal(fila.negociado, true);
});

test("sin precio de negociacion se sigue usando el publicado", () => {
  const cerrado = negocio({ tipo_negocio: "venta", puntas: 2, estado: "cerrado" });
  const cartera = {
    p1: propiedad({ entity_id: "p1", estado: "en_negociacion", operacion: "venta", precio: 240000 }),
  };
  const fila = capas([cerrado], cartera, AJUSTES, "2026").negociacion.detalle[0];
  assert.ok(Math.abs(fila.facturacion - 14400) < 1e-6);
  assert.equal(fila.negociado, false);
});

test("proyectar sobre el publicado infla justo lo que esta por entrar", () => {
  const cerrado = negocio({ tipo_negocio: "venta", puntas: 2, estado: "cerrado" });
  const como = (extra) => capas([cerrado],
    { p1: propiedad({ entity_id: "p1", estado: "en_negociacion", operacion: "venta", precio: 240000, ...extra }) },
    AJUSTES, "2026").negociacion.facturacion;
  assert.ok(como({ precio_negociacion: 200000 }) < como({}));
});

/* LA FORMA DEL AÑO. El año de Juan no es parejo: contando 2023, 2024 y 2025 el 63% de lo que
   factura cierra en el segundo semestre, y marzo, abril y noviembre son casi vacíos. Con una
   división pareja del almanaque, en abril la app le decía que debería ir por el 33% cuando
   en sus tres años a esa altura llevaba el 20%. */
const cerrado = (fecha, plata) => ({
  estado: "cerrado", fecha_fin: fecha, facturacion: plata,
});

test("la forma del año sale de los años completos, no del almanaque", () => {
  /* Dos años iguales: todo cierra en el segundo semestre. */
  const negocios = [
    cerrado("2023-09-15", 100), cerrado("2023-11-20", 100),
    cerrado("2024-09-15", 50), cerrado("2024-11-20", 50),
    cerrado("2025-09-15", 80), cerrado("2025-11-20", 80),
  ];
  const forma = formaDelAnio(negocios, 2026);
  assert.ok(forma, "con tres años tiene que poder");
  assert.equal(forma.anios, 2, "el primero se descarta: siempre es parcial");
  assert.equal(forma.alDia(180), 0, "a mitad de año no habia cerrado nada");
  assert.equal(forma.alDia(365), 1, "a fin de año, todo");
});

test("con menos de dos años completos no se inventa una forma", () => {
  assert.equal(formaDelAnio([cerrado("2025-09-15", 100)], 2026), null);
  assert.equal(formaDelAnio([], 2026), null);
  assert.equal(formaDelAnio(null, 2026), null);
});

test("el año que corre no cuenta: todavia no tiene total contra el que medir", () => {
  const negocios = [
    cerrado("2023-06-30", 100), cerrado("2024-06-30", 100), cerrado("2025-06-30", 100),
    cerrado("2026-01-05", 999),
  ];
  const forma = formaDelAnio(negocios, 2026);
  assert.equal(forma.alDia(10), 0, "lo de enero de 2026 no puede entrar en la forma");
  /* Día 200 y no 181: 2024 es bisiesto y el 30 de junio le cae un día más adelante. */
  assert.equal(forma.alDia(200), 1);
});

test("sin historia el ritmo se mide contra el almanaque, como antes", () => {
  const r = ritmo(5000, 10000, 2026, "2026-07-02", null);
  assert.ok(Math.abs(r.esperado - r.calendario) < 0.01, "cae al almanaque");
  assert.equal(r.aniosDeHistoria, 0);
});

/* Lo que de verdad cambia para el usuario: en abril, con un año que carga al final, deja de
   decirle que va atrasado cuando va como siempre. */
test("con la forma del año, un abril flojo deja de ser 'atrasado'", () => {
  const negocios = [
    cerrado("2022-10-01", 10),
    cerrado("2023-04-15", 20), cerrado("2023-10-15", 80),
    cerrado("2024-04-15", 20), cerrado("2024-10-15", 80),
  ];
  const forma = formaDelAnio(negocios, 2025);
  const conForma = ritmo(21, 100, 2025, "2025-04-20", forma);
  const conAlmanaque = ritmo(21, 100, 2025, "2025-04-20", null);
  assert.equal(conAlmanaque.aRitmo, false, "el almanaque pide 30% y tiene 21%");
  assert.equal(conForma.aRitmo, true, "su historia pide 20% a esa altura");
  assert.equal(conForma.aniosDeHistoria, 2);
});

/* ============================================ LAS NEGOCIACIONES QUE SE CAYERON

   Juan: cuando una propiedad vuelve de negociación o reserva a publicada, ese negocio se cayó
   y "ahí debería de contarlo para estadísticas".

   Es un número que no tenía dónde mirarse: dos agentes con la misma facturación no son
   iguales si uno cierra ocho de cada diez negociaciones y el otro cinco. */

const yaCerro = (id, fecha) => ({
  id, estado: "cerrado", fecha_fin: fecha, tipo_negocio: "venta", puntas: 1,
});
const seCayo = (id, fecha) => ({ id, estado: "caido", fecha_caida: fecha });

test("cuenta cuántas se cayeron y qué parte del total son", () => {
  const m = metricas([
    yaCerro("a", "2026-03-01"), yaCerro("b", "2026-05-01"), yaCerro("c", "2026-07-01"),
    seCayo("d", "2026-04-01"),
  ], "2026");
  assert.equal(m.caidos, 1);
  assert.equal(m.terminados, 4);
  assert.equal(m.pctCaidos, 0.25);
});

/* EL DENOMINADOR SON LOS QUE TERMINARON, no todos. Los que siguen en curso todavía no se sabe
   cómo van a terminar, y meterlos abajo haría que el porcentaje mejorara solo por tener más
   trabajo abierto — que es justo al revés de lo que el número quiere decir. */
test("los que siguen en curso no entran en la cuenta", () => {
  const m = metricas([
    yaCerro("a", "2026-03-01"), seCayo("b", "2026-04-01"),
    { id: "c", estado: "en_curso", fecha_negociacion: "2026-06-01" },
  ], "2026");
  assert.equal(m.terminados, 2);
  assert.equal(m.pctCaidos, 0.5);
});

test("los de otros años no se mezclan", () => {
  const m = metricas([seCayo("a", "2025-04-01"), yaCerro("b", "2026-03-01")], "2026");
  assert.equal(m.caidos, 0);
  assert.equal(m.terminados, 1);
});

/* Un caído viejo del Excel no tiene fecha_caida: se usa la de negociación, que es lo más
   cerca que hay de cuándo pasó. */
test("un caído sin fecha de caída se ubica por la de negociación", () => {
  const m = metricas([{ id: "a", estado: "caido", fecha_negociacion: "2026-02-01" }], "2026");
  assert.equal(m.caidos, 1);
});

test("sin nada terminado no inventa un porcentaje", () => {
  const m = metricas([{ id: "a", estado: "en_curso" }], "2026");
  assert.equal(m.pctCaidos, null, "0 de 0 no es 0%");
});
