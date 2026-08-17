import { test } from "node:test";
import assert from "node:assert/strict";
import { plata, plataUSD, compacto, pct, fechaCorta, diasEntre, mes, escapar } from "../lib/formato.js";

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
