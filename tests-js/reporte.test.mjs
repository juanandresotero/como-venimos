/* El reporte y las recomendaciones, probados contra los datos reales del repo.

   Se prueba con los datos de verdad a proposito: un reporte que anda con un fixture
   inventado y se rompe con las 85 filas del Excel no sirve para nada. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { armarReporte, nombreArchivo, barras } from "../lib/reporte.js";
import { recomendaciones, contarPendientes } from "../lib/recomendaciones.js";
import { porMes, nivelRemax, metricas } from "../lib/salud.js";

const leer = (nombre) => JSON.parse(readFileSync(new URL(`../datos/${nombre}.json`, import.meta.url), "utf8"));

const DATOS = {
  negocios: leer("negocios"),
  cartera: leer("cartera"),
  ajustes: leer("ajustes"),
  eventos: leer("eventos"),
  mis_datos: {},
};
const ANIO = "2026";
const HOY = "2026-08-17";

test("el reporte sale completo y sin nada de afuera", () => {
  const html = armarReporte(DATOS, ANIO, HOY);
  assert.match(html, /^<!doctype html>/);
  assert.match(html, /<title>/);
  // Autocontenido: si pide algo por la red, en el celular sin señal se ve roto.
  assert.ok(!/src="http/i.test(html), "no puede traer scripts ni imagenes de afuera");
  assert.ok(!/<link /i.test(html), "no puede traer hojas de estilo de afuera");
  assert.ok(!/<script/i.test(html), "no lleva javascript: es para leer, no para correr");
});

test("el reporte trae las seis partes que se pidieron", () => {
  const html = armarReporte(DATOS, ANIO, HOY);
  for (const parte of [
    "Ritmo contra el calendario",
    "De dónde sale la plata",
    "Tu ganancia mes a mes",
    "Tu carrera",
    "Cómo trabajaste este año",
    "Qué hacer para llegar",
  ]) {
    assert.ok(html.includes(parte), `falta la sección "${parte}"`);
  }
  assert.ok(html.includes("Juan Andrés Otero"));
  assert.ok(html.includes("RE/MAX Único"));
});

test("el numero grande del reporte es lo cobrado, no lo esperado", () => {
  const html = armarReporte(DATOS, ANIO, HOY);
  // 20.079 es lo realmente cobrado en 2026; 41.089 era lo que decia el Excel.
  assert.ok(html.includes("20.079"), "tiene que mostrar lo cobrado de verdad");
  assert.ok(!html.includes("41.089"), "no puede repetir el numero inflado del Excel");
});

test("las graficas van en SVG dibujado, no en una libreria", () => {
  const html = armarReporte(DATOS, ANIO, HOY);
  assert.ok(html.includes("<svg"));
  assert.ok(html.includes("<rect"));
});

test("una barra vacia no desaparece del grafico", () => {
  const svg = barras([{ nombre: "Ene", valor: 0 }, { nombre: "Feb", valor: 1000 }]);
  assert.equal((svg.match(/<rect/g) || []).length, 2);
  assert.ok(svg.includes(">Ene<") && svg.includes(">Feb<"));
});

test("lo que escribio el usuario va escapado", () => {
  const sucio = {
    ...DATOS,
    negocios: [...DATOS.negocios, {
      id: "x", tipo_negocio: "venta", estado: "cerrado", fecha_fin: "2026-05-01",
      barrio: "<script>alert(1)</script>", precio_operacion: 1000, facturacion: 30,
      ganancia: 13, puntas: 1, base: 30, regimen_comision: "captacion_mia",
    }],
  };
  const html = armarReporte(sucio, ANIO, HOY);
  assert.ok(!html.includes("<script>alert"));
});

test("el nombre del archivo lleva año y fecha", () => {
  assert.equal(nombreArchivo("2026", "2026-08-17"), "como-venimos-2026-2026-08-17.html");
});

test("cada mes del año aparece aunque este vacio", () => {
  const meses = porMes(DATOS.negocios, ANIO);
  assert.equal(meses.length, 12);
  assert.deepEqual(meses.map((m) => m.mes), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  const suma = meses.reduce((t, m) => t + m.facturacion, 0);
  assert.ok(suma > 0, "en 2026 hay negocios cerrados");
});

test("un negocio de otro año no se cuela en los meses", () => {
  const meses = porMes([{ fecha_fin: "2025-03-10", estado: "cerrado", facturacion: 999 }], "2026");
  assert.equal(meses.reduce((t, m) => t + m.facturacion, 0), 0);
});

test("el nivel de RE/MAX dice donde esta y cuanto falta", () => {
  const niveles = { Rokie: 30000, Executive: 65000, "Club 100%": 100000 };
  assert.deepEqual(nivelRemax(45000, niveles), {
    actual: { nombre: "Rokie", monto: 30000 },
    siguiente: { nombre: "Executive", monto: 65000 },
    falta: 20000,
  });
});

test("abajo del primer escalon no se inventa una categoria alcanzada", () => {
  const r = nivelRemax(1000, { Rokie: 30000, Executive: 65000 });
  assert.equal(r.actual, null);
  assert.equal(r.siguiente.nombre, "Rokie");
  assert.equal(r.falta, 29000);
});

test("arriba del ultimo escalon no queda un siguiente fantasma", () => {
  const r = nivelRemax(500000, { Rokie: 30000, Diamond: 400000 });
  assert.equal(r.actual.nombre, "Diamond");
  assert.equal(r.siguiente, null);
  assert.equal(r.falta, 0);
});

/* §8.6: cada recomendacion sale solo si su condicion se cumple. */
test("las recomendaciones salen de los datos reales y traen numeros", () => {
  const consejos = recomendaciones(DATOS, ANIO, HOY, contarPendientes(DATOS.negocios, DATOS.eventos));
  assert.ok(consejos.length >= 3, "con estos datos tiene que haber varias");
  for (const c of consejos) {
    assert.ok(c.titulo && c.detalle, "toda recomendacion dice que pasa y por que");
  }
  const claves = consejos.map((c) => c.clave);
  assert.ok(claves.includes("falta_para_objetivo"), "va atrasado contra el objetivo");
});

test("si ya llego al objetivo no le dice cuanto le falta", () => {
  const cumplido = {
    ...DATOS,
    ajustes: { ...DATOS.ajustes, objetivo_personal: { 2026: 1 } },
  };
  const claves = recomendaciones(cumplido, ANIO, HOY).map((c) => c.clave);
  assert.ok(!claves.includes("falta_para_objetivo"));
  assert.ok(!claves.includes("falta_volumen"));
});

test("sin pendientes no se avisa de pendientes", () => {
  const claves = recomendaciones(DATOS, ANIO, HOY, { negocios: 0, eventos: 0 }).map((c) => c.clave);
  assert.ok(!claves.includes("datos_faltantes"));
  assert.ok(!claves.includes("novedades"));
});

test("contar pendientes ignora las fichas dadas por completas", () => {
  const negocios = [
    { id: "a", ficha_completa: false, avisos: [{ tipo: "x" }] },
    { id: "b", ficha_completa: true, avisos: [{ tipo: "x" }] },
    { id: "c", ficha_completa: false, avisos: [] },
  ];
  const r = contarPendientes(negocios, [{ id: "e1", fecha: "2026-08-10" }]);
  assert.equal(r.negocios, 1);
  assert.equal(r.eventos, 1);
  assert.equal(r.desde, "2026-08-10");
});

test("la mediana de inicio a boleto se calcula aparte de la de inicio a firma", () => {
  const m = metricas([
    { fecha_fin: "2026-03-01", estado: "cerrado", tipo_negocio: "venta",
      fecha_inicio: "2026-01-01", fecha_boleto: "2026-02-01", precio_operacion: 1, puntas: 1 },
  ], "2026");
  assert.equal(m.plazoBoleto, 31);
  assert.equal(m.plazoVenta, 59);
});

test("un año sin negocios no rompe el reporte", () => {
  const html = armarReporte(DATOS, "2019", HOY);
  assert.match(html, /^<!doctype html>/);
  assert.ok(html.includes("Año 2019"));
});
