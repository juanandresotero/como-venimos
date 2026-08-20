import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calcularCierre, irpfDelVendedor, textoParaElVendedor, textoParaElComprador, POR_DEFECTO,
} from "../lib/costos-cierre.js";

/* Una operación de las de todos los días, con la cuenta hecha a mano al lado:

     precio            USD 150.000
     valor catastral   $ 2.000.000
     dólar             40

     ITP        2.000.000 × 2%   = $ 40.000 = USD 1.000   (cada parte el suyo)
     escribano    150.000 × 3%   = USD 4.500              (comprador)
     IRPF        (150k − 100k)×12% = USD 6.000            (vendedor)
     cédula                        = $ 5.500 = USD 137,5  (vendedor) */
const CASO = { precio: 150000, catastral: 2000000, compra: 100000, dolar: 40, irpf: "ganancia" };

const gasto = (lado, clave) => lado.gastos.find((g) => g.clave === clave);

test("los números de fábrica son los que dio Juan", () => {
  assert.deepEqual(POR_DEFECTO, {
    itp: 0.02, escribano: 0.03, cedula: 5500, irpf_ganancia: 0.12, irpf_ficto: 0.018,
  });
});

/* EL ERROR QUE HAY QUE EVITAR: el ITP no sale del precio de venta. Sale del valor
   catastral, que es otro número y mucho más bajo. */
test("el ITP sale del valor catastral y no del precio", () => {
  const r = calcularCierre(CASO);
  assert.equal(gasto(r.comprador, "itp").uyu, 40000);
  assert.equal(gasto(r.comprador, "itp").usd, 1000);

  const otro = calcularCierre({ ...CASO, precio: 900000 });
  assert.equal(gasto(otro.comprador, "itp").uyu, 40000, "cambiar el precio no mueve el ITP");
});

test("el ITP lo paga cada parte: aparece de los dos lados", () => {
  const r = calcularCierre(CASO);
  assert.equal(gasto(r.comprador, "itp").uyu, 40000);
  assert.equal(gasto(r.vendedor, "itp").uyu, 40000);
});

test("el ITP se dice en pesos, con su equivalente en dólares al lado", () => {
  const itp = gasto(calcularCierre(CASO).comprador, "itp");
  assert.equal(itp.nace, "UYU");
  assert.equal(itp.uyu, 40000);
  assert.equal(itp.usd, 1000);
});

test("el escribano es el 3% del precio y lo paga sólo el comprador", () => {
  const r = calcularCierre(CASO);
  assert.equal(gasto(r.comprador, "escribano").usd, 4500);
  assert.equal(gasto(r.vendedor, "escribano"), undefined,
    "el del vendedor no se puede saber: no se inventa");
});

test("la cédula catastral son 5.500 pesos y la paga el vendedor", () => {
  const r = calcularCierre(CASO);
  assert.equal(gasto(r.vendedor, "cedula").uyu, 5500);
  assert.equal(gasto(r.vendedor, "cedula").usd, 137.5);
  assert.equal(gasto(r.comprador, "cedula"), undefined);
});

test("los montos de fábrica se pueden cambiar", () => {
  const r = calcularCierre(CASO, { itp: 0.03, escribano: 0.02, cedula: 7000 });
  assert.equal(gasto(r.comprador, "itp").uyu, 60000);
  assert.equal(gasto(r.comprador, "escribano").usd, 3000);
  assert.equal(gasto(r.vendedor, "cedula").uyu, 7000);
});

/* ---------- El IRPF, que tiene dos caminos y hay que elegir uno ---------- */

test("por la ganancia es el 12% de lo que subió desde que la compró", () => {
  assert.equal(irpfDelVendedor(150000, 100000, "ganancia").monto, 6000);
});

test("por el ficto es el 1,8% del precio y no pregunta a cuánto la compró", () => {
  const r = irpfDelVendedor(150000, null, "ficto");
  assert.equal(r.monto, 2700);
  assert.equal(r.falta, false, "el ficto no necesita el precio de compra");
});

/* Si vende por menos de lo que pagó no ganó nada. El 12% de un número negativo sería un
   impuesto que le devuelven, y eso no existe. */
test("vendiendo a pérdida el IRPF por ganancia es cero, nunca negativo", () => {
  const r = irpfDelVendedor(100000, 150000, "ganancia");
  assert.equal(r.monto, 0);
  assert.equal(r.ganancia, 0);
});

/* Sin el precio de compra, la cuenta daría el 12% del precio ENTERO: le cobraría impuesto a
   plata que nunca ganó, y el número saldría casi tres veces más caro que el ficto. */
test("sin el precio de compra no se calcula la ganancia: se avisa", () => {
  const r = calcularCierre({ ...CASO, compra: null });
  assert.equal(r.irpf.falta, true);
  assert.equal(gasto(r.vendedor, "irpf").usd, null, "no se muestra un número inventado");
  assert.equal(r.vendedor.total, 1000 + 137.5, "y no suma nada al total");
});

/* La fila del IRPF no desaparece cuando falta el dato: se queda en su lugar, entre el ITP y
   la cédula, mostrando un guion. Un gasto que se esfuma es un gasto que el cliente no sabe
   que existe. */
test("la fila del IRPF conserva su lugar aunque falte el dato", () => {
  const r = calcularCierre({ ...CASO, compra: null });
  assert.deepEqual(r.vendedor.gastos.map((g) => g.clave), ["itp", "irpf", "cedula"]);
  assert.equal(gasto(r.vendedor, "irpf").falta, true);
});

/* 0,018 × 100 da 1,7999999999999998 en JavaScript, y eso salía impreso tal cual en la
   pantalla que se le muestra al cliente. */
test("el porcentaje del IRPF se dice como lo diría una persona", () => {
  assert.equal(irpfDelVendedor(150000, null, "ficto").detalle, "1,8% del precio");
  assert.equal(irpfDelVendedor(150000, 100000, "ganancia").detalle, "12% de la ganancia");
});

test("un cero escrito en el precio de compra SÍ es un dato", () => {
  const r = calcularCierre({ ...CASO, compra: 0 });
  assert.equal(r.irpf.falta, false, "comprarla en cero —heredada, por ejemplo— es un caso");
  assert.equal(r.irpf.monto, 18000);
});

/* ---------- Los totales ---------- */

test("el comprador pone el precio MÁS los gastos", () => {
  const r = calcularCierre(CASO);
  assert.equal(r.comprador.total, 1000 + 4500);
  assert.equal(r.comprador.pone, 150000 + 5500);
});

test("al vendedor le queda el precio MENOS los gastos", () => {
  const r = calcularCierre(CASO);
  assert.equal(r.vendedor.total, 1000 + 6000 + 137.5);
  assert.equal(r.vendedor.queda, 150000 - 7137.5);
});

/* Sin cotización, los gastos en pesos no se pueden sumar con los que están en dólares.
   Mostrar un total al que le falta el ITP sería peor que no mostrar ninguno. */
test("sin cotización del dólar no se muestra ningún total", () => {
  const r = calcularCierre({ ...CASO, dolar: null });
  assert.equal(r.faltaDolar, true);
  assert.equal(r.vendedor.total, null);
  assert.equal(r.vendedor.queda, null);
  assert.equal(r.comprador.pone, null);
});

test("con todo vacío no hay nada que mostrar", () => {
  const r = calcularCierre({});
  assert.equal(r.hayDatos, false);
  assert.equal(r.precio, 0);
});

test("basura en los campos no rompe la cuenta", () => {
  const r = calcularCierre({ precio: "ochenta", catastral: "", compra: {}, dolar: 40 });
  assert.equal(r.precio, 0);
  assert.equal(r.vendedor.total, 5500 / 40, "queda sólo la cédula");
});

/* ---------- Lo que se le manda al cliente ---------- */

/* Juan lo pidió con estas palabras: los honorarios del escribano del vendedor NO se pueden
   saber, y eso tiene que quedar explícito en el mensaje que se le manda. */
test("el mensaje al vendedor avisa que el escribano no está en la cuenta", () => {
  const texto = textoParaElVendedor(calcularCierre(CASO), {});
  assert.match(texto, /escribano de la parte vendedora no están/);
  assert.match(texto, /se acuerdan con él/);
});

test("los dos mensajes avisan que puede haber otros gastos", () => {
  const r = calcularCierre(CASO);
  for (const texto of [textoParaElVendedor(r, {}), textoParaElComprador(r, {})]) {
    assert.match(texto, /otros gastos de escritura que no se pueden calcular/);
    assert.match(texto, /el escribano te los va a poder detallar/);
  }
});

/* La comisión se calcula en su propia herramienta, con IVA y descuentos. Meterla acá sería
   una segunda verdad sobre el mismo número. Pero callarla haría que el "te queda" parezca
   final cuando todavía falta descontarla. */
test("los dos mensajes dicen que la comisión va aparte", () => {
  const r = calcularCierre(CASO);
  assert.match(textoParaElVendedor(r, {}), /comisión inmobiliaria va aparte/);
  assert.match(textoParaElComprador(r, {}), /comisión inmobiliaria va aparte/);
});

test("el mensaje dice los gastos en pesos con el equivalente en dólares", () => {
  const texto = textoParaElVendedor(calcularCierre(CASO), {});
  assert.match(texto, /ITP \(2% del valor catastral\): \$ 40\.000 — USD 1\.000/);
  assert.match(texto, /Cédula catastral: \$ 5\.500 — USD 138/);
});

test("el mensaje al vendedor termina en lo que le queda, y el del comprador en lo que pone", () => {
  const r = calcularCierre(CASO);
  assert.match(textoParaElVendedor(r, {}), /\*Te quedan: USD 142\.863\*/);
  assert.match(textoParaElComprador(r, {}), /\*En total ponés: USD 155\.500\*/);
});

test("si falta el precio de compra, el mensaje lo dice en vez de saltearse el IRPF", () => {
  const texto = textoParaElVendedor(calcularCierre({ ...CASO, compra: null }), {});
  assert.match(texto, /IRPF: falta saber a cuánto la compraste/);
});

test("el título del cliente y la cotización usada entran en el mensaje", () => {
  const texto = textoParaElVendedor(calcularCierre(CASO), {
    titulo: "Rivera 2020", dolar: "Dólar a $ 40",
  });
  assert.match(texto, /Rivera 2020/);
  assert.match(texto, /Dólar a \$ 40/);
});
