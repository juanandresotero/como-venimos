import { test } from "node:test";
import assert from "node:assert/strict";
import { contenido, nombreImagen } from "../lib/ficha-imagen.js";
import { calcular } from "../lib/renta.js";

const ENTRADAS = {
  precio: 100000, alquiler_mensual: 700, moneda_alquiler: "USD",
  meses_alquilados: 11, irpf_pct: 0.105, gastos_compra_pct: 0.07,
  titulo: "Eusebio Vidal 3100",
};

test("la ficha muestra la renta real, no la bruta, como numero principal", () => {
  const r = calcular(ENTRADAS);
  const d = contenido(ENTRADAS, r);
  assert.equal(d.heroe, "5,5%");
  assert.match(d.heroePie, /la bruta es 7,7%/);
});

test("la ficha lleva el capital invertido, que es lo que el Excel no mostraba", () => {
  const d = contenido(ENTRADAS, calcular(ENTRADAS));
  const capital = d.filas.find(([nombre]) => nombre.includes("Capital"));
  assert.equal(capital[1], "USD 107.000");
});

test("el alquiler en pesos se muestra con el signo de pesos", () => {
  const enPesos = { ...ENTRADAS, moneda_alquiler: "UYU", alquiler_mensual: 28000, tipo_cambio: 40 };
  const d = contenido(enPesos, calcular(enPesos));
  const fila = d.filas.find(([nombre]) => nombre.includes("Alquiler"));
  assert.equal(fila[1], "$ 28.000");
});

test("sin renta positiva no se promete un plazo de recupero", () => {
  const malo = { ...ENTRADAS, contribucion_anual: 99999 };
  const d = contenido(malo, calcular(malo));
  assert.equal(d.remate.find(([n]) => n.includes("paga sola"))[1], "—");
});

test("la ficha va firmada aunque no se configure el agente", () => {
  const d = contenido(ENTRADAS, calcular(ENTRADAS));
  assert.equal(d.agente, "Juan Andrés Otero");
  assert.equal(d.oficina, "RE/MAX Único");
});

test("los datos del agente se pueden cambiar", () => {
  const d = contenido(ENTRADAS, calcular(ENTRADAS), { nombre: "Otra", telefono: "099123456" });
  assert.equal(d.agente, "Otra");
  assert.equal(d.telefono, "099123456");
});

test("la aclaracion de que la renta real no es la bruta siempre esta", () => {
  const d = contenido(ENTRADAS, calcular(ENTRADAS));
  assert.match(d.nota, /gastos de compra/);
});

test("el nombre del archivo sale limpio de acentos y espacios", () => {
  assert.equal(nombreImagen("Eusebio Vidal 3100"), "renta-eusebio-vidal-3100.png");
  assert.equal(nombreImagen(""), "renta-calculo.png");
  assert.equal(nombreImagen("Maroñas / apto 4"), "renta-maro-as-apto-4.png");
});
