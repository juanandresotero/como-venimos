import { test } from "node:test";
import assert from "node:assert/strict";
import { contenido, nombreImagen, repartir, renglones, RENTAS } from "../lib/ficha-imagen.js";
import { calcular } from "../lib/renta.js";

const ENTRADAS = {
  precio: 100000, alquiler_mensual: 700, moneda_alquiler: "USD",
  meses_alquilados: 11, irpf_pct: 0.105, gastos_compra_pct: 0.07,
  titulo: "Eusebio Vidal 3100",
};

test("por defecto van las DOS rentas, y la real primero", () => {
  const d = contenido(ENTRADAS, calcular(ENTRADAS));
  assert.equal(d.cifras.length, 2);
  assert.equal(d.cifras[0].clave, "real");
  assert.equal(d.cifras[0].valor, "5,8%");
  assert.equal(d.cifras[1].clave, "bruta");
  assert.equal(d.cifras[1].valor, "8,4%");
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
  assert.match(d.nota, /no descuenta|descuenta/);
  assert.match(d.nota, /renta bruta que se dice en la calle/);
});

test("el nombre del archivo sale limpio de acentos y espacios", () => {
  assert.equal(nombreImagen("Eusebio Vidal 3100"), "renta-eusebio-vidal-3100.png");
  assert.equal(nombreImagen(""), "renta-calculo.png");
  assert.equal(nombreImagen("Maroñas / apto 4"), "renta-maro-as-apto-4.png");
});

/* ---------- Elegir que renta se manda ---------- */

test("se puede pedir solo la real", () => {
  const d = contenido(ENTRADAS, calcular(ENTRADAS), {}, { mostrar: "real" });
  assert.equal(d.cifras.length, 1);
  assert.equal(d.cifras[0].clave, "real");
});

test("se puede pedir solo la bruta, y ahi los costos no vienen al caso", () => {
  const d = contenido(ENTRADAS, calcular(ENTRADAS), {}, { mostrar: "bruta" });
  assert.equal(d.cifras.length, 1);
  assert.equal(d.cifras[0].clave, "bruta");
  // Mostrar el IRPF en una ficha que dice "sin descontar nada" se contradice sola.
  assert.ok(!d.filas.some(([n]) => n.includes("IRPF")));
  assert.ok(!d.filas.some(([n]) => n.includes("Capital")));
  assert.match(d.nota, /no descuenta nada/);
});

test("un 'mostrar' inventado cae en las dos, no deja la ficha sin numero", () => {
  const d = contenido(ENTRADAS, calcular(ENTRADAS), {}, { mostrar: "loquesea" });
  assert.equal(d.cifras.length, 2);
});

test("las tres opciones del menu existen y tienen nombre", () => {
  assert.equal(RENTAS.length, 3);
  for (const r of RENTAS) assert.ok(r.clave && r.nombre);
});

/* Que quede escrito a cuanto se tomo el dolar: sin eso el numero no se puede auditar. */
test("la cotizacion usada queda escrita en la ficha", () => {
  const d = contenido(ENTRADAS, calcular(ENTRADAS), {}, { cotizacion: "Dólar a $ 41,52" });
  assert.match(d.nota, /Dólar a \$ 41,52/);
});

test("sin cotizacion no se inventa una linea vacia", () => {
  const d = contenido(ENTRADAS, calcular(ENTRADAS), {}, {});
  assert.ok(!d.nota.includes("Dólar"));
});

test("el nombre del archivo dice cual renta lleva", () => {
  assert.equal(nombreImagen("Vidal 3100", "real"), "renta-vidal-3100-real.png");
  assert.equal(nombreImagen("Vidal 3100", "ambas"), "renta-vidal-3100.png");
});

/* ---------- El reparto del espacio ---------- */

/* Este es el test que arregla la queja de "los textos muy aglomerados abajo": el pie tiene
   su lugar reservado y ningun bloque puede empezar donde termina otro. */
test("ningun bloque se mete arriba de otro, con pocas o muchas filas", () => {
  for (const filas of [2, 4, 6, 8, 10, 12]) {
    for (const nota of [1, 2, 3, 4]) {
      const L = repartir(filas, nota);
      const finDeFilas = L.filasDesde + L.paso * filas;
      assert.ok(finDeFilas <= L.remateY, `${filas} filas se comen el remate`);
      assert.ok(L.remateY + L.remateAlto <= L.notaY, `el remate pisa la nota (${filas}/${nota})`);
      assert.ok(L.notaY > L.remateY, "la nota va despues del remate");
      assert.ok(L.pieLinea < L.alto, "el pie entra en la ficha");
    }
  }
});

test("las filas se aprietan pero nunca por debajo de lo legible", () => {
  for (const filas of [4, 10, 16]) {
    const L = repartir(filas, 3);
    assert.ok(L.paso >= 46, `con ${filas} filas el renglon quedo ilegible: ${L.paso}`);
    assert.ok(L.paso <= 62, "sin filas de mas no se estira de gusto");
  }
});

test("el caso real de la ficha completa entra sin recortar nada", () => {
  const d = contenido(ENTRADAS, calcular(ENTRADAS));
  const L = repartir(d.filas.length, 3, d.remate.length);
  assert.ok(L.entraTodo, "la ficha de un caso normal no deberia tener que recortarse");
});

test("renglones: corta por palabras y no deja renglones vacios", () => {
  const medir = (t) => t.length * 10;
  const r = renglones(medir, "uno dos tres cuatro cinco", 100);
  assert.ok(r.length > 1);
  assert.ok(r.every((x) => x.length));
  assert.equal(r.join(" "), "uno dos tres cuatro cinco");
});

/* ---------- Cada monto en su moneda ---------- */

const EN_PESOS = {
  precio: 110000, alquiler_mensual: 25500, moneda_alquiler: "UYU", tipo_cambio: 40,
  meses_alquilados: 11, irpf_pct: 0.105, refaccion_meses: 1,
};

test("con el alquiler en pesos, lo que sale del alquiler va en pesos", () => {
  const d = contenido(EN_PESOS, calcular(EN_PESOS));
  const bolsillo = d.remate.find(([n]) => n.includes("bolsillo"))[1];
  assert.ok(bolsillo.startsWith("$ "), `decia "${bolsillo}" y el alquiler esta en pesos`);
  const gastos = d.filas.find(([n]) => n.includes("Gastos del año"));
  if (gastos) assert.ok(gastos[1].startsWith("$ "));
});

test("el precio de la propiedad se queda en dolares aunque el alquiler sea en pesos", () => {
  const d = contenido(EN_PESOS, calcular(EN_PESOS));
  const precio = d.filas.find(([n]) => n === "Precio")[1];
  assert.ok(precio.startsWith("USD "), `el precio decia "${precio}"`);
});

test("con todo en dolares no aparece un signo de pesos por ningun lado", () => {
  const d = contenido(ENTRADAS, calcular(ENTRADAS));
  const todo = JSON.stringify(d);
  assert.ok(!todo.includes("$ "), "se colo un monto en pesos");
});

test("la conversion usa la cotizacion cargada, no una inventada", () => {
  const r = calcular(EN_PESOS);
  const d = contenido(EN_PESOS, r);
  const bolsillo = d.remate.find(([n]) => n.includes("bolsillo"))[1];
  const esperado = Math.round(r.bolsillo_por_mes * 40).toLocaleString("es-UY");
  assert.equal(bolsillo, `$ ${esperado}`);
});

test("sin cotizacion no se inventa una conversion: queda en dolares", () => {
  const sinCambio = { ...EN_PESOS, tipo_cambio: null };
  const d = contenido(sinCambio, calcular(sinCambio));
  const bolsillo = d.remate.find(([n]) => n.includes("bolsillo"))[1];
  assert.ok(bolsillo.startsWith("USD "));
});
