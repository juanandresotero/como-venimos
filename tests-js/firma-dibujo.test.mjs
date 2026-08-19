import { test } from "node:test";
import assert from "node:assert/strict";
import { encajar, dibujarEn, tirasDeTinta } from "../lib/firma-dibujo.js";
import { deTrazos, deMascara } from "../lib/firma.js";

/* Un canvas de mentira que anota lo que le pidieron. */
function lienzoFalso() {
  const hecho = [];
  return {
    hecho,
    fillStyle: "", strokeStyle: "", lineWidth: 0, lineCap: "", lineJoin: "",
    beginPath: () => hecho.push(["beginPath"]),
    moveTo: (x, y) => hecho.push(["moveTo", Math.round(x), Math.round(y)]),
    lineTo: (x, y) => hecho.push(["lineTo", Math.round(x), Math.round(y)]),
    stroke: () => hecho.push(["stroke"]),
    fillRect: (x, y, a, b) => hecho.push(["fillRect", Math.round(x), Math.round(y), Math.round(a), Math.round(b)]),
  };
}

const CAJA = { x: 0, y: 0, ancho: 200, alto: 100 };

test("la firma se agranda hasta entrar, sin deformarse", () => {
  // 100 de ancho por 100 de alto en una caja de 200x100: manda el alto.
  const firma = deTrazos([[{ x: 0, y: 0 }, { x: 100, y: 100 }]]);
  const e = encajar(firma, CAJA);
  assert.equal(e.escala, 1, "el alto es el que limita");
  assert.equal(Math.round(e.ancho), 100);
  assert.equal(Math.round(e.alto), 100);
});

test("queda centrada en la caja", () => {
  const firma = deTrazos([[{ x: 0, y: 0 }, { x: 100, y: 100 }]]);
  const e = encajar(firma, CAJA);
  assert.equal(Math.round(e.dx), 50, "sobran 100 de ancho: 50 de cada lado");
  assert.equal(Math.round(e.dy), 0);
});

test("una firma dibujada se pinta como un trazo por cada trazo", () => {
  const ctx = lienzoFalso();
  dibujarEn(ctx, deTrazos([
    [{ x: 0, y: 0 }, { x: 50, y: 50 }, { x: 100, y: 0 }],
    [{ x: 0, y: 50 }, { x: 100, y: 50 }],
  ]), CAJA);
  assert.equal(ctx.hecho.filter((x) => x[0] === "beginPath").length, 2);
  assert.equal(ctx.hecho.filter((x) => x[0] === "stroke").length, 2);
  assert.equal(ctx.hecho.filter((x) => x[0] === "moveTo").length, 2, "uno por trazo");
  assert.equal(ctx.hecho.filter((x) => x[0] === "lineTo").length, 3);
});

/* Pedir un rectangulo por pixel se nota: una firma de 300x123 tiene miles. */
test("una mascara se pinta por tiras y no pixel por pixel", () => {
  const ancho = 32;
  const alto = 4;
  const porFila = Math.ceil(ancho / 8);
  const bits = new Uint8Array(porFila * alto);
  // Una fila entera de tinta: tiene que salir UNA sola tira.
  for (let x = 0; x < ancho; x++) bits[1 * porFila + (x >> 3)] |= 128 >> (x & 7);
  const ctx = lienzoFalso();
  dibujarEn(ctx, deMascara({ ancho, alto, bits }), CAJA);
  const rectangulos = ctx.hecho.filter((x) => x[0] === "fillRect");
  assert.equal(rectangulos.length, 1, `salieron ${rectangulos.length} rectangulos`);
});

test("dos manchas separadas en la misma fila son dos tiras", () => {
  const ancho = 32;
  const porFila = 4;
  const bits = new Uint8Array(porFila * 2);
  for (const x of [1, 2, 3, 20, 21]) bits[(x >> 3)] |= 128 >> (x & 7);
  const tiras = tirasDeTinta(deMascara({ ancho, alto: 2, bits }));
  assert.deepEqual(tiras, [{ x: 1, y: 0, largo: 3 }, { x: 20, y: 0, largo: 2 }]);
});

test("una firma vacia no pinta nada ni rompe", () => {
  const ctx = lienzoFalso();
  assert.equal(dibujarEn(ctx, deTrazos([]), CAJA), null);
  assert.equal(dibujarEn(ctx, null, CAJA), null);
  assert.deepEqual(ctx.hecho, []);
});
