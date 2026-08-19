import { test } from "node:test";
import assert from "node:assert/strict";
import { enLetras } from "../lib/numero-a-letras.js";

test("los primeros treinta, que son los irregulares", () => {
  assert.equal(enLetras(0), "cero");
  assert.equal(enLetras(1), "uno");
  assert.equal(enLetras(15), "quince");
  assert.equal(enLetras(16), "dieciséis");
  assert.equal(enLetras(21), "veintiuno");
  assert.equal(enLetras(22), "veintidós");
  assert.equal(enLetras(29), "veintinueve");
});

test("de treinta en adelante aparece la 'y'", () => {
  assert.equal(enLetras(30), "treinta");
  assert.equal(enLetras(31), "treinta y uno");
  assert.equal(enLetras(45), "cuarenta y cinco");
  assert.equal(enLetras(99), "noventa y nueve");
});

/* "cien" a secas, pero "ciento uno". Es la trampa clasica. */
test("cien es cien, y ciento cuando lleva algo atras", () => {
  assert.equal(enLetras(100), "cien");
  assert.equal(enLetras(101), "ciento uno");
  assert.equal(enLetras(115), "ciento quince");
  assert.equal(enLetras(134), "ciento treinta y cuatro");
  assert.equal(enLetras(200), "doscientos");
  assert.equal(enLetras(500), "quinientos");
  assert.equal(enLetras(700), "setecientos");
  assert.equal(enLetras(999), "novecientos noventa y nueve");
});

/* Nunca "uno mil": es "mil". Y el uno se apocopa delante de mil. */
test("los miles, con el uno apocopado", () => {
  assert.equal(enLetras(1000), "mil");
  assert.equal(enLetras(1001), "mil uno");
  assert.equal(enLetras(2000), "dos mil");
  assert.equal(enLetras(21000), "veintiún mil");
  assert.equal(enLetras(31000), "treinta y un mil");
  assert.equal(enLetras(134000), "ciento treinta y cuatro mil");
  assert.equal(enLetras(999999), "novecientos noventa y nueve mil novecientos noventa y nueve");
});

test("los millones, en singular y en plural", () => {
  assert.equal(enLetras(1000000), "un millón");
  assert.equal(enLetras(2000000), "dos millones");
  assert.equal(enLetras(2500000), "dos millones quinientos mil");
});

/* Los precios de las cartas reales del usuario. */
test("los montos que aparecen de verdad", () => {
  assert.equal(enLetras(110000), "ciento diez mil");
  assert.equal(enLetras(134000), "ciento treinta y cuatro mil");
  assert.equal(enLetras(56000), "cincuenta y seis mil");
});

test("lo que no es un entero positivo devuelve vacio", () => {
  assert.equal(enLetras(null), "");
  assert.equal(enLetras(undefined), "");
  assert.equal(enLetras(-5), "");
  assert.equal(enLetras(1.5), "");
  assert.equal(enLetras("hola"), "");
});
