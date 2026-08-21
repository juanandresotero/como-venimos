import { test } from "node:test";
import assert from "node:assert/strict";
import {
  leerAviso, leerAvisos, comercioLegible, categoriaSugerida, aprender,
} from "../lib/sms-banco.js";

/* LOS MENSAJES DE VERDAD, copiados de la captura que mandó Juan el 2026-08-21. Vienen
   partidos en varias líneas porque así los corta la pantalla del celular. */
const PROPINA = `Alerta TDD BBVA Tarjeta: 4934
Importe: PES 20.00 Comercio:
033DLO*PedidosYa PropinaVIS3
Tipo: Compra Fecha: 20/08/2026
17:55:05.`;

const BAR = `Alerta TDD BBVA Tarjeta: 4934
Importe: PES 1343.03 Comercio:
033DLO*PedidosYa Bar Tv VIS3
Tipo: Compra Fecha: 20/08/2026
22:05:42.`;

const ENVIO = `Alerta TDD BBVA Tarjeta: 4934
Importe: PES 55.08 Comercio:
033DLO*PedidosYa Envio VIS3
Tipo: Compra Fecha: 20/08/2026
22:06:16.`;

const NAFTA = `Alerta TDD BBVA Tarjeta: 4934
Importe: PES 255.74 Comercio:
033SERVICENTRO DE LA VICVIS3
Tipo: Compra Fecha: 21/08/2026
00:10:40.`;

test("el aviso del bar: importe, comercio y fecha", () => {
  const a = leerAviso(BAR);
  assert.equal(a.monto, 1343.03);
  assert.equal(a.moneda, "UYU");
  assert.equal(a.comercio, "PedidosYa Bar Tv");
  assert.equal(a.fecha, "2026-08-20");
  assert.equal(a.hora, "22:05:42");
  assert.equal(a.tarjeta, "4934");
  assert.equal(a.tipo, "Compra");
});

/* El que Juan puso de ejemplo escrito: "muestra claro importe: pes 255.75, comercio:
   servicentro de las vicvi". */
test("el de la nafta, que viene TODO EN MAYÚSCULAS", () => {
  const a = leerAviso(NAFTA);
  assert.equal(a.monto, 255.74);
  assert.equal(a.comercio, "Servicentro de la Vic",
    "gritado en mayúsculas es como lo manda el banco, no como lo lee una persona");
  assert.equal(a.fecha, "2026-08-21");
});

test("los centavos no se pierden", () => {
  assert.equal(leerAviso(ENVIO).monto, 55.08);
  assert.equal(leerAviso(PROPINA).monto, 20);
});

/* ---------- La basura de la red de pagos ---------- */

/* `033` es el código del adquirente, `VIS3` la marca de Visa y `DLO*` la pasarela que cobra
   por PedidosYa. Nada de eso le dice nada a nadie. */
test("se le saca el código del adquirente y la marca de la tarjeta", () => {
  assert.equal(comercioLegible("033DLO*PedidosYa PropinaVIS3"), "PedidosYa Propina");
  assert.equal(comercioLegible("033SERVICENTRO DE LA VICVIS3"), "Servicentro de la Vic");
  assert.equal(comercioLegible("033DLO*PedidosYa Envio VIS3"), "PedidosYa Envio");
});

test("las siglas se respetan y las palabras de unión quedan en minúscula", () => {
  assert.equal(comercioLegible("033UTE MONTEVIDEOVIS3"), "UTE Montevideo");
  assert.equal(comercioLegible("033FARMACIA DE LA COSTAVIS3"), "Farmacia de la Costa");
});

test("un comercio que ya viene bien escrito no se toca", () => {
  assert.equal(comercioLegible("033DLO*PedidosYa Bar Tv VIS3"), "PedidosYa Bar Tv");
});

/* ---------- Lo que NO tiene que pasar ---------- */

/* Una devolución es plata que VUELVE. Anotarla como gasto deja el saldo el doble de mal:
   ni descuenta lo que entró ni deja de restar lo que no salió. */
test("una devolución se marca como tal, no como gasto", () => {
  const a = leerAviso(`Alerta TDD BBVA Tarjeta: 4934
Importe: PES 500.00 Comercio: 033TIENDA XVIS3
Tipo: Devolucion Fecha: 21/08/2026 10:00:00.`);
  assert.equal(a.devuelve, true);
});

test("una compra normal no se confunde con una devolución", () => {
  assert.equal(leerAviso(BAR).devuelve, false);
});

test("un mensaje que no es del banco no devuelve nada", () => {
  assert.equal(leerAviso("Hola, te llamo más tarde"), null);
  assert.equal(leerAviso(""), null);
  assert.equal(leerAviso(null), null);
});

test("un aviso sin importe no sirve: no se inventa un gasto en cero", () => {
  assert.equal(leerAviso("Alerta TDD BBVA Tarjeta: 4934 Tipo: Compra"), null);
  assert.equal(leerAviso("Importe: PES 0.00 Comercio: X"), null);
});

test("los dólares se distinguen de los pesos", () => {
  const a = leerAviso("Importe: DOL 25.50 Comercio: 033AMAZONVIS3 Fecha: 21/08/2026");
  assert.equal(a.moneda, "USD");
  assert.equal(a.monto, 25.5);
});

/* El mismo banco escribe el monto de las dos formas en distintos avisos. */
test("aguanta el monto escrito con separador de miles", () => {
  assert.equal(leerAviso("Importe: PES 1.343,03 Comercio: X").monto, 1343.03);
});

/* ---------- Varios juntos ---------- */

test("se pueden compartir varios avisos de una vez", () => {
  const varios = leerAvisos([PROPINA, BAR, ENVIO, NAFTA].join("\n\n"));
  assert.equal(varios.length, 4);
  assert.deepEqual(varios.map((a) => a.monto), [20, 1343.03, 55.08, 255.74]);
});

/* Compartir dos veces el mismo mensaje pasa, y no puede cobrarlo dos veces. */
test("el mismo aviso repetido entra una sola vez", () => {
  assert.equal(leerAvisos([BAR, BAR].join("\n\n")).length, 1);
});

/* Dos compras del mismo monto en el mismo lugar SÍ pueden ser dos: lo que las separa es la
   hora, y el banco no manda dos compras idénticas en el mismo segundo. */
test("dos compras iguales a distinta hora son dos gastos", () => {
  const otra = BAR.replace("22:05:42", "22:40:10");
  assert.equal(leerAvisos([BAR, otra].join("\n\n")).length, 2);
});

/* ---------- La categoría ---------- */

test("adivina la categoría de los comercios conocidos", () => {
  assert.equal(categoriaSugerida("PedidosYa Bar Tv"), "Comida");
  assert.equal(categoriaSugerida("Servicentro de la Vic"), "Transporte");
  assert.equal(categoriaSugerida("Farmacia de la Costa"), "Salud");
  assert.equal(categoriaSugerida("UTE Montevideo"), "Casa");
});

/* Adivinar de más es peor que no adivinar: un gasto en la categoría equivocada ensucia las
   cuentas sin que se note. Si no se sabe, se pregunta. */
test("si no lo conoce no inventa: devuelve nada y se pregunta", () => {
  assert.equal(categoriaSugerida("Kiosco Don Pepe"), null);
});

/* Lo que hace que esto sirva de verdad: la próxima compra en ese lugar ya viene puesta. */
test("aprende la categoría que se le enseña, y la usa la próxima vez", () => {
  const sabidas = aprender({}, "Kiosco Don Pepe", "Comida");
  assert.equal(categoriaSugerida("Kiosco Don Pepe", sabidas), "Comida");
  assert.equal(categoriaSugerida("KIOSCO DON PEPE", sabidas), "Comida",
    "y no se pierde por una mayúscula");
});

test("lo aprendido le gana a lo que la app creía saber", () => {
  const sabidas = aprender({}, "PedidosYa Bar Tv", "Salidas");
  assert.equal(categoriaSugerida("PedidosYa Bar Tv", sabidas), "Salidas");
});
