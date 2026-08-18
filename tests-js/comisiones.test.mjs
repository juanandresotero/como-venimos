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

/* ---------- Quién factura cada pedazo, y el IVA ---------- */

import {
  repartoDeLaPunta, facturaDeLaPunta, facturar, PARTE_OFICINA, IVA,
} from "../lib/comisiones.js";

const suma = (r) => r.reduce((t, x) => t + x.parte, 0);
const parte = (r, clave) => (r.find((x) => x.clave === clave) || {}).parte || 0;

test("captación propia: 20 oficina, 45 vos, 35 colega", () => {
  const r = repartoDeLaPunta("captacion_mia", 0.45);
  cerca(parte(r, "oficina"), 0.20, 1e-9);
  cerca(parte(r, "yo"), 0.45, 1e-9);
  cerca(parte(r, "colega"), 0.35, 1e-9);
  cerca(suma(r), 1, 1e-9);
});

test("referido de Martín: él 45, vos 35, y no escala con la categoría", () => {
  for (const split of [0.45, 0.60, 0.80]) {
    const r = repartoDeLaPunta("ref_martin", split);
    cerca(parte(r, "yo"), 0.35, 1e-9);
    cerca(parte(r, "colega"), 0.45, 1e-9);
    cerca(suma(r), 1, 1e-9);
  }
});

test("referido de un colega: el 25% sale primero y el resto se reparte sobre el 75", () => {
  const r = repartoDeLaPunta("ref_otro_colega", 0.45);
  cerca(parte(r, "referidor"), 0.25, 1e-9);
  cerca(parte(r, "yo"), 0.3375, 1e-9, "el 45% del 75% restante");
  cerca(suma(r), 1, 1e-9);
});

/* El reparto tiene que dar lo MISMO que el motor de plata, o la app se contradice sola. */
test("tu parte coincide con lo que ya calculaba el motor", () => {
  cerca(parte(repartoDeLaPunta("captacion_mia", 0.45), "yo"), 0.45, 1e-9);
  cerca(parte(repartoDeLaPunta("ref_martin", 0.45), "yo"), 0.35, 1e-9);
  cerca(parte(repartoDeLaPunta("ref_otro_colega", 0.45), "yo"), 0.45 * 0.75, 1e-9);
});

test("con una categoría más alta, el colega absorbe la diferencia", () => {
  const alto = repartoDeLaPunta("captacion_mia", 0.60);
  cerca(parte(alto, "yo"), 0.60, 1e-9);
  cerca(parte(alto, "colega"), 0.20, 1e-9);
  cerca(parte(alto, "oficina"), PARTE_OFICINA, 1e-9);
  // Con PURO no queda nada para el colega, y no puede dar negativo.
  const puro = repartoDeLaPunta("captacion_mia", 0.80);
  assert.ok(parte(puro, "colega") >= 0);
  cerca(suma(puro), 1, 1e-9);
});

const unaPunta = { lado: "vendedora", neto: 3000, pct_efectivo: 0.03 };

test("las tres casillas marcadas: IVA sobre toda la comisión", () => {
  const f = facturaDeLaPunta(unaPunta, {
    regimen: "captacion_mia", split: 0.45, conIva: ["yo", "colega", "oficina"],
  });
  cerca(f.iva, 3000 * IVA);
  cerca(f.total, 3000 * 1.22);
  cerca(f.pct_recargo, IVA, 1e-9);
});

test("solo tu IVA: se suma únicamente sobre tu parte", () => {
  const f = facturaDeLaPunta(unaPunta, {
    regimen: "captacion_mia", split: 0.45, conIva: ["yo"],
  });
  cerca(f.iva, 1350 * IVA, 0.01);
  cerca(f.total, 3000 + 297);
  const mio = f.trozos.find((t) => t.clave === "yo");
  cerca(mio.monto, 1350);
  cerca(mio.total, 1647);
  // Los otros dos aparecen igual, sin IVA: hay que verlos para saber qué se factura.
  assert.equal(f.trozos.find((t) => t.clave === "colega").iva, 0);
  assert.equal(f.trozos.find((t) => t.clave === "oficina").iva, 0);
});

test("ninguna casilla: no se suma nada", () => {
  const f = facturaDeLaPunta(unaPunta, { regimen: "captacion_mia", split: 0.45, conIva: [] });
  assert.equal(f.iva, 0);
  cerca(f.total, 3000);
});

test("los pedazos suman la comisión entera, marque lo que marque", () => {
  for (const conIva of [[], ["yo"], ["yo", "oficina"], ["yo", "colega", "oficina"]]) {
    const f = facturaDeLaPunta(unaPunta, { regimen: "captacion_mia", split: 0.45, conIva });
    cerca(f.trozos.reduce((t, x) => t + x.monto, 0), 3000, 0.01);
    cerca(f.total, 3000 + f.iva, 0.01);
  }
});

/* Cada punta es un cliente distinto: al vendedor hay que mandarle lo suyo y nada mas. */
test("facturar: una factura por punta y el total de la operación", () => {
  const r = calcular({
    precio: 100000, split: 0.45,
    puntas: [punta(), punta({ lado: "compradora", descuentoTipo: "pct", descuentoValor: 0.23 })],
  });
  const f = facturar(r, { regimen: "captacion_mia", split: 0.45, conIva: ["yo"] });
  assert.equal(f.puntas.length, 2);
  cerca(f.puntas[0].comision, 3000);
  cerca(f.puntas[1].comision, 2310, 0.01);
  cerca(f.comision, 5310, 0.01);
  // El IVA sale solo de tu 45% de cada punta.
  cerca(f.iva, (3000 + 2310) * 0.45 * IVA, 0.01);
  cerca(f.total, f.comision + f.iva, 0.01);
});

/* ---------- El texto para el cliente ---------- */

import { textoParaElCliente, textoConReparto } from "../lib/comisiones.js";

const AGENTE = { nombre: "Juan Andrés Otero", oficina: "RE/MAX Único", telefono: "099616633" };
const facturaDe = (conIva, descuento) => {
  const r = calcular({
    precio: 100000, split: 0.45,
    puntas: [punta(), punta({ lado: "compradora", ...(descuento || {}) })],
  });
  return facturar(r, { regimen: "captacion_mia", split: 0.45, conIva }).puntas[1];
};

/* Lo que el cliente NO tiene que ver: el reparto interno. No le incumbe cuánto va a la
   oficina ni al colega, y ponerlo abre una conversación que no tiene que ver con lo que
   está por firmar. */
test("el texto no dice una palabra del reparto interno", () => {
  const t = textoParaElCliente(facturaDe(["yo", "colega", "oficina"]), { precio: 100000, agente: AGENTE });
  for (const palabra of ["colega", "Colega", "split", "45%", "35%", "20%", "RE/MAX Uruguay"]) {
    assert.ok(!t.includes(palabra), `se coló "${palabra}" en el texto del cliente`);
  }
});

test("lleva lo que el usuario pidió: porcentaje, plata, IVA y total", () => {
  const t = textoParaElCliente(
    facturaDe(["yo", "colega", "oficina"], { descuentoTipo: "pct", descuentoValor: 0.23 }),
    { precio: 100000, titulo: "Eusebio Vidal 3100", agente: AGENTE }
  );
  assert.match(t, /2,31%/);
  assert.match(t, /USD 2\.310/);
  assert.match(t, /IVA \(22%\): USD 508/);
  assert.match(t, /Total a pagar: USD 2\.818/);
  assert.match(t, /Eusebio Vidal 3100/);
});

/* El texto NO va firmado. El que lo manda ya esta identificado en el chat: el nombre, el
   telefono y hasta la oficina abajo no agregaban nada y lo hacian mas largo de leer. */
test("el texto no lleva firma de ningun tipo", () => {
  for (const armar of [textoParaElCliente, textoConReparto]) {
    const t = armar(facturaDe(["yo"]), { precio: 100000, agente: AGENTE });
    assert.ok(!t.includes("Juan Andrés Otero"), "el nombre no va");
    assert.ok(!t.includes("099616633"), "el telefono tampoco");
    assert.ok(!t.includes("Oficina"), "ni la oficina");
    // Y termina en el total o en la cuenta, no en un renglon suelto.
    const ultima = t.trim().split(String.fromCharCode(10)).pop();
    assert.match(ultima, /Total a pagar|\d/);
  }
});

/* Si factura con IVA una parte sola, el recargo no es el 22% y nombrarlo se contradice
   con la cuenta: el cliente multiplica por 22% en el teléfono y le da otra cosa. */
test("el 22% solo se nombra cuando TODO lleva IVA", () => {
  const todos = textoParaElCliente(facturaDe(["yo", "colega", "oficina"]), { agente: AGENTE });
  assert.match(todos, /IVA \(22%\)/);
  const parcial = textoParaElCliente(facturaDe(["yo"]), { agente: AGENTE });
  assert.match(parcial, /IVA: USD/);
  assert.ok(!parcial.includes("IVA (22%)"), "ese 22% no cerraría con el monto");
});

test("sin IVA marcado, el renglón no aparece", () => {
  const t = textoParaElCliente(facturaDe([]), { precio: 100000, agente: AGENTE });
  assert.ok(!t.includes("IVA"));
  assert.match(t, /Total a pagar: USD 3\.000/);
});

/* NO dice de que lado es. Muchos clientes no saben que una operacion tiene dos puntas, y
   leer "parte compradora" solo abre preguntas sobre como funciona el negocio justo cuando
   se esta por firmar. */
test("el texto no aclara si es la punta compradora o la vendedora", () => {
  const r = calcular({ precio: 100000, split: 0.45, puntas: [punta(), punta({ lado: "compradora" })] });
  const f = facturar(r, { regimen: "captacion_mia", split: 0.45, conIva: ["yo"] });
  for (const p of f.puntas) {
    const t = textoParaElCliente(p, { agente: AGENTE });
    assert.ok(!/compradora|vendedora/.test(t), "no tiene por que enterarse de las puntas");
    assert.match(t, /Comisión: /);
  }
});

test("sin titulo ni precio sigue saliendo un texto usable", () => {
  const t = textoParaElCliente(facturaDe(["yo"]), {});
  assert.match(t, /Comisión inmobiliaria/);
  assert.match(t, /Total a pagar/);
  assert.ok(!t.includes("undefined"));
  assert.ok(!t.includes("Precio de la operación"));
});

/* ---------- El texto con el reparto, para cuando hay que explicar ---------- */

test("el texto con reparto SÍ abre el detalle, que es para lo que está", () => {
  const t = textoConReparto(facturaDe(["yo"]), { precio: 100000, agente: AGENTE });
  assert.match(t, /Cómo se reparte/);
  assert.match(t, /Vos: 45%/);
  assert.match(t, /Colega: 35%/);
  assert.match(t, /RE\/MAX: 20%/);
  assert.match(t, /Total a pagar/);
});

test("los dos textos dan el MISMO total: es la misma cuenta contada distinto", () => {
  for (const conIva of [[], ["yo"], ["yo", "colega", "oficina"]]) {
    const f = facturaDe(conIva);
    const limpio = textoParaElCliente(f, { precio: 100000, agente: AGENTE });
    const detallado = textoConReparto(f, { precio: 100000, agente: AGENTE });
    const total = /Total a pagar: (USD [\d.]+)/;
    assert.equal(limpio.match(total)[1], detallado.match(total)[1]);
  }
});

/* ---------- Las cuentas para cobrar ---------- */

import { comoTexto, tieneDatos, sanear as sanearCuentas } from "../lib/cuentas.js";

test("la cuenta se adjunta al final del texto", () => {
  const cuenta = comoTexto({ titular: "Juan Andrés Otero", banco: "Banco BBVA", dolares: "24026123" });
  const t = textoParaElCliente(facturaDe(["yo"]), { precio: 100000, agente: AGENTE, cuenta });
  assert.match(t, /Para transferir:/);
  assert.match(t, /Banco BBVA/);
  assert.match(t, /Cuenta en dólares: 24026123/);
});

test("una cuenta vacía no ensucia el texto con renglones sin dato", () => {
  assert.deepEqual(comoTexto({}), []);
  assert.deepEqual(comoTexto(null), []);
  const t = textoParaElCliente(facturaDe(["yo"]), { precio: 100000, agente: AGENTE, cuenta: [] });
  assert.ok(!t.includes("Para transferir"));
});

test("solo se listan los renglones que tienen algo cargado", () => {
  const solo = comoTexto({ banco: "Itaú", pesos: "1925345" });
  assert.deepEqual(solo, ["Para transferir:", "Itaú", "Cuenta en pesos: 1925345"]);
});

test("tieneDatos distingue una cuenta cargada de una vacía", () => {
  assert.equal(tieneDatos({ banco: "Itaú" }), true);
  assert.equal(tieneDatos({ titular: "", banco: "", pesos: "", dolares: "" }), false);
  assert.equal(tieneDatos(null), false);
});

test("sanear deja siempre las dos cuentas, aunque venga basura", () => {
  const c = sanearCuentas(null);
  assert.deepEqual(Object.keys(c), ["mia", "remax"]);
  assert.equal(c.mia.banco, "");
});
