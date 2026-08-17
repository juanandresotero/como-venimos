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
