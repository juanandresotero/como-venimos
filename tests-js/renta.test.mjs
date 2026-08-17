import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULTS, calcular, detectarMoneda, alquilerNecesario, precioMaximo, coeficientes,
} from "../lib/renta.js";

const cerca = (a, b, tolerancia = 0.01) =>
  assert.ok(Math.abs(a - b) <= tolerancia, `${a} deberia estar cerca de ${b}`);

/* Caso de referencia: apartamento de 100.000 que se alquila a 700 por mes. */
const CASO = { precio: 100000, alquiler_mensual: 700 };

test("la renta bruta es alquiler por meses alquilados, no por doce", () => {
  const r = calcular(CASO);
  assert.equal(r.renta_bruta_anual, 700 * 11);
  cerca(r.renta_bruta_pct, 0.077);
});

test("el capital invertido incluye los gastos de compra", () => {
  const r = calcular(CASO);
  assert.equal(r.capital_invertido, 107000);
});

test("la renta real sale mas baja que la bruta y esa distancia es la que importa", () => {
  const r = calcular(CASO);
  // bruta 7700 − comision 350 − refaccion 700 − irpf 808,50 = 5841,50
  cerca(r.renta_neta_anual, 5841.5);
  cerca(r.renta_real_pct, 5841.5 / 107000);
  assert.ok(r.renta_real_pct < r.renta_bruta_pct);
});

test("la comision de alquiler se prorratea por el plazo del contrato", () => {
  const dos = calcular({ ...CASO, plazo_anios: 2 });
  const uno = calcular({ ...CASO, plazo_anios: 1 });
  assert.equal(dos.costo_comision, 350);
  assert.equal(uno.costo_comision, 700);
  assert.ok(uno.renta_neta_anual < dos.renta_neta_anual);
});

test("los gastos anuales cargados a mano bajan la renta", () => {
  const con = calcular({ ...CASO, contribucion_anual: 400, primaria_anual: 200 });
  const sin = calcular(CASO);
  cerca(con.renta_neta_anual, sin.renta_neta_anual - 600);
});

test("una refaccion cargada a mano manda sobre el default de un mes", () => {
  const r = calcular({ ...CASO, refaccion_anual: 1500 });
  assert.equal(r.costo_refaccion, 1500);
});

test("los años para recuperar la inversion salen del capital, no del precio", () => {
  const r = calcular(CASO);
  cerca(r.anios_para_recuperar, 107000 / 5841.5);
});

test("sin renta neta positiva no se promete un plazo de recupero", () => {
  const r = calcular({ ...CASO, contribucion_anual: 99999 });
  assert.equal(r.anios_para_recuperar, null);
  assert.ok(r.renta_neta_anual < 0);
});

test("el alquiler en pesos se pasa a dolares con la cotizacion del dia", () => {
  const r = calcular({
    precio: 100000, alquiler_mensual: 28000, moneda_alquiler: "UYU", tipo_cambio: 40,
  });
  assert.equal(r.alquiler_usado, 700);
  assert.equal(r.falta_cotizacion, false);
});

test("sin cotizacion se avisa en vez de inventar un numero", () => {
  const r = calcular({
    precio: 100000, alquiler_mensual: 28000, moneda_alquiler: "UYU", tipo_cambio: null,
  });
  assert.equal(r.falta_cotizacion, true);
  assert.equal(r.renta_bruta_anual, 0);
});

/* §10.4: la deteccion por cantidad de digitos fallaba con alquileres de 1.200 USD. */
test("1.200 sobre 200.000 se lee como la misma moneda", () => {
  assert.equal(detectarMoneda(1200, 200000), "misma");
});

test("30.000 sobre 100.000 se lee como pesos sobre dolares", () => {
  assert.equal(detectarMoneda(30000, 100000), "uyu_sobre_usd");
});

test("una relacion rara no se adivina", () => {
  assert.equal(detectarMoneda(3000, 100000), "dudosa");
  assert.equal(detectarMoneda(0, 100000), "sin_datos");
});

test("el alquiler necesario para una renta objetivo cierra al calcularlo de vuelta", () => {
  const objetivo = 0.07;
  const alquiler = alquilerNecesario(CASO, objetivo);
  const r = calcular({ ...CASO, alquiler_mensual: alquiler });
  cerca(r.renta_real_pct, objetivo, 1e-9);
});

test("el alquiler necesario tambien cierra con gastos fijos cargados", () => {
  const entradas = { ...CASO, contribucion_anual: 500, primaria_anual: 300, admin_pct: 0.05 };
  const alquiler = alquilerNecesario(entradas, 0.06);
  const r = calcular({ ...entradas, alquiler_mensual: alquiler });
  cerca(r.renta_real_pct, 0.06, 1e-9);
});

test("el precio maximo a pagar cierra al calcularlo de vuelta", () => {
  const objetivo = 0.08;
  const precio = precioMaximo(CASO, objetivo);
  const r = calcular({ ...CASO, precio });
  cerca(r.renta_real_pct, objetivo, 1e-9);
});

test("si el alquiler no alcanza a cubrir los costos no hay precio que sirva", () => {
  assert.equal(precioMaximo({ ...CASO, contribucion_anual: 99999 }, 0.07), null);
});

test("los defaults son los que se acordaron", () => {
  assert.equal(DEFAULTS.meses_alquilados, 11);
  assert.equal(DEFAULTS.irpf_pct, 0.105);
  assert.equal(DEFAULTS.gastos_compra_pct, 0.07);
  assert.equal(DEFAULTS.plazo_anios, 2);
});

test("el coeficiente por alquiler es lo que queda limpio de cada dolar", () => {
  const c = coeficientes(CASO);
  // 11 meses − medio mes de comision − 1 mes de refaccion − 11 × 10,5% de IRPF
  cerca(c.porAlquiler, 11 - 0.5 - 1 - 11 * 0.105);
  assert.equal(c.fijos, 0);
});
