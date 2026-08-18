import { test } from "node:test";
import assert from "node:assert/strict";
import {
  aniosDisponibles, cerradosDe, etiquetaDeAnios, mesTerminado, mesesDe, mesesPorAnio,
  acumular, mejorYPeorMes, barrios, porOrigen, ventaVsAlquiler, concentracion,
  carteraPorCanal, plazos,
} from "../lib/indicadores.js";

function negocio(x = {}) {
  return {
    id: "n1", tipo_negocio: "venta", estado: "cerrado", fecha_fin: "2025-03-10",
    precio_operacion: 100000, facturacion: 3000, ganancia: 1350, puntas: 1,
    barrio: "Centro", origen_captacion: "B.d.r.", ...x,
  };
}

const AJUSTES = {
  defaults_comision: { venta: { 1: 0.03, 2: 0.06 }, alquiler: { 1: 1.0, 2: 2.0 } },
  categorias: [{ categoria: "RAP", split_pct: 0.45, desde: "2020-01-01", hasta: null }],
};

test("aniosDisponibles: solo los años con cierres, ordenados", () => {
  const negocios = [
    negocio({ fecha_fin: "2025-01-01" }),
    negocio({ fecha_fin: "2023-06-01" }),
    negocio({ fecha_fin: "2025-09-01" }),
    negocio({ estado: "en_curso", fecha_fin: null }),
  ];
  assert.deepEqual(aniosDisponibles(negocios), ["2023", "2025"]);
});

test("cerradosDe: sin años elegidos devuelve la carrera entera", () => {
  const negocios = [negocio({ fecha_fin: "2023-01-01" }), negocio({ fecha_fin: "2025-01-01" })];
  assert.equal(cerradosDe(negocios, null).length, 2);
  assert.equal(cerradosDe(negocios, []).length, 2);
  assert.equal(cerradosDe(negocios, ["2023"]).length, 1);
});

test("etiquetaDeAnios: nombra el recorte para que ningún número quede sin contexto", () => {
  assert.equal(etiquetaDeAnios(null, ["2022", "2026"]), "2022–2026");
  assert.equal(etiquetaDeAnios(["2024"], ["2022", "2024", "2026"]), "2024");
  assert.equal(etiquetaDeAnios(["2024", "2025"], ["2022", "2024", "2025"]), "2024 y 2025");
  assert.equal(etiquetaDeAnios(["2022", "2024", "2025"], ["2022", "2024", "2025", "2026"]), "3 años");
});

/* La regla que corrige el pedido original: un mes que todavia no llego no es un mal mes. */
test("mesTerminado: en el año en curso los meses que no llegaron no se juzgan", () => {
  assert.equal(mesTerminado(3, ["2026"], "2026-08-17"), true);
  assert.equal(mesTerminado(7, ["2026"], "2026-08-17"), true);
  assert.equal(mesTerminado(8, ["2026"], "2026-08-17"), false, "agosto esta a mitad de camino");
  assert.equal(mesTerminado(11, ["2026"], "2026-08-17"), false, "noviembre no llego");
});

test("mesTerminado: alcanza con que UN año elegido haya pasado por ese mes", () => {
  assert.equal(mesTerminado(11, ["2023", "2026"], "2026-08-17"), true);
  assert.equal(mesTerminado(11, ["2025"], "2026-08-17"), true);
});

test("mesesDe: suma todos los eneros de los años elegidos", () => {
  const negocios = [
    negocio({ fecha_fin: "2023-01-15", ganancia: 100 }),
    negocio({ fecha_fin: "2024-01-20", ganancia: 200 }),
    negocio({ fecha_fin: "2024-05-20", ganancia: 500 }),
  ];
  const meses = mesesDe(negocios, ["2023", "2024"], "2026-08-17");
  assert.equal(meses[0].ganancia, 300, "los dos eneros juntos");
  assert.equal(meses[0].negocios, 2);
  assert.equal(meses[4].ganancia, 500);
  assert.equal(meses.length, 12, "los doce meses aunque esten vacios");
});

test("mesesPorAnio: un juego de doce meses por año, para superponer", () => {
  const negocios = [
    negocio({ fecha_fin: "2024-02-01", ganancia: 100 }),
    negocio({ fecha_fin: "2025-02-01", ganancia: 300 }),
  ];
  const series = mesesPorAnio(negocios, ["2024", "2025"], "2026-08-17");
  assert.deepEqual(series.map((s) => s.anio), ["2024", "2025"]);
  assert.equal(series[0].meses[1].ganancia, 100);
  assert.equal(series[1].meses[1].ganancia, 300);
});

test("acumular: la curva suma mes a mes", () => {
  const meses = [{ ganancia: 100 }, { ganancia: 0 }, { ganancia: 50 }];
  assert.deepEqual(acumular(meses).map((m) => m.acumulado), [100, 100, 150]);
});

test("mejorYPeorMes: el peor no puede ser un mes que no llego", () => {
  const negocios = [
    negocio({ fecha_fin: "2026-01-10", ganancia: 500 }),
    negocio({ fecha_fin: "2026-03-10", ganancia: 900 }),
  ];
  const { mejor, peor } = mejorYPeorMes(negocios, ["2026"], "2026-08-17");
  assert.equal(mejor.mes, 3);
  assert.ok(peor.mes < 8, `el peor fue ${peor.nombre}, y eso todavia no paso`);
});

/* El desempate que pidio el usuario: entre varios ceros gana el que peor viene siempre. */
test("mejorYPeorMes: con varios meses en cero desempata por el historial", () => {
  const negocios = [
    // 2026 tiene cerrado enero; febrero y marzo quedaron en cero.
    negocio({ fecha_fin: "2026-01-10", ganancia: 500 }),
    // En la carrera, febrero rinde y marzo es un desierto.
    negocio({ fecha_fin: "2023-02-10", ganancia: 4000 }),
    negocio({ fecha_fin: "2024-02-10", ganancia: 3000 }),
    negocio({ fecha_fin: "2023-04-10", ganancia: 100 }),
  ];
  const { peor } = mejorYPeorMes(negocios, ["2026"], "2026-08-17");
  assert.notEqual(peor.mes, 2, "febrero esta en cero este año pero es de los buenos");
  assert.equal(peor.ganancia, 0);
});

test("mejorYPeorMes: sin meses terminados no inventa nada", () => {
  const { mejor, peor, evaluados } = mejorYPeorMes([], ["2026"], "2026-01-05");
  assert.equal(mejor, null);
  assert.equal(peor, null);
  assert.equal(evaluados, 0);
});

test("barrios: cuenta el total y separa los que se pisaron una sola vez", () => {
  const negocios = [
    negocio({ barrio: "Cerrito" }), negocio({ barrio: "Cerrito" }),
    negocio({ barrio: "Buceo" }),
  ];
  const b = barrios(negocios, null);
  assert.equal(b.total, 2);
  assert.equal(b.unaVez, 1);
  assert.equal(b.repetidos, 1);
});

test("barrios: el top 5 va por cantidad y el empate lo rompe la plata", () => {
  const negocios = [
    negocio({ barrio: "A", ganancia: 10 }), negocio({ barrio: "A", ganancia: 10 }),
    negocio({ barrio: "B", ganancia: 900 }), negocio({ barrio: "B", ganancia: 900 }),
    negocio({ barrio: "C", ganancia: 5000 }),
  ];
  const b = barrios(negocios, null);
  assert.deepEqual(b.top.map((f) => f.nombre), ["B", "A", "C"], "B empata con A y gana por plata");
});

test("barrios: las tres lecturas pueden dar barrios distintos", () => {
  const negocios = [
    // Donde mas repite, pero son negocios chicos.
    negocio({ barrio: "Cerrito", ganancia: 300 }), negocio({ barrio: "Cerrito", ganancia: 300 }),
    negocio({ barrio: "Cerrito", ganancia: 300 }),
    // Un solo negocio, pero enorme.
    negocio({ barrio: "Santa Lucia", ganancia: 9000 }),
    // Repite y paga bien: el unico que sirve para decidir.
    negocio({ barrio: "Malvin", ganancia: 1300 }), negocio({ barrio: "Malvin", ganancia: 1300 }),
    negocio({ barrio: "Malvin", ganancia: 1300 }),
  ];
  const b = barrios(negocios, null);
  // Donde mas repite (empata en 3 con Cerrito y gana por plata).
  assert.equal(b.top[0].nombre, "Malvin");
  // Donde entro mas plata: un solo negocio grande. Es cierto y es una anecdota — por eso
  // la fila tiene que salir siempre con su cantidad al lado.
  assert.equal(b.masPlata.nombre, "Santa Lucia");
  assert.equal(b.masPlata.negocios, 1);
  // El unico que sirve para decidir: repite Y paga bien. Santa Lucia no puede ganar aca,
  // con un solo negocio no se promedia nada.
  assert.equal(b.mejorPorNegocio.nombre, "Malvin");
  assert.ok(b.mejorPorNegocio.negocios >= b.minimoParaPromediar);
});

test("barrios: toda fila trae su cantidad de negocios al lado", () => {
  const b = barrios([negocio({ barrio: "X", ganancia: 500 })], null);
  assert.equal(b.masPlata.negocios, 1);
  for (const fila of b.todos) assert.ok(typeof fila.negocios === "number");
});

test("porOrigen: reparte la plata por canal y dice cuánto pesa cada uno", () => {
  const negocios = [
    negocio({ origen_captacion: "Ref. Martin", ganancia: 750 }),
    negocio({ origen_captacion: "Ref. Martin", ganancia: 250 }),
    negocio({ origen_captacion: "B.d.r.", ganancia: 1000 }),
  ];
  const filas = porOrigen(negocios, null);
  assert.equal(filas.length, 2);
  assert.equal(filas[0].ganancia, 1000);
  assert.equal(filas[0].parte, 0.5);
  const martin = filas.find((f) => f.nombre === "Ref. Martin");
  assert.equal(martin.porNegocio, 500);
});

test("ventaVsAlquiler: separa las dos mitades del negocio", () => {
  const negocios = [
    negocio({ tipo_negocio: "venta", ganancia: 1700, precio_operacion: 74000, puntas: 2 }),
    negocio({ tipo_negocio: "alquiler", ganancia: 350, precio_operacion: 400, puntas: 2 }),
    negocio({ tipo_negocio: "renovacion_alquiler", ganancia: 350, precio_operacion: 400, puntas: 1 }),
  ];
  const r = ventaVsAlquiler(negocios, null);
  assert.equal(r.venta.negocios, 1);
  assert.equal(r.alquiler.negocios, 2, "la renovacion cuenta como alquiler");
  assert.equal(r.venta.porNegocio, 1700);
  assert.equal(r.alquiler.porNegocio, 350);
  assert.ok(Math.abs(r.veces - 1700 / 350) < 1e-9);
  assert.equal(r.puntasTotales, 5);
  assert.ok(Math.abs(r.venta.parteDeLosNegocios - 1 / 3) < 1e-9);
});

test("ventaVsAlquiler: sin alquileres no divide por cero", () => {
  const r = ventaVsAlquiler([negocio({ tipo_negocio: "venta" })], null);
  assert.equal(r.veces, 0);
  assert.equal(r.alquiler.porNegocio, 0);
});

test("concentracion: mide año por año, aunque haya varios elegidos", () => {
  const negocios = [
    negocio({ fecha_fin: "2025-01-01", ganancia: 8000 }),
    negocio({ fecha_fin: "2025-02-01", ganancia: 1000 }),
    negocio({ fecha_fin: "2025-03-01", ganancia: 1000 }),
    negocio({ fecha_fin: "2024-01-01", ganancia: 500 }),
    negocio({ fecha_fin: "2024-02-01", ganancia: 500 }),
  ];
  const filas = concentracion(negocios, ["2024", "2025"]);
  assert.deepEqual(filas.map((f) => f.anio), ["2024", "2025"]);
  const dosMil25 = filas.find((f) => f.anio === "2025");
  assert.equal(dosMil25.total, 10000);
  assert.equal(dosMil25.parte, 1, "los 3 negocios del año son todo el año");
  assert.equal(dosMil25.parteDelMejor, 0.8, "uno solo trajo el 80%");
});

test("carteraPorCanal: agrupa lo vivo por origen y estima lo que no tiene negocio", () => {
  const cartera = {
    p1: { entity_id: "p1", activa: true, usar_en_proyeccion: true, estado: "publicada",
      operacion: "venta", precio: 100000, origen_captacion: "B.d.r." },
    p2: { entity_id: "p2", activa: true, usar_en_proyeccion: true, estado: "publicada",
      operacion: "venta", precio: 50000, origen_captacion: "B.d.r." },
    // Apagada a mano: no tiene que contar.
    p3: { entity_id: "p3", activa: true, usar_en_proyeccion: false, estado: "publicada",
      operacion: "venta", precio: 999999, origen_captacion: "Ref. Martin" },
  };
  const cerrado = negocio({ tipo_negocio: "venta", puntas: 2, estado: "cerrado" });
  const filas = carteraPorCanal(cartera, [cerrado], AJUSTES);
  assert.equal(filas.length, 1, "la apagada quedo afuera");
  assert.equal(filas[0].nombre, "B.d.r.");
  assert.equal(filas[0].propiedades, 2);
  // 2 puntas promedio x 3% = 6% sobre 150.000 = 9.000 facturados.
  assert.ok(Math.abs(filas[0].facturacion - 9000) < 1e-6);
  assert.ok(Math.abs(filas[0].ganancia - 9000 * 0.45) < 1e-6);
});

test("carteraPorCanal: si la propiedad ya tiene su negocio cargado, manda ese número", () => {
  const cartera = {
    p1: { entity_id: "p1", activa: true, usar_en_proyeccion: true, estado: "en_negociacion",
      operacion: "venta", precio: 100000, origen_captacion: "B.d.r." },
  };
  const negocios = [
    negocio({ estado: "en_curso", fecha_fin: null, entity_id_cartera: "p1",
      facturacion: 4444, ganancia: 2222 }),
    negocio({ tipo_negocio: "venta", puntas: 2 }),
  ];
  const filas = carteraPorCanal(cartera, negocios, AJUSTES);
  assert.equal(filas[0].facturacion, 4444);
  assert.equal(filas[0].ganancia, 2222);
});

test("plazos: mide de inicio a firma y aguanta los que no tienen fecha", () => {
  const negocios = [
    negocio({ tipo_negocio: "venta", fecha_inicio: "2025-01-01", fecha_fin: "2025-03-02" }),
    negocio({ tipo_negocio: "venta", fecha_inicio: null, fecha_fin: "2025-04-01" }),
  ];
  const p = plazos(negocios, null);
  assert.equal(p.venta, 60);
  assert.equal(p.alquiler, 0, "sin alquileres devuelve cero, no rompe");
});
