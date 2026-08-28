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
  cuenta, loQueSeImprime, PIDEN_DETALLE,
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
  assert.equal(dice("excelente"), "Excelente estado – sin detalles");
  assert.equal(dice("bien"), "Buen estado – sin detalles");
  assert.equal(dice("detalles"), "Buen estado – con detalles");
  assert.equal(dice("viejo"), "Viejo, pero funciona bien");
  assert.equal(dice("sin_mant"), "Sin mantenimiento");
  assert.equal(dice("roto"), "Roto / no funciona");
});

/* "ROTO" ES LA QUE MAS IMPORTA de todas. "Viejo" y "sin mantenimiento" dicen que algo está
   gastado, no que no anda. Si al entrar el toldo tiene el mecanismo roto y eso no queda
   escrito con todas las letras, el día que el inquilino se va se lo cobran a Juan. En su
   propio inventario tuvo que escribirlo a mano: "Con hongos, mecanismo roto". */
test("«roto» dice que no funciona, no que está gastado", () => {
  assert.match(comoSeLee({ nombre: "Toldos", estado: "roto" }), /no funciona/);
  assert.doesNotMatch(comoSeLee({ nombre: "Duchero", estado: "viejo" }), /no funciona/);
});

/* LOS INVENTARIOS YA GUARDADOS NO SE QUEDAN MUDOS. "perfecto" y "malo" existieron antes de
   que Juan eligiera estas palabras, y alguno puede estar en el teléfono. */
test("el vocabulario viejo se sigue entendiendo", () => {
  assert.equal(comoSeLee({ nombre: "Paredes", estado: "perfecto" }),
    "Excelente estado – sin detalles");
  assert.equal(comoSeLee({ nombre: "Toldos", estado: "malo" }), "Roto / no funciona");
  assert.equal(comoSeLee({ nombre: "Piso", estado: "un estado que no existe" }),
    "Buen estado – sin detalles", "lo desconocido cae en el default, no en el vacío");
});

/* LOS QUE PIDEN EXPLICAR QUE TIENEN. Un "con detalles" o un "roto" sin decir cuál es el
   detalle no sirve de nada el día que hay que discutir un depósito. */
test("los estados que no se explican solos piden el detalle", () => {
  for (const clave of ["detalles", "viejo", "sin_mant", "roto"]) {
    assert.ok(PIDEN_DETALLE.has(clave), clave);
  }
  assert.ok(!PIDEN_DETALLE.has("bien"), "el default no tiene nada que explicar");
  assert.ok(!PIDEN_DETALLE.has("excelente"));
});

test("el detalle se suma al estado", () => {
  assert.equal(comoSeLee({ nombre: "Placar", estado: "detalles", detalle: "una rajadura interior en uno" }),
    "Buen estado – con detalles · una rajadura interior en uno");
});

/* "CON PROBLEMAS" SIN EXPLICAR QUE PROBLEMA no sirve de nada el día que hay que discutir un
   depósito. El detalle es lo único que se lee. */
test("el detalle se suma al estado, no lo reemplaza", () => {
  assert.equal(
    comoSeLee({ nombre: "Toldos", estado: "roto", detalle: "Con hongos, mecanismo roto" }),
    "Roto / no funciona · Con hongos, mecanismo roto");
  assert.equal(comoSeLee({ nombre: "Toldos", estado: "roto", detalle: "" }),
    "Roto / no funciona", "el estado ya dice algo por sí solo");
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

/* UNO NUEVO ARRANCA VACIO. Lo pidió Juan después de verlo andando: "que no haya nada agregado
   y que aparezcan como de entrada agregar un ambiente". Cada propiedad tiene los ambientes que
   tiene, y arrancar con cinco puestos obliga a mirar cinco tarjetas para descubrir cuáles
   sacar: sumar lo que hay es una decisión por ambiente, sacar lo que sobra es revisar todo. */
test("uno nuevo arranca vacío", () => {
  const inv = nuevoInventario("2026-08-28");
  assert.equal(inv.fecha, "2026-08-28");
  assert.deepEqual(inv.ambientes, []);
  assert.equal(comoVa(inv).items, 0);
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
  inv.ambientes = [nuevoAmbiente("living")];
  const antes = comoVa(inv);
  inv.ambientes[0].items[0].estado = "malo";
  inv.ambientes[0].items[0].detalle = "Con hongos";
  inv.ambientes[0].items[1].estado = "no_tiene";
  const ahora = comoVa(inv);
  assert.equal(ahora.conDetalle, 1);
  assert.equal(ahora.sinUsar, 1);
  assert.equal(ahora.items, antes.items - 1, "lo que no tiene no cuenta");
});

/* EL ORDEN IMPORTA: de mejor a peor. Un desplegable desordenado obliga a leerlo entero cada
   vez, y son 165 veces. "No tiene" va al final porque no es un estado: es la forma de sacar
   del documento algo que la plantilla trae y esta propiedad no tiene. */
test("los estados van de mejor a peor, y «no tiene» al final", () => {
  assert.deepEqual(ESTADOS.map((e) => e.clave),
    ["excelente", "bien", "detalles", "viejo", "sin_mant", "roto", "no_tiene"]);
  assert.equal(POR_DEFECTO, "bien", "arranca en buen estado: es lo que pasa en tres de cada cuatro");
});

test("los estados son pocos a propósito: son 165 filas", () => {
  assert.ok(ESTADOS.length <= 8, "con más opciones hay que pensar en cada fila");
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

/* ---------- Se puede escribir en cualquier estado ---------- */

/* Juan: "capaz que el estado es bueno y tiene una rayita y quiero escribir eso". El renglón
   para escribir está siempre a un toque, en los siete estados. */
test("se puede escribir aunque el estado sea bueno", () => {
  assert.equal(
    comoSeLee({ nombre: "Puerta", estado: "bien", detalle: "tiene una rayita abajo" }),
    "Buen estado · tiene una rayita abajo");
});

/* SI HAY ALGO ESCRITO, EL ESTADO NO PUEDE DECIR "SIN DETALLES". Quedaba "Buen estado – sin
   detalles · tiene una rayita abajo", que se contradice solo en un documento que se firma. */
test("con algo escrito, el estado deja de decir «sin detalles»", () => {
  for (const clave of ["bien", "excelente"]) {
    const con = comoSeLee({ nombre: "Puerta", estado: clave, detalle: "una rayita" });
    assert.ok(!con.includes("sin detalles"), `${clave}: ${con}`);
    assert.ok(con.includes("una rayita"));
  }
});

test("sin nada escrito sigue diciendo «sin detalles», que es lo que él escribe", () => {
  assert.equal(comoSeLee({ nombre: "Puerta", estado: "bien" }), "Buen estado – sin detalles");
  assert.equal(comoSeLee({ nombre: "Puerta", estado: "excelente" }),
    "Excelente estado – sin detalles");
});
