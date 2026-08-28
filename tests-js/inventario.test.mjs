/* El inventario de un alquiler.

   En el inventario de Leyenda patria hay 165 casilleros y más de tres de cada cuatro dicen
   "Buen estado – sin detalles". Lo que le come el tiempo a Juan no es mirar la propiedad: es
   escribir 165 veces lo mismo. Por eso todo arranca en buen estado y sólo se tocan las
   excepciones. */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ESTADOS, POR_DEFECTO, TIPOS_DE_AMBIENTE, CLAUSULAS, comoSeLee, conCantidad,
  nuevoAmbiente, nuevoItem, nuevoInventario, numerar, comoSeLlama, comoVa,
  cuenta, loQueSeImprime,
} from "../lib/inventario.js";

/* ---------- Cómo se lee un renglón ---------- */

test("por defecto todo arranca en buen estado", () => {
  const item = nuevoItem("Paredes");
  assert.equal(item.estado, POR_DEFECTO);
  assert.equal(comoSeLee(item), "Buen estado – sin detalles");
});

/* EL VOCABULARIO ES EL SUYO, palabra por palabra. Un inventario se firma y se usa para
   discutir un depósito: cambiarle las palabras por otras "mejores" le cambia el sentido a un
   documento que ya usó veinte veces. */
test("el texto que sale impreso es el que él escribe hoy", () => {
  const dice = (estado, detalle = "") =>
    comoSeLee({ ...nuevoItem("x"), estado, detalle });
  assert.equal(dice("bien"), "Buen estado – sin detalles");
  assert.equal(dice("perfecto"), "Perfecto – sin detalles");
  assert.equal(dice("detalles"), "Buen estado – con detalles");
});

test("el detalle se suma al estado", () => {
  assert.equal(comoSeLee({ nombre: "Placar", estado: "detalles", detalle: "una rajadura interior en uno" }),
    "Buen estado – con detalles · una rajadura interior en uno");
});

/* "CON PROBLEMAS" SIN EXPLICAR QUE PROBLEMA no sirve de nada el día que hay que discutir un
   depósito. El detalle es lo único que se lee. */
test("con problemas, manda el detalle", () => {
  assert.equal(comoSeLee({ nombre: "Toldos", estado: "malo", detalle: "Con hongos, mecanismo roto" }),
    "Con hongos, mecanismo roto");
  assert.equal(comoSeLee({ nombre: "Toldos", estado: "malo", detalle: "" }), "Con problemas");
});

test("lo que no tiene no se escribe", () => {
  assert.equal(comoSeLee({ nombre: "Bidet", estado: "no_tiene", detalle: "algo" }), "");
});

/* LA CANTIDAD SOLO SE ESCRIBE CUANDO ES MAS DE UNA. Poner "x1" en las otras ciento sesenta
   filas es ruido. */
test("la cantidad sólo aparece si es más de una", () => {
  assert.equal(conCantidad({ nombre: "Portalámpara", cantidad: 2 }), "Portalámpara x2");
  assert.equal(conCantidad({ nombre: "Portalámpara", cantidad: 1 }), "Portalámpara");
  assert.equal(conCantidad({ nombre: "Portalámpara" }), "Portalámpara");
});

/* ---------- Las plantillas ---------- */

/* Cada ítem está porque él lo escribió en su inventario, no porque a mí me parezca que un
   inventario debería tenerlo. */
test("un dormitorio trae lo que él pone en un dormitorio", () => {
  const d = nuevoAmbiente("dormitorio");
  const nombres = d.items.map((i) => i.nombre);
  for (const debe of ["Paredes", "Techos", "Piso", "Placar", "Cajón persiana", "Correa ventana"]) {
    assert.ok(nombres.includes(debe), `falta ${debe}`);
  }
  assert.ok(d.items.every((i) => i.estado === POR_DEFECTO), "todo arranca en buen estado");
});

test("una cocina trae hasta la conexión del lavarropas", () => {
  const nombres = nuevoAmbiente("cocina").items.map((i) => i.nombre);
  assert.ok(nombres.includes("Conexión lavarropas"));
  assert.ok(nombres.includes("Anafe"));
  assert.ok(nombres.includes("Despojador"));
});

test("un ambiente vacío es para lo que no está en ninguna lista", () => {
  const otro = nuevoAmbiente("vacio", "Altillo");
  assert.equal(otro.nombre, "Altillo");
  assert.deepEqual(otro.items, []);
});

test("un tipo que no existe no rompe nada", () => {
  assert.deepEqual(nuevoAmbiente("garaje-espacial").items, []);
});

/* ---------- Los ambientes repetidos ---------- */

/* Tres dormitorios llamados los tres "Dormitorio" y en el documento no se sabe cuál es cuál. */
test("los dormitorios se numeran solos", () => {
  const ambientes = numerar([
    nuevoAmbiente("living"), nuevoAmbiente("dormitorio"),
    nuevoAmbiente("dormitorio"), nuevoAmbiente("dormitorio"),
  ]);
  assert.deepEqual(ambientes.map((a) => a.nombre),
    ["Living comedor", "Dormitorio 1", "Dormitorio 2", "Dormitorio 3"]);
});

test("con uno solo no se numera: 'Dormitorio 1' de uno solo es raro", () => {
  const ambientes = numerar([nuevoAmbiente("living"), nuevoAmbiente("dormitorio")]);
  assert.equal(ambientes[1].nombre, "Dormitorio");
});

test("un nombre puesto a mano le gana a la numeración", () => {
  const ambientes = numerar([
    nuevoAmbiente("dormitorio", "Dormitorio principal"), nuevoAmbiente("dormitorio"),
  ]);
  assert.equal(ambientes[0].nombre, "Dormitorio principal");
  assert.equal(ambientes[1].nombre, "Dormitorio 2");
});

/* ---------- El inventario entero ---------- */

test("uno nuevo arranca con los ambientes de un apartamento típico", () => {
  const inv = nuevoInventario("2026-08-28");
  assert.equal(inv.fecha, "2026-08-28");
  assert.ok(inv.ambientes.length >= 4, "sacar lo que sobra es más rápido que sumar");
  assert.ok(inv.ambientes.some((a) => a.tipo === "cocina"));
});

/* LAS CLAUSULAS SE GUARDAN CON EL INVENTARIO, no en el código: si algún día su escribano le
   cambia una, los inventarios viejos siguen diciendo lo que decían el día que se firmaron. */
test("las cláusulas viajan adentro del inventario", () => {
  const inv = nuevoInventario("2026-08-28");
  assert.equal(inv.clausulas.length, CLAUSULAS.length);
  inv.clausulas[0] = "otra cosa";
  assert.notEqual(CLAUSULAS[0], "otra cosa", "cambiar una copia no toca el original");
});

test("la cantidad de hojas la pone el documento, no se cuenta a mano", () => {
  assert.ok(CLAUSULAS.some((c) => c.includes("{HOJAS}")));
});

test("el título de la propiedad se arma con lo que haya", () => {
  assert.equal(comoSeLlama({
    direccion: "Leyenda Patria 2914", unidad: "1001", barrio: "Punta Carretas",
    edificio: "Torre del Puerto",
  }), "Leyenda Patria 2914 apto 1001 · Torre del Puerto · Punta Carretas");
  assert.equal(comoSeLlama({ direccion: "Libertad 2400" }), "Libertad 2400");
  assert.equal(comoSeLlama({}), "");
});

/* Mientras haya ítems sin tocar, están todos dados por buenos sin que nadie los haya mirado.
   Ese número es el que dice si el inventario está pronto. */
test("comoVa cuenta lo que hay y lo que tiene detalle", () => {
  const inv = nuevoInventario("2026-08-28");
  const antes = comoVa(inv);
  inv.ambientes[0].items[0].estado = "malo";
  inv.ambientes[0].items[0].detalle = "Con hongos";
  inv.ambientes[0].items[1].estado = "no_tiene";
  const ahora = comoVa(inv);
  assert.equal(ahora.conDetalle, 1);
  assert.equal(ahora.sinUsar, 1);
  assert.equal(ahora.items, antes.items - 1, "lo que no tiene no cuenta");
});

test("los estados son pocos a propósito: son 165 filas", () => {
  assert.ok(ESTADOS.length <= 5, "con más opciones hay que pensar en cada fila");
  assert.ok(TIPOS_DE_AMBIENTE.length >= 8);
});

/* ---------- Lo vacío no existe ---------- */

/* Juan: "si borro algo o dejo algo vacío que entienda que ahí no se tiene que poner nada y se
   ajuste". Pasa todo el tiempo: tocás "agregar algo", te distraés, y queda una fila en
   blanco. En la pantalla se ve y se entiende; impresa en el documento que se firma es un
   renglón vacío que nadie sabe qué quiso decir. */

test("una cosa sin nombre no cuenta ni se imprime", () => {
  assert.equal(cuenta({ nombre: "", estado: "bien" }), false);
  assert.equal(cuenta({ nombre: "   ", estado: "bien" }), false);
  assert.equal(cuenta({ nombre: "Paredes", estado: "bien" }), true);
  assert.equal(comoSeLee({ nombre: "", estado: "bien" }), "");
});

test("las filas en blanco no llegan al documento", () => {
  const inv = nuevoInventario("2026-08-28");
  inv.ambientes = [nuevoAmbiente("cochera")];
  inv.ambientes[0].items.push(nuevoItem(""));
  inv.ambientes[0].items.push(nuevoItem("   "));
  const [amb] = loQueSeImprime(inv);
  assert.equal(amb.items.length, nuevoAmbiente("cochera").items.length);
});

/* UN AMBIENTE ENTERO VACIO TAMPOCO: un título solo, sin nada abajo, se lee como un error. */
test("un ambiente sin nada adentro no se imprime", () => {
  const inv = nuevoInventario("2026-08-28");
  inv.ambientes = [nuevoAmbiente("living"), nuevoAmbiente("vacio", "Altillo")];
  assert.deepEqual(loQueSeImprime(inv).map((a) => a.nombre), ["Living comedor"]);
});

test("un ambiente sin nombre tampoco, por más cosas que tenga", () => {
  const inv = nuevoInventario("2026-08-28");
  inv.ambientes = [nuevoAmbiente("cocina", "  ")];
  assert.deepEqual(loQueSeImprime(inv), []);
});

/* ---------- Los ambientes que pidió después ---------- */

test("hay cochera y depósito, y se pueden escribir a mano", () => {
  const claves = TIPOS_DE_AMBIENTE.map((t) => t.clave);
  for (const debe of ["cochera", "deposito", "balcon", "azotea", "vacio"]) {
    assert.ok(claves.includes(debe), `falta ${debe}`);
  }
  const mia = nuevoAmbiente("vacio", "Cuarto de máquinas");
  assert.equal(mia.nombre, "Cuarto de máquinas");
});

test("una cochera trae lo poco que hay que mirar en una cochera", () => {
  const nombres = nuevoAmbiente("cochera").items.map((i) => i.nombre);
  assert.ok(nombres.includes("Portón"));
  assert.ok(nombres.length < 8, "en un garaje no hay veinte cosas que mirar");
});
