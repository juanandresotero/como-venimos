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

test("una baja es urgente: hay que decidir que paso", () => {
  const eventos = [
    { id: "e1", tipo: "baja", titulo: "X", fecha: "2026-08-17", atendido: false,
      detalle: { antes: 100, ahora: 90, moneda: "USD" } },
  ];
  assert.equal(derivar([], eventos, "2026-08-17")[0].urgente, true);
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

/* Este test pedia lo contrario hasta el 2026-08-19: exigia que una RESERVADA no lo
   pidiera. Estaba mal y tapaba el agujero — ver "una reservada sin precio de cierre"
   mas abajo. Se cambio a proposito. */
test("no se pide ni antes de negociar ni cuando ya se fue de la cartera", () => {
  const cartera = {
    a: enNegociacion({ entity_id: "a", estado: "publicada" }),
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
  const eventos = [{ id: "e1", entity_id: "abc", tipo: "baja", fecha: "2026-08-19",
    direccion: "San Jose 1200", detalle: {} }];
  const grupo = derivar([], eventos, "2026-08-19", {}).find((g) => g.clave === "baja");
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
    grupo("falta_barrio", [{ entity_id: "p1", titulo: "Minas 1600", detalle: "b", eventos: ["e9"] }]),
  ]);
  assert.equal(juntos[0].clave, "falta_precio_negociacion");
});

test("al juntar, 'Ya lo resolvi' despacha TODOS los avisos que quedaron adentro", () => {
  const juntos = juntarRepetidos([
    grupo("baja", [{ entity_id: "p1", titulo: "X", detalle: "a", eventos: ["e1"] }]),
    grupo("falta_barrio", [{ entity_id: "p1", titulo: "X", detalle: "b", eventos: ["e2"] }]),
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

/* Una propiedad podia pasar de negociacion a RESERVADA sin que se le hubiera cargado
   nunca a que precio se cierra, y ahi la app dejaba de pedirlo Y la pantalla dejaba de
   ofrecerlo: quedaba proyectando sobre el precio publicado justo en lo que esta mas
   cerca de cobrarse. Paso de verdad con San Fructuoso 1200. */
test("una reservada sin precio de cierre sigue pidiendo el dato", () => {
  const cartera = {
    p1: { entity_id: "p1", activa: true, estado: "reservada", direccion: "San Fructuoso 1200",
      precio: 89900, fecha_reservada: "2026-08-14" },
  };
  const grupo = derivar([], [], "2026-08-19", cartera)
    .find((g) => g.clave === "falta_precio_negociacion");
  assert.ok(grupo, "una reservada sin precio tiene que aparecer en la bandeja");
  assert.match(grupo.items[0].detalle, /Está reservada desde el 2026-08-14/);
  assert.match(grupo.items[0].detalle, /89\.900/);
});

test("la que esta en negociacion lo sigue pidiendo igual que antes", () => {
  const cartera = {
    p1: { entity_id: "p1", activa: true, estado: "en_negociacion", direccion: "Minas 1600",
      precio: 165000, fecha_negociacion: "2026-08-17" },
  };
  const grupo = derivar([], [], "2026-08-19", cartera)
    .find((g) => g.clave === "falta_precio_negociacion");
  assert.match(grupo.items[0].detalle, /Está en negociación desde el 2026-08-17/);
});

test("con el precio cargado deja de molestar, este como este", () => {
  for (const estado of ["en_negociacion", "reservada"]) {
    const cartera = { p1: { entity_id: "p1", activa: true, estado, precio: 90000,
      precio_negociacion: 85000 } };
    assert.equal(derivar([], [], "2026-08-19", cartera)
      .find((g) => g.clave === "falta_precio_negociacion"), undefined, estado);
  }
});

test("una publicada NO lo pide: todavia no hay nada que negociar", () => {
  const cartera = { p1: { entity_id: "p1", activa: true, estado: "publicada", precio: 90000 } };
  assert.equal(derivar([], [], "2026-08-19", cartera)
    .find((g) => g.clave === "falta_precio_negociacion"), undefined);
});

/* El que PIDE el dato y la pantalla que lo OFRECE tienen que usar la misma regla. Si se
   separan, la app pide un dato que no se puede cargar — que es exactamente el agujero
   que se esta tapando. */
test("la pantalla ofrece el campo en los mismos estados en que la bandeja lo pide", () => {
  const raiz = fileURLToPath(new URL("..", import.meta.url));
  const pantalla = readFileSync(join(raiz, "vistas", "propiedad.js"), "utf-8");
  assert.match(pantalla, /PRECIO_NEGOCIADO_VISIBLE\.has\(p\.estado\)/,
    "propiedad.js tiene que usar la misma constante, no su propia lista");
});

/* Una busqueda es un negocio del lado del comprador, sobre una propiedad que NO es tuya.
   La app no puede saber sola si se cerro, y le pedia "Sin fecha de firma" — sobre algo que
   nadie firmo todavia. */
test("una busqueda abierta aparece como busqueda, no como fecha faltante", () => {
  const negocios = [{
    id: "manual-2", direccion: "Calle 6 esquina 5", tipo_negocio: "venta", estado: "en_curso",
    entity_id_cartera: null, fecha_fin: null, fecha_boleto: null,
    avisos: [{ tipo: "busqueda_en_curso", detalle: "Estás del lado del comprador y está abierta." }],
  }];
  const grupos = derivar(negocios, [], "2026-08-19", {});
  assert.ok(grupos.find((g) => g.clave === "busqueda_en_curso"), "tiene que aparecer");
  assert.equal(grupos.find((g) => g.clave === "sin_fecha_fin"), undefined,
    "nadie firmo todavia: pedir la fecha de firma es pedir un dato que no existe");
  assert.equal(GRUPOS.busqueda_en_curso.urgente, false, "no es un error, es un recordatorio");
});

/* Jose Batlle y Ordoñes 2500 seguia pidiendo el origen con "Ref. Martin" ya cargado. */
test("un aviso que pide el origen se calla cuando el origen ya esta", () => {
  const evento = { id: "e1", entity_id: "p1", tipo: "alta", fecha: "2026-08-19",
    direccion: "José Batlle y Ordóñez 2500", detalle: {} };

  const sinOrigen = { p1: { entity_id: "p1", activa: true, estado: "publicada" } };
  assert.ok(derivar([], [evento], "2026-08-19", sinOrigen).find((g) => g.clave === "alta"),
    "sin origen SI tiene que pedirlo");

  const conOrigen = { p1: { entity_id: "p1", activa: true, estado: "publicada",
    origen_captacion: "Ref. Martin" } };
  assert.equal(derivar([], [evento], "2026-08-19", conOrigen).find((g) => g.clave === "alta"),
    undefined, "con el origen cargado no puede seguir pidiendolo");
});

/* LO QUE ES SOLO PARA MIRAR NO VA A LA BANDEJA. Lo pidio Juan: "que no me avise si hay
   cambios de precio, estado o reapariciones si es solo para chequeo". El robot los sigue
   detectando y quedan en el historial de la propiedad — pero la bandeja es lo que hay que
   HACER, y esos no piden nada.

   Lo que si llega es lo que esos cambios DESTAPAN: si pasa a negociacion aparece "falta a
   que precio", si vuelve al mercado el negocio se da por caido. El cambio en si no hace
   falta contarlo dos veces. */
test("los cambios de precio, estado y reaparicion no van a la bandeja", () => {
  const cartera = { p1: { entity_id: "p1", activa: true, origen_captacion: "Ref. Martin" } };
  for (const tipo of ["cambio_precio", "cambio_estado", "reaparecio"]) {
    const evento = { id: "e1", entity_id: "p1", tipo, fecha: "2026-08-19", detalle: {} };
    assert.deepEqual(derivar([], [evento], "2026-08-19", cartera), [],
      `${tipo} es para mirar, no para hacer`);
  }
});

/* Pero una BAJA si: pide decidir que paso con esa propiedad. */
test("una baja sigue yendo a la bandeja: hay que decidir", () => {
  const evento = { id: "e1", entity_id: "p1", tipo: "baja", fecha: "2026-08-19", detalle: {} };
  const cartera = { p1: { entity_id: "p1", activa: false, origen_captacion: "Ref. Martin" } };
  assert.ok(derivar([], [evento], "2026-08-19", cartera).find((g) => g.clave === "baja"));
});

/* Va arriba y en rojo porque es plata mal contada, no trabajo administrativo: un negocio con
   dos puntas cuando es una proyecta el doble de lo que va a entrar. */
test("confirmar las puntas es urgente y va antes que los datos que faltan", () => {
  const bandeja = derivar([
    { id: "a", estado: "en_curso", direccion: "Rivera 100",
      avisos: [{ tipo: "revisar_puntas", detalle: "Está contando LAS DOS PUNTAS." }] },
    { id: "b", estado: "en_curso", direccion: "Otra 200",
      avisos: [{ tipo: "falta_barrio", detalle: "Falta el barrio" }] },
  ], [], "2026-08-20", {});

  const puntas = bandeja.find((g) => g.clave === "revisar_puntas");
  assert.ok(puntas, "el grupo tiene que existir en la bandeja");
  assert.equal(puntas.urgente, true);
  assert.equal(puntas.items.length, 1);
  const barrio = bandeja.find((g) => g.clave === "falta_barrio");
  assert.ok(puntas.orden < barrio.orden, "las puntas van antes que el barrio");
});

/* "Ficha completa" quiere decir "ya cargué todo lo que se puede cargar hoy", y las puntas no
   faltan: están puestas con un valor por defecto que puede duplicar la ganancia sin que se
   note. El día que se agregó el aviso, CUATRO de los seis negocios en curso de Juan estaban
   dados por completos con dos puntas puestas solas. Si respetara la marca, no veía ninguno. */
test("confirmar las puntas se pide aunque la ficha esté dada por completa", () => {
  const bandeja = derivar([
    { id: "a", estado: "en_curso", direccion: "Rivera 100", ficha_completa: true,
      avisos: [
        { tipo: "revisar_puntas", detalle: "Está contando LAS DOS PUNTAS." },
        { tipo: "falta_barrio", detalle: "Falta el barrio" },
      ] },
  ], [], "2026-08-20", {});

  assert.ok(bandeja.find((g) => g.clave === "revisar_puntas"),
    "las puntas se piden igual");
  assert.ok(!bandeja.find((g) => g.clave === "falta_barrio"),
    "pero el resto sigue callado: la marca vale para lo que de verdad falta");
});
