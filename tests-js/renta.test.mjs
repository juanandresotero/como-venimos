import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULTS, calcular, detectarMoneda, alquilerNecesario, precioMaximo, coeficientes,
} from "../lib/renta.js";

const cerca = (a, b, tolerancia = 0.01) =>
  assert.ok(Math.abs(a - b) <= tolerancia, `${a} deberia estar cerca de ${b}`);

/* Caso de referencia: apartamento de 100.000 que se alquila a 700 por mes. */
const CASO = { precio: 100000, alquiler_mensual: 700 };

/* La bruta NO descuenta nada, ni siquiera el mes vacio. Es la renta de la calle: si ya
   viniera con algo descontado, compararla con la real no diria nada. */
test("la renta bruta es alquiler por DOCE, sin descontar ni el mes vacio", () => {
  const r = calcular(CASO);
  assert.equal(r.renta_bruta_anual, 700 * 12);
  cerca(r.renta_bruta_pct, 0.084);
});

test("los gastos de compra vienen en cero y hay que pedirlos a proposito", () => {
  assert.equal(calcular(CASO).capital_invertido, 100000);
  const con = calcular({ ...CASO, gastos_compra_pct: 0.07 });
  assert.equal(con.capital_invertido, 107000);
  assert.equal(con.gastos_de_compra, 7000);
});

test("la renta real sale mas baja que la bruta y esa distancia es la que importa", () => {
  const r = calcular(CASO);
  // cobrado 7.700 (11 meses) - refaccion 700 - irpf 808,50 = 6.191,50
  cerca(r.renta_neta_anual, 6191.5);
  cerca(r.renta_real_pct, 6191.5 / 100000);
  assert.ok(r.renta_real_pct < r.renta_bruta_pct);
  // Lo que separa una de la otra, en plata: el mes vacio mas todos los costos.
  cerca(r.costo_meses_vacios, 700);
  cerca(r.perdida_por_costos, 8400 - 6191.5);
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
  cerca(r.anios_para_recuperar, 100000 / 6191.5);
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
  // Los dos que el usuario pidio apagados: no ensucian la cuenta si no los pide.
  assert.equal(DEFAULTS.gastos_compra_pct, 0);
  assert.equal(DEFAULTS.plazo_anios, 0);
});

test("el coeficiente por alquiler es lo que queda limpio de cada dolar", () => {
  const c = coeficientes(CASO);
  // 11 meses - 1 mes de refaccion - 11 x 10,5% de IRPF. Sin plazo no hay comision.
  cerca(c.porAlquiler, 11 - 1 - 11 * 0.105);
  assert.equal(c.fijos, 0);
});

/* ---------- Plazo en cero: la trampa que habia ---------- */

/* El plazo tenia un piso de 0,01 años metido en la formula. Con el plazo en cero la
   comision se dividia por 0,01, o sea se multiplicaba por CIEN, y la renta se iba a
   negativo sin que nada avisara. Ahora un cero quiere decir "no lo tengo en cuenta". */
test("plazo en cero no dispara la comision: simplemente no se cuenta", () => {
  const sin = calcular({ ...CASO, plazo_anios: 0, comision_meses: 1 });
  assert.equal(sin.costo_comision, 0);
  assert.ok(sin.renta_neta_anual > 0);
  // Con el piso viejo daba 700 / 0,01 = 70.000 de comision. Cualquier cosa cerca de eso
  // es la trampa de vuelta.
  assert.ok(sin.costo_comision < 1);
});

test("plazo en cero da lo mismo que no cargar comision", () => {
  const a = calcular({ ...CASO, plazo_anios: 0, comision_meses: 1 });
  const b = calcular({ ...CASO, plazo_anios: 0, comision_meses: 0 });
  assert.equal(a.renta_neta_anual, b.renta_neta_anual);
});

test("cargando el plazo, la comision vuelve a prorratearse", () => {
  const dos = calcular({ ...CASO, plazo_anios: 2, comision_meses: 1 });
  assert.equal(dos.costo_comision, 350);
  const uno = calcular({ ...CASO, plazo_anios: 1, comision_meses: 1 });
  assert.equal(uno.costo_comision, 700);
});

test("el alquiler necesario tampoco se rompe con el plazo en cero", () => {
  const objetivo = alquilerNecesario({ ...CASO, plazo_anios: 0 }, 0.07);
  assert.ok(objetivo > 0 && Number.isFinite(objetivo));
});

test("los dos numeros que pidio el usuario estan y son distintos", () => {
  const r = calcular(CASO);
  assert.ok(r.renta_bruta_pct > 0, "renta total, sin descuentos");
  assert.ok(r.renta_real_pct > 0, "renta con todas las consideraciones");
  assert.ok(r.renta_bruta_pct > r.renta_real_pct);
});

/* ---------- El candado: cada respuesta supone la otra variable quieta ---------- */

/* Si la app dice "necesitas 850 de alquiler para rendir 7%", poner 850 tiene que dar 7%.
   Sin esto, el numero se ve razonable y esta mal, que es la peor combinacion. */
test("el alquiler necesario, puesto de vuelta, da exactamente el objetivo", () => {
  for (const objetivo of [0.05, 0.07, 0.1]) {
    const necesario = alquilerNecesario(CASO, objetivo);
    const conEse = calcular({ ...CASO, alquiler_mensual: necesario });
    cerca(conEse.renta_real_pct, objetivo, 1e-9);
  }
});

test("el precio maximo, puesto de vuelta, da exactamente el objetivo", () => {
  for (const objetivo of [0.05, 0.07, 0.1]) {
    const maximo = precioMaximo(CASO, objetivo);
    const conEse = calcular({ ...CASO, precio: maximo });
    cerca(conEse.renta_real_pct, objetivo, 1e-9);
  }
});

test("los dos caminos coinciden: con el alquiler necesario, el precio maximo es el que hay", () => {
  const necesario = alquilerNecesario(CASO, 0.07);
  const maximo = precioMaximo({ ...CASO, alquiler_mensual: necesario }, 0.07);
  cerca(maximo, CASO.precio, 0.01);
});

test("con gastos de compra prendidos, las dos vueltas siguen cerrando", () => {
  const conGastos = { ...CASO, gastos_compra_pct: 0.07 };
  const necesario = alquilerNecesario(conGastos, 0.06);
  cerca(calcular({ ...conGastos, alquiler_mensual: necesario }).renta_real_pct, 0.06, 1e-9);
});
