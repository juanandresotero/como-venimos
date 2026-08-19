import { test } from "node:test";
import assert from "node:assert/strict";
import { derivar, GRUPOS, accionesDe, juntarRepetidos, bandeja, cuantosPendientes }
  from "../lib/pendientes.js";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

function negocio(avisos, x = {}) {
  return {
    id: "excel-1", direccion: "Calle 100", barrio: "Cerrito",
    fecha_fin: "2026-04-20", tipo_negocio: "venta",
    avisos: avisos.map((tipo) => ({ tipo, detalle: `detalle de ${tipo}` })),
    ...x,
  };
}

test("agrupa los avisos por tipo", () => {
  const grupos = derivar([negocio(["falta_fecha_inicio"]), negocio(["falta_fecha_inicio"])], [], "2026-08-17");
  const grupo = grupos.find((g) => g.clave === "falta_fecha_inicio");
  assert.equal(grupo.items.length, 2);
});

test("cada grupo tiene un nombre en castellano", () => {
  const grupos = derivar([negocio(["firma_inventada"])], [], "2026-08-17");
  assert.equal(grupos[0].nombre, GRUPOS.firma_inventada.nombre);
  assert.ok(grupos[0].nombre.length > 5);
});

test("lo urgente va primero", () => {
  const lista = [negocio(["falta_barrio"]), negocio(["firma_inventada"])];
  const grupos = derivar(lista, [], "2026-08-17");
  assert.equal(grupos[0].clave, "firma_inventada");
});

test("los grupos urgentes quedan marcados", () => {
  const grupos = derivar([negocio(["firma_inventada"]), negocio(["falta_barrio"])], [], "2026-08-17");
  assert.equal(grupos.find((g) => g.clave === "firma_inventada").urgente, true);
  assert.equal(grupos.find((g) => g.clave === "falta_barrio").urgente, false);
});

test("cada item sabe a que negocio pertenece y como mostrarlo", () => {
  const grupos = derivar([negocio(["falta_barrio"], { id: "excel-84", direccion: "Grecia 3491" })], [], "2026-08-17");
  const item = grupos[0].items[0];
  assert.equal(item.negocio_id, "excel-84");
  assert.ok(item.titulo.includes("Grecia 3491"));
  assert.ok(item.detalle.length > 0);
});

test("un negocio sin direccion se muestra igual", () => {
  const grupos = derivar([negocio(["falta_direccion"], { direccion: null })], [], "2026-08-17");
  assert.ok(grupos[0].items[0].titulo.length > 0);
});

test("los eventos de la cartera sin atender tambien entran", () => {
  const eventos = [
    { id: "e1", tipo: "baja", titulo: "Casa linda", direccion: "Calle 1", fecha: "2026-08-17",
      atendido: false, detalle: { desenlace_propuesto: "vendida" } },
  ];
  const grupos = derivar([], eventos, "2026-08-17");
  assert.equal(grupos.find((g) => g.clave === "baja").items.length, 1);
});

test("los eventos ya atendidos no aparecen", () => {
  const eventos = [{ id: "e1", tipo: "baja", titulo: "X", fecha: "2026-08-17", atendido: true, detalle: {} }];
  assert.equal(derivar([], eventos, "2026-08-17").length, 0);
});

test("una baja de propiedad reservada es urgente: puede ser una venta", () => {
  const eventos = [
    { id: "e1", tipo: "baja", titulo: "X", fecha: "2026-08-17", atendido: false,
      detalle: { desenlace_propuesto: "vendida" } },
  ];
  assert.equal(derivar([], eventos, "2026-08-17")[0].urgente, true);
});

test("los cambios de precio no son urgentes, son informativos", () => {
  const eventos = [
    { id: "e1", tipo: "cambio_precio", titulo: "X", fecha: "2026-08-17", atendido: false,
      detalle: { antes: 100, ahora: 90, moneda: "USD" } },
  ];
  assert.equal(derivar([], eventos, "2026-08-17")[0].urgente, false);
});

test("sin nada pendiente devuelve lista vacia", () => {
  assert.deepEqual(derivar([negocio([])], [], "2026-08-17"), []);
});

test("una ficha dada por completa no aporta pendientes", () => {
  const lista = [negocio(["falta_fecha_inicio"], { ficha_completa: true })];
  assert.deepEqual(derivar(lista, [], "2026-08-17"), []);
});

test("cuenta el total de pendientes", () => {
  const grupos = derivar([negocio(["falta_barrio", "falta_direccion"])], [], "2026-08-17");
  const total = grupos.reduce((t, g) => t + g.items.length, 0);
  assert.equal(total, 2);
});

/* Se creo un duplicado sobre Flammarion sin que nadie se diera cuenta: el boton de la
   ficha de propiedad decia "cargar un negocio de aca" y creaba uno nuevo siempre. */
test("avisa cuando quedan dos negocios abiertos sobre la misma propiedad", () => {
  const grupos = derivar([
    { id: "a", entity_id_cartera: "flam", estado: "en_curso", direccion: "Flammarión 5000", avisos: [] },
    { id: "b", entity_id_cartera: "flam", estado: "en_curso", direccion: "Flammarión 5000", avisos: [] },
  ], [], "2026-08-17");
  const duplicados = grupos.find((g) => g.clave === "negocio_duplicado");
  assert.ok(duplicados, "tiene que avisar");
  assert.equal(duplicados.items.length, 2, "los dos aparecen, para poder elegir cual borrar");
  assert.ok(duplicados.urgente);
});

/* Un alquiler que rota genera muchos negocios sobre la misma propiedad, pero se van
   cerrando. Dos CERRADOS no son un duplicado. */
test("varios negocios ya cerrados sobre la misma propiedad no son un duplicado", () => {
  const grupos = derivar([
    { id: "a", entity_id_cartera: "flam", estado: "cerrado", ficha_completa: true, avisos: [] },
    { id: "b", entity_id_cartera: "flam", estado: "cerrado", ficha_completa: true, avisos: [] },
    { id: "c", entity_id_cartera: "flam", estado: "en_curso", avisos: [] },
  ], [], "2026-08-17");
  assert.equal(grupos.find((g) => g.clave === "negocio_duplicado"), undefined);
});

test("dos negocios abiertos SIN propiedad no se toman por duplicados", () => {
  const grupos = derivar([
    { id: "a", entity_id_cartera: null, estado: "en_curso", avisos: [] },
    { id: "b", entity_id_cartera: null, estado: "en_curso", avisos: [] },
  ], [], "2026-08-17");
  assert.equal(grupos.find((g) => g.clave === "negocio_duplicado"), undefined);
});

/* ---------- El precio al que se esta negociando ---------- */

const enNegociacion = (x = {}) => ({
  entity_id: "p1", direccion: "Gutenberg 6100", activa: true,
  estado: "en_negociacion", precio: 240000, fecha_negociacion: "2026-07-01", ...x,
});

/* El robot ve el precio PUBLICADO, y una oferta aceptada casi nunca es por ese numero.
   Mientras no se cargue, lo que esta mas cerca de entrar se proyecta sobre un precio que
   ya no existe. */
test("una propiedad en negociacion sin precio cargado pide el precio", () => {
  const grupos = derivar([], [], "2026-08-18", { p1: enNegociacion() });
  const grupo = grupos.find((g) => g.clave === "falta_precio_negociacion");
  assert.ok(grupo, "tendria que pedirlo");
  assert.equal(grupo.items[0].entity_id, "p1");
  assert.match(grupo.items[0].detalle, /240\.000/);
  assert.ok(grupo.urgente, "es plata que esta por entrar, no tramite");
});

test("cargado el precio, deja de pedirlo", () => {
  const grupos = derivar([], [], "2026-08-18",
    { p1: enNegociacion({ precio_negociacion: 225000 }) });
  assert.ok(!grupos.some((g) => g.clave === "falta_precio_negociacion"));
});

test("solo se pide para las que estan EN negociacion y siguen activas", () => {
  const cartera = {
    a: enNegociacion({ entity_id: "a", estado: "publicada" }),
    b: enNegociacion({ entity_id: "b", estado: "reservada" }),
    c: enNegociacion({ entity_id: "c", activa: false }),
  };
  const grupos = derivar([], [], "2026-08-18", cartera);
  assert.ok(!grupos.some((g) => g.clave === "falta_precio_negociacion"));
});

test("sin cartera no explota", () => {
  assert.doesNotThrow(() => derivar([], [], "2026-08-18"));
  assert.doesNotThrow(() => derivar([], [], "2026-08-18", null));
});

/* El bug: la pantalla elegia el boton con un if/else de tres ramas y preguntaba por
   `evento_id` antes que por `entity_id`. Como un aviso del robot trae los dos, esos
   avisos ofrecian solo "Ya lo resolvi" y no habia forma de abrir la propiedad. */
test("un aviso del robot deja arreglar la propiedad Y darlo por visto", () => {
  const acciones = accionesDe({ eventos: ["2026-08-19|abc|cambio_estado"], entity_id: "abc" });
  assert.deepEqual(acciones.map((a) => a.tipo), ["propiedad", "atendido"]);
  assert.equal(acciones[0].destino, "abc");
  assert.deepEqual(acciones[1].destino, ["2026-08-19|abc|cambio_estado"]);
});

test("lo que resuelve va primero; descartar el aviso no arregla nada", () => {
  const acciones = accionesDe({ eventos: ["e1"], entity_id: "abc" });
  assert.equal(acciones[0].tipo, "propiedad");
});

test("cada clase de pendiente ofrece lo suyo", () => {
  assert.deepEqual(accionesDe({ negocio_id: "manual-2" }).map((a) => a.tipo), ["ficha"]);
  assert.deepEqual(accionesDe({ entity_id: "abc" }).map((a) => a.tipo), ["propiedad"]);
  assert.deepEqual(accionesDe({ eventos: ["e1"] }).map((a) => a.tipo), ["atendido"]);
  assert.deepEqual(accionesDe({ eventos: [] }), []);
  assert.deepEqual(accionesDe({}), []);
});

/* Que los avisos del robot SIGAN trayendo las dos llaves: si un dia alguien saca
   `entity_id` de `derivar`, el boton de arreglar desaparece sin que nada falle. */
test("derivar le pone las dos llaves a los avisos del robot", () => {
  const eventos = [{ id: "e1", entity_id: "abc", tipo: "cambio_estado", fecha: "2026-08-19",
    direccion: "San Jose 1200", detalle: { antes: "en_negociacion", ahora: "reservada" } }];
  const grupo = derivar([], eventos, "2026-08-19", {}).find((g) => g.clave === "cambio_estado");
  assert.equal(grupo.items[0].entity_id, "abc");
  assert.equal(accionesDe(grupo.items[0]).length, 2);
});

/* Juntar los pendientes repetidos de una misma propiedad. Nace de un caso real: una
   propiedad caia en "Sin fecha de firma" y en "Sin fecha de boleto", se veia dos veces,
   y nada decia que las dos llevaban a la MISMA pantalla. */
function grupo(clave, items) {
  const c = GRUPOS[clave];
  return { clave, nombre: c.nombre, orden: c.orden, urgente: c.urgente, items };
}

test("una propiedad repetida en dos grupos queda en uno solo", () => {
  const juntos = juntarRepetidos([
    grupo("sin_fecha_fin", [{ negocio_id: "m2", titulo: "Calle 6", detalle: "falta la firma" }]),
    grupo("falta_fecha_boleto", [{ negocio_id: "m2", titulo: "Calle 6", detalle: "falta el boleto" }]),
  ]);
  assert.equal(juntos.length, 1, "el segundo grupo queda vacio y se va");
  assert.equal(juntos[0].clave, "sin_fecha_fin", "sobrevive en el grupo mas urgente");
  assert.deepEqual(juntos[0].items[0].mas, ["falta la firma", "falta el boleto"]);
});

test("el que sobrevive es el del grupo MAS urgente, sin importar el orden de entrada", () => {
  const juntos = juntarRepetidos([
    grupo("falta_precio_negociacion", [{ entity_id: "p1", titulo: "Minas 1600", detalle: "a" }]),
    grupo("cambio_estado", [{ entity_id: "p1", titulo: "Minas 1600", detalle: "b", eventos: ["e9"] }]),
  ]);
  assert.equal(juntos[0].clave, "falta_precio_negociacion");
});

test("al juntar, 'Ya lo resolvi' despacha TODOS los avisos que quedaron adentro", () => {
  const juntos = juntarRepetidos([
    grupo("cambio_precio", [{ entity_id: "p1", titulo: "X", detalle: "a", eventos: ["e1"] }]),
    grupo("cambio_estado", [{ entity_id: "p1", titulo: "X", detalle: "b", eventos: ["e2"] }]),
  ]);
  const atender = accionesDe(juntos[0].items[0]).find((a) => a.tipo === "atendido");
  assert.deepEqual(atender.destino, ["e1", "e2"], "si se pierde uno, el aviso vuelve manana");
});

test("propiedades distintas NO se juntan", () => {
  const juntos = juntarRepetidos([
    grupo("falta_precio_negociacion", [
      { entity_id: "p1", titulo: "A", detalle: "a" },
      { entity_id: "p2", titulo: "B", detalle: "b" },
    ]),
  ]);
  assert.equal(juntos[0].items.length, 2);
  assert.equal(juntos[0].items[0].mas, undefined, "sin repetir no se arma la lista");
});

test("un pendiente sin sujeto no rompe ni se junta con nada", () => {
  const juntos = juntarRepetidos([grupo("alta", [{ titulo: "suelto", detalle: "x" }])]);
  assert.equal(juntos[0].items.length, 1);
});

test("sin grupos devuelve vacio", () => {
  assert.deepEqual(juntarRepetidos([]), []);
});

/* El globito rojo del menu y el "Atencion N" del titulo contaban lo mismo por caminos
   separados. Al juntar los repetidos, uno dijo 3 y el otro siguio diciendo 4. */
test("la bandeja junta los repetidos, y la cuenta sale de ella", () => {
  const negocios = [{
    id: "m2", direccion: "Calle 6", fecha_fin: null, tipo_negocio: "venta",
    avisos: [{ tipo: "sin_fecha_fin", detalle: "falta firma" },
             { tipo: "falta_fecha_boleto", detalle: "falta boleto" }],
  }];
  assert.equal(cuantosPendientes(derivar(negocios, [], "2026-08-19", {})), 2, "dos problemas");
  assert.equal(cuantosPendientes(bandeja(negocios, [], "2026-08-19", {})), 1, "una sola visita");
});

/* Que nadie vuelva a contar por su cuenta: si una pantalla llama a `derivar` directo,
   se saltea la junta y su numero se separa del de las demas. */
test("ninguna pantalla llama a derivar por su cuenta", () => {
  const raiz = fileURLToPath(new URL("..", import.meta.url));
  const archivos = [join(raiz, "app.js"), ...readdirSync(join(raiz, "vistas"))
    .filter((f) => f.endsWith(".js")).map((f) => join(raiz, "vistas", f))];
  /* Mira el IMPORT y no la llamada: `derivar` es tambien el nombre de un parametro
     local en vistas/ficha.js, que no tiene nada que ver con esto. */
  const trae = /import\s*\{[^}]*\bderivar\b[^}]*\}\s*from\s*["'][^"']*pendientes\.js["']/;
  const culpables = archivos.filter((a) => trae.test(readFileSync(a, "utf-8")));
  assert.deepEqual(culpables.map((a) => a.split(/[\\/]/).pop()), [],
    "usar bandeja(), que ademas junta los repetidos");
});
