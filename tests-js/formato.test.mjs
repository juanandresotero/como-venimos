import { test } from "node:test";
import assert from "node:assert/strict";
import {
  plata, plataUSD, compacto, pct, fechaCorta, diasEntre, mes, escapar, fechaRazonable,
  numeroDesde,
} from "../lib/formato.js";

test("plata: separador de miles con punto, como en Uruguay", () => {
  assert.equal(plata(20079), "20.079");
  assert.equal(plata(1770), "1.770");
  assert.equal(plata(0), "0");
});

test("plata: redondea, no muestra centavos", () => {
  assert.equal(plata(20079.6), "20.080");
});

test("plata: null o undefined da un guion", () => {
  assert.equal(plata(null), "—");
  assert.equal(plata(undefined), "—");
});

test("plataUSD antepone la moneda", () => {
  assert.equal(plataUSD(20079), "USD 20.079");
});

test("compacto: miles con una decimal", () => {
  assert.equal(compacto(20079), "20,1k");
  assert.equal(compacto(1770), "1,8k");
  assert.equal(compacto(940), "940");
  assert.equal(compacto(185932), "186k");
});

test("pct: una decimal y coma", () => {
  assert.equal(pct(0.309), "30,9%");
  assert.equal(pct(0.627), "62,7%");
  assert.equal(pct(1), "100,0%");
});

test("fechaCorta: dia y mes abreviado", () => {
  assert.equal(fechaCorta("2026-08-17"), "17 ago");
  assert.equal(fechaCorta("2026-01-05"), "5 ene");
});

test("fechaCorta: agrega el año si no es el corriente", () => {
  assert.equal(fechaCorta("2023-01-24", 2026), "24 ene 23");
});

test("fechaCorta: sin fecha da un guion", () => {
  assert.equal(fechaCorta(null), "—");
});

test("diasEntre cuenta bien", () => {
  assert.equal(diasEntre("2026-08-01", "2026-08-17"), 16);
  assert.equal(diasEntre("2026-08-17", "2026-08-17"), 0);
});

test("mes devuelve el numero de mes", () => {
  assert.equal(mes("2026-08-17"), 8);
});

test("escapar deja el HTML inofensivo", () => {
  assert.equal(escapar('<b>Calle & "Co"</b>'), "&lt;b&gt;Calle &amp; &quot;Co&quot;&lt;/b&gt;");
  assert.equal(escapar(null), "");
});

/* Un <input type="date"> dispara "change" mientras se tipea el año. */
test("una fecha a medio escribir se rechaza", () => {
  assert.equal(fechaRazonable("0001-09-01"), false);
  assert.equal(fechaRazonable("0202-09-01"), false);
  assert.equal(fechaRazonable("20-09-01"), false);
  assert.equal(fechaRazonable("no es fecha"), false);
});

test("una fecha normal se acepta, y vacio tambien", () => {
  assert.equal(fechaRazonable("2026-08-17"), true);
  assert.equal(fechaRazonable("2000-01-01"), true);
  assert.equal(fechaRazonable("2100-12-31"), true);
  assert.equal(fechaRazonable(""), true, "vacio quiere decir 'todavia no se'");
  assert.equal(fechaRazonable(null), true);
});

/* Los montos se escriben con los puntos de miles y hay que poder leerlos de vuelta. */
test("un monto con puntos de miles se lee bien", () => {
  assert.equal(numeroDesde("100.000"), 100000);
  assert.equal(numeroDesde("1.250.000"), 1250000);
  assert.equal(numeroDesde("100000"), 100000, "sin puntos tambien");
});

test("la coma es el decimal, como en Uruguay", () => {
  assert.equal(numeroDesde("1.234,50"), 1234.5);
  assert.equal(numeroDesde("0,5"), 0.5);
});

test("vacio y basura no se toman por cero", () => {
  assert.equal(numeroDesde(""), null);
  assert.equal(numeroDesde("   "), null);
  assert.equal(numeroDesde(null), null);
  assert.equal(numeroDesde("no es un numero"), null);
});

test("lo que se escribe y se vuelve a mostrar da lo mismo", () => {
  for (const n of [0, 1, 999, 1000, 100000, 1250000]) {
    assert.equal(numeroDesde(plata(n)), n, `no cierra con ${n}`);
  }
});

/* ---------- Separador de miles mientras se escribe ---------- */

import { separarMiles, posicionTrasFormatear, digitosHasta } from "../lib/formato.js";

test("separarMiles: no se mete hasta que hay cuatro digitos", () => {
  assert.equal(separarMiles("1"), "1");
  assert.equal(separarMiles("999"), "999");
  assert.equal(separarMiles("1000"), "1.000");
  assert.equal(separarMiles("100000"), "100.000");
  assert.equal(separarMiles("1234567"), "1.234.567");
});

test("separarMiles: al borrar un digito los puntos se reacomodan", () => {
  // "1.000" menos un digito quedaba "100" con el punto viejo pegado: "1.00".
  assert.equal(separarMiles("1.00"), "100");
  assert.equal(separarMiles("12.34"), "1.234");
});

test("separarMiles: la parte decimal se respeta tal como se esta escribiendo", () => {
  assert.equal(separarMiles("1234,"), "1.234,");
  assert.equal(separarMiles("1234,5"), "1.234,5");
  assert.equal(separarMiles("1234,50"), "1.234,50");
  assert.equal(separarMiles("999,5"), "999,5");
});

test("separarMiles: vacio y casos raros no explotan", () => {
  assert.equal(separarMiles(""), "");
  assert.equal(separarMiles(null), "");
  assert.equal(separarMiles("-1234"), "-1.234");
});

test("separarMiles: da la vuelta completa con numeroDesde", () => {
  assert.equal(numeroDesde(separarMiles("1234567")), 1234567);
  assert.equal(numeroDesde(separarMiles("1234,50")), 1234.5);
});

test("digitosHasta: cuenta digitos, no posiciones", () => {
  assert.equal(digitosHasta("1.234", 5), 4);
  assert.equal(digitosHasta("1.234", 1), 1);
  assert.equal(digitosHasta("1.234", 2), 1, "el punto no cuenta");
});

/* El cursor es lo que hace usable o inusable un campo que se reformatea solo. */
test("posicionTrasFormatear: el cursor queda despues del mismo digito", () => {
  // Escribiendo "1000": el cursor estaba al final (4 digitos), el texto pasa a "1.000".
  assert.equal(posicionTrasFormatear("1.000", 4), 5);
  // Con el cursor en el medio: tras el primer digito de "1.000" es la posicion 1.
  assert.equal(posicionTrasFormatear("1.000", 1), 1);
  assert.equal(posicionTrasFormatear("1.234.567", 4), 5);
});

test("posicionTrasFormatear: sin digitos a la izquierda no se va del campo", () => {
  assert.equal(posicionTrasFormatear("1.000", 0), 5);
  assert.equal(posicionTrasFormatear("", 3), 0);
});
