import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calcular, calcularPunta, conComisionAdentro, repartir, descuentoParaLlegarA, LADOS, DESCUENTOS,
} from "../lib/comisiones.js";

const cerca = (a, b, tol = 0.01) =>
  assert.ok(Math.abs(a - b) <= tol, `${a} debería estar cerca de ${b}`);

const punta = (x = {}) => ({ lado: "vendedora", pct: 0.03, descuentoTipo: "nada", ...x });

test("lo simple: dos puntas al 3% sobre 100.000", () => {
  const r = calcular({ precio: 100000, split: 0.45, puntas: [punta(), punta({ lado: "compradora" })] });
  assert.equal(r.bruto, 6000);
  assert.equal(r.neto, 6000);
  assert.equal(r.pct_efectivo, 0.06);
  assert.equal(r.bolsillo, 2700);
});

test("una sola punta cobra la mitad", () => {
  const r = calcular({ precio: 100000, split: 0.45, puntas: [punta()] });
  assert.equal(r.neto, 3000);
  assert.equal(r.bolsillo, 1350);
});

/* El caso que planteó el usuario: 23% de descuento al comprador sobre el 3% que le cobra. */
test("descuento del 23% al comprador: le queda 2,31% y se ve así", () => {
  const r = calcular({
    precio: 100000, split: 0.45,
    puntas: [punta(), punta({ lado: "compradora", descuentoTipo: "pct", descuentoValor: 0.23 })],
  });
  const compradora = r.puntas[1];
  cerca(compradora.bruto, 3000);
  cerca(compradora.descuento, 690);
  cerca(compradora.neto, 2310);
  cerca(compradora.pct_efectivo, 0.0231, 1e-9);
  // La vendedora no se toca: cada lado es un trato distinto.
  cerca(r.puntas[0].neto, 3000);
  cerca(r.neto, 5310);
  cerca(r.bolsillo, 2389.5);
  cerca(r.costo_del_descuento, 310.5);
});

test("el descuento en monto fijo tambien anda", () => {
  const p = calcularPunta(100000, punta({ descuentoTipo: "monto", descuentoValor: 1000 }));
  cerca(p.neto, 2000);
  cerca(p.pct_efectivo, 0.02);
  cerca(p.parte_resignada, 1 / 3);
});

test("no se puede resignar mas de lo que se cobra", () => {
  const p = calcularPunta(100000, punta({ descuentoTipo: "monto", descuentoValor: 99999 }));
  assert.equal(p.neto, 0, "una comision negativa no existe");
  assert.equal(p.descuento, 3000);
});

/* El otro caso del usuario: pone 2.000 de su comision para juntar dos precios. */
test("poner 2.000 para cerrar, repartido parejo, deja las dos puntas en 2%", () => {
  const [a, b] = repartir(2000, 2);
  const r = calcular({
    precio: 100000, split: 0.45,
    puntas: [
      punta({ descuentoTipo: "monto", descuentoValor: a }),
      punta({ lado: "compradora", descuentoTipo: "monto", descuentoValor: b }),
    ],
  });
  cerca(r.puntas[0].pct_efectivo, 0.02);
  cerca(r.puntas[1].pct_efectivo, 0.02);
  cerca(r.neto, 4000);
  cerca(r.bolsillo, 1800);
});

test("repartir: parejo, todo de un lado, o una sola punta", () => {
  assert.deepEqual(repartir(2000, 2), [1000, 1000]);
  assert.deepEqual(repartir(2000, 2, "vendedora"), [2000, 0]);
  assert.deepEqual(repartir(2000, 2, "compradora"), [0, 2000]);
  assert.deepEqual(repartir(2000, 1), [2000]);
  assert.deepEqual(repartir(-5, 2), [0, 0], "un monto negativo no reparte deuda");
});

/* El tercer caso: "pago 100.000 y ahi adentro va tu comision". */
test("comision adentro del precio: se despeja dividiendo, no restando", () => {
  const r = conComisionAdentro(100000, 0.03);
  cerca(r.oferta, 97087.38);
  cerca(r.comision, 2912.62);
  cerca(r.oferta + r.comision, 100000, 1e-6);
  // Y la comision es EXACTAMENTE el 3% de la oferta, que es lo que hace que la cuenta cierre.
  cerca(r.comision / r.oferta, 0.03, 1e-9);
});

test("comision adentro: la cuenta facil da otro numero y por eso esta mal", () => {
  const r = conComisionAdentro(100000, 0.03);
  cerca(r.comision_ingenua, 3000);
  cerca(r.oferta_ingenua, 97000);
  // Los 3.000 serian el 3,09% de los 97.000 que se escrituran, no el 3%.
  cerca(r.comision_ingenua / r.oferta_ingenua, 0.0309, 1e-4);
  assert.ok(r.comision < r.comision_ingenua);
});

test("comision adentro: sin plata o sin porcentaje no rompe", () => {
  assert.equal(conComisionAdentro(0, 0.03).comision, 0);
  const sinPct = conComisionAdentro(100000, 0);
  cerca(sinPct.oferta, 100000);
  cerca(sinPct.comision, 0);
});

test("descuentoParaLlegarA: el camino inverso", () => {
  cerca(descuentoParaLlegarA(0.03, 0.0231), 0.23, 1e-9);
  cerca(descuentoParaLlegarA(0.03, 0.03), 0);
  assert.equal(descuentoParaLlegarA(0, 0.02), 0, "sin comision original no hay descuento");
  assert.equal(descuentoParaLlegarA(0.03, 0.05), 0, "cobrar mas no es un descuento negativo");
});

test("sin precio no inventa numeros", () => {
  const r = calcular({ precio: null, split: 0.45, puntas: [punta()] });
  assert.equal(r.neto, 0);
  assert.equal(r.pct_efectivo, 0);
});

test("los vocabularios estan completos", () => {
  assert.deepEqual(LADOS.map((l) => l.clave), ["vendedora", "compradora"]);
  assert.deepEqual(DESCUENTOS.map((d) => d.clave), ["nada", "pct", "monto"]);
});
