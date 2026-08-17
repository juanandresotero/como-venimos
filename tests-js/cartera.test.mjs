import { test } from "node:test";
import assert from "node:assert/strict";
import {
  fusionar, estadoVisible, listar, negociosDe, rendimiento, lineaDeTiempo, diasEnCartera,
  desdeCuando, completarConNegocios,
} from "../lib/cartera.js";

const propiedad = (extra = {}) => ({
  entity_id: "aaa",
  activa: true,
  estado: "publicada",
  direccion: "Eusebio Vidal 3100",
  barrio: "Maroñas",
  precio: 94000,
  operacion: "venta",
  visto_primera_vez: "2026-08-01",
  visto_ultima_vez: "2026-08-17",
  historial_precio: [{ fecha: "2026-08-01", precio: 94000, moneda: "USD" }],
  fecha_negociacion: null,
  fecha_reservada: null,
  fecha_desaparicion: null,
  desenlace_propuesto: null,
  fecha_captacion_real: "2026-08-01",
  fecha_captacion_estimada: true,
  origen_captacion: null,
  desenlace_confirmado: null,
  usar_en_proyeccion: true,
  notas: "",
  ...extra,
});

test("lo que edito el usuario le gana a lo que trae la cartera del robot", () => {
  const cartera = { aaa: propiedad() };
  const mis = { cartera: { aaa: { origen_captacion: "BDR", fecha_captacion_estimada: false } } };
  const r = fusionar(cartera, mis);
  assert.equal(r.aaa.origen_captacion, "BDR");
  assert.equal(r.aaa.fecha_captacion_estimada, false);
  assert.equal(r.aaa.precio, 94000, "los datos del robot siguen intactos");
});

test("fusionar no modifica los originales", () => {
  const cartera = { aaa: propiedad() };
  fusionar(cartera, { cartera: { aaa: { notas: "cambiada" } } });
  assert.equal(cartera.aaa.notas, "");
});

test("un false del usuario se respeta y no se confunde con vacio", () => {
  const r = fusionar({ aaa: propiedad() }, { cartera: { aaa: { usar_en_proyeccion: false } } });
  assert.equal(r.aaa.usar_en_proyeccion, false);
});

test("sin anotaciones la cartera queda igual", () => {
  const r = fusionar({ aaa: propiedad() }, {});
  assert.equal(r.aaa.origen_captacion, null);
  assert.equal(r.aaa.usar_en_proyeccion, true);
});

test("una anotacion de una propiedad que ya no existe no rompe nada", () => {
  const r = fusionar({ aaa: propiedad() }, { cartera: { zzz: { notas: "vieja" } } });
  assert.deepEqual(Object.keys(r), ["aaa"]);
});

test("el estado visible de una activa es el de RE/MAX", () => {
  assert.equal(estadoVisible(propiedad({ estado: "reservada" })), "reservada");
});

test("en una que ya no esta, lo confirmado le gana a lo propuesto", () => {
  const p = propiedad({ activa: false, desenlace_propuesto: "vendida", desenlace_confirmado: "caida" });
  assert.equal(estadoVisible(p), "caida");
});

test("la lista pone primero lo que esta mas cerca de cobrarse", () => {
  const cartera = {
    a: propiedad({ entity_id: "a", estado: "publicada", precio: 200000 }),
    b: propiedad({ entity_id: "b", estado: "reservada", precio: 50000 }),
    c: propiedad({ entity_id: "c", estado: "en_negociacion", precio: 80000 }),
  };
  assert.deepEqual(listar(cartera).map((p) => p.entity_id), ["b", "c", "a"]);
});

test("el archivo trae solo las que ya no estan, de la mas nueva a la mas vieja", () => {
  const cartera = {
    a: propiedad({ entity_id: "a" }),
    b: propiedad({ entity_id: "b", activa: false, fecha_desaparicion: "2026-05-01" }),
    c: propiedad({ entity_id: "c", activa: false, fecha_desaparicion: "2026-07-01" }),
  };
  assert.deepEqual(listar(cartera, { archivo: true }).map((p) => p.entity_id), ["c", "b"]);
  assert.deepEqual(listar(cartera).map((p) => p.entity_id), ["a"]);
});

/* §4.2: una propiedad puede alquilarse cinco veces en un año y despues venderse. */
test("una propiedad junta todos los negocios que genero", () => {
  const negocios = [
    { id: "1", entity_id_cartera: "aaa", fecha_fin: "2026-01-10", estado: "cerrado", facturacion: 500, ganancia: 225 },
    { id: "2", entity_id_cartera: "aaa", fecha_fin: "2026-06-10", estado: "cerrado", facturacion: 500, ganancia: 225 },
    { id: "3", entity_id_cartera: "aaa", fecha_fin: "2026-08-10", estado: "en_curso", facturacion: 3000, ganancia: 1350 },
    { id: "4", entity_id_cartera: "otra", fecha_fin: "2026-08-10", estado: "cerrado", facturacion: 900, ganancia: 400 },
  ];
  assert.deepEqual(negociosDe(negocios, "aaa").map((n) => n.id), ["3", "2", "1"]);
  const r = rendimiento(negocios, "aaa");
  assert.equal(r.negocios, 3);
  assert.equal(r.cerrados, 2);
  assert.equal(r.facturacion, 1000, "lo en curso no se cuenta como cobrado");
  assert.equal(r.ganancia, 450);
});

test("la linea de tiempo sale ordenada y no llama cambio al precio de salida", () => {
  const p = propiedad({
    historial_precio: [
      { fecha: "2026-08-01", precio: 94000, moneda: "USD" },
      { fecha: "2026-08-10", precio: 89000, moneda: "USD" },
    ],
    fecha_negociacion: "2026-08-15",
  });
  const hitos = lineaDeTiempo(p);
  assert.deepEqual(hitos.map((h) => h.fecha), ["2026-08-01", "2026-08-10", "2026-08-15"]);
  assert.equal(hitos[0].titulo, "Captación");
  assert.match(hitos[1].titulo, /bajó/);
  assert.equal(hitos[2].titulo, "Pasó a negociación");
});

test("la captacion estimada se marca como tal", () => {
  assert.match(lineaDeTiempo(propiedad())[0].detalle, /estimada/);
  const cargada = propiedad({ fecha_captacion_estimada: false, origen_captacion: "BDR" });
  assert.equal(lineaDeTiempo(cargada)[0].detalle, "BDR");
});

test("los dias en cartera se cuentan hasta hoy, o hasta que se fue", () => {
  assert.equal(diasEnCartera(propiedad(), "2026-08-17"), 16);
  const ida = propiedad({ activa: false, fecha_desaparicion: "2026-08-11" });
  assert.equal(diasEnCartera(ida, "2026-08-17"), 10);
});

/* El robot arranco el 17/08/2026: para todo lo que ya estaba publicado de antes,
   `visto_primera_vez` dice "hoy" y haria parecer nueva a una propiedad de hace meses. */
test("la fecha de captacion confirmada le gana a la que vio el robot", () => {
  const vieja = propiedad({
    visto_primera_vez: "2026-08-17",
    fecha_captacion_real: "2026-01-15",
    fecha_captacion_estimada: false,
  });
  assert.equal(desdeCuando(vieja), "2026-01-15");
  assert.equal(diasEnCartera(vieja, "2026-08-17"), 214);
});

test("mientras la captacion sea una estimacion, manda lo que vio el robot", () => {
  const p = propiedad({
    visto_primera_vez: "2026-08-10",
    fecha_captacion_real: "2026-08-10",
    fecha_captacion_estimada: true,
  });
  assert.equal(desdeCuando(p), "2026-08-10");
});

/* La sincronia al editar no alcanzaba: los negocios ya tenian el dato cargado de antes y,
   como nadie los estaba editando, la propiedad lo seguia mostrando en rojo. */
test("la propiedad toma la fecha y el origen que ya estan en su negocio", () => {
  const cartera = { aaa: propiedad({ origen_captacion: null }) };
  const negocios = [{ entity_id_cartera: "aaa", fecha_inicio: "2025-02-03", origen_captacion: "B.d.r." }];
  const r = completarConNegocios(cartera, negocios);
  assert.equal(r.aaa.fecha_captacion_real, "2025-02-03");
  assert.equal(r.aaa.fecha_captacion_estimada, false);
  assert.equal(r.aaa.origen_captacion, "B.d.r.");
});

test("la captacion es la del negocio MAS VIEJO, no la del ultimo alquiler", () => {
  const cartera = { aaa: propiedad({ origen_captacion: null }) };
  const negocios = [
    { entity_id_cartera: "aaa", fecha_inicio: "2026-07-01" },
    { entity_id_cartera: "aaa", fecha_inicio: "2024-05-01" },
    { entity_id_cartera: "aaa", fecha_inicio: "2025-02-03" },
  ];
  assert.equal(completarConNegocios(cartera, negocios).aaa.fecha_captacion_real, "2024-05-01");
});

test("lo que el usuario confirmo en la propiedad no se pisa con algo posterior", () => {
  const cartera = { aaa: propiedad({ fecha_captacion_real: "2025-01-01", fecha_captacion_estimada: false }) };
  const negocios = [{ entity_id_cartera: "aaa", fecha_inicio: "2026-07-01" }];
  assert.equal(completarConNegocios(cartera, negocios).aaa.fecha_captacion_real, "2025-01-01");
});

test("completar no modifica la cartera original", () => {
  const cartera = { aaa: propiedad({ origen_captacion: null }) };
  completarConNegocios(cartera, [{ entity_id_cartera: "aaa", origen_captacion: "B.d.r." }]);
  assert.equal(cartera.aaa.origen_captacion, null);
});

test("un negocio de otra propiedad no la toca", () => {
  const cartera = { aaa: propiedad({ origen_captacion: null }) };
  const r = completarConNegocios(cartera, [{ entity_id_cartera: "zzz", origen_captacion: "B.d.r." }]);
  assert.equal(r.aaa.origen_captacion, null);
});
