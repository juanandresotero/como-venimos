import { test } from "node:test";
import assert from "node:assert/strict";
import { derivar, GRUPOS } from "../lib/pendientes.js";

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
