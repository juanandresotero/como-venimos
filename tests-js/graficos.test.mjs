import { test } from "node:test";
import assert from "node:assert/strict";
import { lineas, torta, colorear, agruparCola } from "../lib/graficos.js";

const puntos = (valores) => valores.map((ganancia) => ({ ganancia }));

test("lineas: sin datos no dibuja nada", () => {
  assert.equal(lineas([]), "");
  assert.equal(lineas([{ nombre: "x", puntos: [] }]), "");
});

/* Lo que fallaba en las barras: el valor mas alto tiene que llegar arriba y el cero
   quedar en el piso. Si dos valores distintos dan la misma coordenada, el grafico miente. */
test("lineas: el tope llega arriba, el cero al piso y el medio queda en el medio", () => {
  const svg = lineas([{ nombre: "a", puntos: puntos([0, 50, 100]) }]);
  const coordenadas = /polyline points="([^"]+)"/.exec(svg)[1]
    .split(" ").map((p) => Number(p.split(",")[1]));
  const [cero, medio, tope] = coordenadas;
  assert.ok(tope < medio && medio < cero, "en SVG el eje va al reves: menos y es mas arriba");
  const mitad = (cero + tope) / 2;
  assert.ok(Math.abs(medio - mitad) < 0.5, "la mitad del valor va a la mitad de la altura");
});

test("lineas: varias series comparten escala, o la comparacion miente", () => {
  const svg = lineas([
    { nombre: "2024", puntos: puntos([100]) },
    { nombre: "2025", puntos: puntos([50]) },
  ]);
  const altos = [...svg.matchAll(/polyline points="([^"]+)"/g)]
    .map((m) => Number(m[1].split(",")[1]));
  assert.equal(altos.length, 2);
  assert.notEqual(altos[0], altos[1], "100 y 50 no pueden caer en el mismo alto");
});

test("lineas: todo cero no divide por cero ni rompe", () => {
  const svg = lineas([{ nombre: "a", puntos: puntos([0, 0, 0]) }]);
  assert.ok(svg.includes("<polyline"));
  assert.ok(!svg.includes("NaN"));
});

test("lineas: un solo punto no rompe la escala horizontal", () => {
  const svg = lineas([{ nombre: "a", puntos: puntos([500]) }]);
  assert.ok(!svg.includes("NaN"));
});

test("lineas: el campo acumulado tambien se puede dibujar", () => {
  const svg = lineas([{ nombre: "a", puntos: [{ acumulado: 10 }, { acumulado: 90 }] }],
    { campo: "acumulado" });
  assert.ok(svg.includes("<polyline"));
  assert.ok(!svg.includes("NaN"));
});

test("torta: las porciones cubren la vuelta entera y ninguna se pisa", () => {
  const svg = torta([{ ganancia: 50 }, { ganancia: 30 }, { ganancia: 20 }]);
  const largos = [...svg.matchAll(/stroke-dasharray="([\d.]+)/g)].map((m) => Number(m[1]));
  assert.equal(largos.length, 3);
  const vuelta = 2 * Math.PI * 42;
  assert.ok(Math.abs(largos.reduce((a, b) => a + b, 0) - vuelta) < 0.5);
  assert.ok(Math.abs(largos[0] - vuelta / 2) < 0.5, "el 50% ocupa media vuelta");
});

test("torta: sin plata no dibuja nada", () => {
  assert.equal(torta([]), "");
  assert.equal(torta([{ ganancia: 0 }]), "");
});

test("agruparCola: junta la cola larga en una sola fila", () => {
  const filas = Array.from({ length: 12 }, (_, i) => ({
    nombre: `b${i}`, ganancia: 100 - i * 5, negocios: 1,
  }));
  const salida = agruparCola(filas, 5);
  assert.equal(salida.length, 6);
  assert.equal(salida[5].nombre, "otros 7");
  assert.equal(salida[5].negocios, 7);
  // Nada se pierde por el camino: la suma tiene que dar lo mismo.
  const antes = filas.reduce((t, f) => t + f.ganancia, 0);
  const despues = salida.reduce((t, f) => t + f.ganancia, 0);
  assert.equal(antes, despues);
});

test("agruparCola: si hay pocas filas no inventa un 'otros' de uno", () => {
  const filas = [{ nombre: "a", ganancia: 10 }, { nombre: "b", ganancia: 5 }];
  assert.equal(agruparCola(filas, 5).length, 2);
});

test("colorear: la cabeza lleva color y la cola se apaga", () => {
  const filas = colorear(Array.from({ length: 8 }, (_, i) => ({ nombre: `x${i}` })), 5);
  assert.notEqual(filas[0].color, "var(--linea)");
  assert.equal(filas[7].color, "var(--linea)");
});
