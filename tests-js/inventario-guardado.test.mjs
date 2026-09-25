import { test } from "node:test";
import assert from "node:assert/strict";
import {
  sanear, leer, lista, papelera, guardar, borrar, recuperar, borrarDeVerdad, buscar,
} from "../lib/inventario-guardado.js";

/* El teléfono de mentira: el módulo acepta el almacén por parámetro justo para esto. */
function almacenFalso(crudo = null) {
  const caja = new Map();
  if (crudo !== null) caja.set("como-venimos:inventarios", JSON.stringify(crudo));
  return {
    getItem: (k) => (caja.has(k) ? caja.get(k) : null),
    setItem: (k, v) => caja.set(k, String(v)),
  };
}

const unInventario = (extra = {}) => ({
  id: "inv-1",
  fecha: "2026-08-28",
  direccion: "Leyenda Patria 2914",
  unidad: "1001",
  barrio: "Punta Carretas",
  observaciones: "El toldo del living hay que repararlo.",
  firmas_arrendador: 3,
  firmas_arrendatario: 3,
  clausulas: ["La parte inquilina recibe la unidad.", "Son {HOJAS} hojas."],
  ambientes: [
    { id: "a1", tipo: "cocina", nombre: "Cocina", items: [
      { id: "i1", nombre: "Heladera", estado: "bien", detalle: "", cantidad: 1 },
      { id: "i2", nombre: "Mesada", estado: "detalles", detalle: "una rayita", cantidad: 1 },
    ] },
  ],
  ...extra,
});

/* ---------- Lo primero: que un inventario ya hecho no se pierda ---------- */

/* Juan lo dijo antes de pedir cualquier cosa: "no se puede borrar el inventario que está hecho
   porque es de un cliente y no lo puedo volver a hacer... asegurémonos que no se pierda y que
   pueda seguir siendo editable". Esta prueba es esa frase. */
test("un inventario guardado vuelve completo, con sus cláusulas y sus cosas", () => {
  const almacen = almacenFalso();
  guardar(unInventario(), almacen);
  const vuelto = buscar("inv-1", almacen);
  assert.equal(vuelto.direccion, "Leyenda Patria 2914");
  assert.equal(vuelto.unidad, "1001");
  assert.equal(vuelto.observaciones, "El toldo del living hay que repararlo.");
  assert.equal(vuelto.firmas_arrendador, 3);
  assert.deepEqual(vuelto.clausulas,
    ["La parte inquilina recibe la unidad.", "Son {HOJAS} hojas."]);
  assert.equal(vuelto.ambientes[0].items[1].detalle, "una rayita");
});

/* UNO GUARDADO ANTES DE QUE EXISTIERA LA PAPELERA. Es el caso de verdad: el inventario que
   Juan ya tiene hecho no trae ese campo, y tiene que seguir apareciendo igual. */
test("un inventario viejo, sin el campo nuevo, sigue en la lista y entero", () => {
  const viejo = unInventario();
  delete viejo.papelera;
  const almacen = almacenFalso([viejo]);
  assert.equal(lista(almacen).length, 1);
  assert.equal(lista(almacen)[0].direccion, "Leyenda Patria 2914");
  assert.equal(papelera(almacen).length, 0);
});

test("la basura que pueda haber quedado en el teléfono no se lleva lo bueno", () => {
  const almacen = almacenFalso([null, unInventario(), "no soy un inventario", 7]);
  assert.equal(lista(almacen).length, 1);
});

/* ---------- La papelera ---------- */

/* BORRAR NO PIERDE: va a la papelera y se puede traer de vuelta. Un inventario firmado no se
   puede volver a hacer, y el botón de borrar está a un toque del de subir al Drive. */
test("borrar lo saca de la lista pero lo deja en la papelera", () => {
  const almacen = almacenFalso();
  guardar(unInventario(), almacen);
  borrar("inv-1", "2026-09-25", almacen);
  assert.equal(lista(almacen).length, 0);
  assert.equal(papelera(almacen).length, 1);
  assert.equal(papelera(almacen)[0].papelera, "2026-09-25");
});

test("y recuperarlo lo devuelve entero", () => {
  const almacen = almacenFalso();
  guardar(unInventario(), almacen);
  borrar("inv-1", "2026-09-25", almacen);
  recuperar("inv-1", almacen);
  const vuelto = lista(almacen)[0];
  assert.equal(vuelto.papelera, "");
  assert.equal(vuelto.direccion, "Leyenda Patria 2914");
  assert.equal(vuelto.ambientes[0].items.length, 2);
});

/* EL RIESGO DE VERDAD: `guardar` reescribe la lista entera. Si al guardar el inventario
   siguiente se perdiera el de la papelera, la papelera no serviría para nada. */
test("guardar otro inventario no se lleva el de la papelera", () => {
  const almacen = almacenFalso();
  guardar(unInventario(), almacen);
  borrar("inv-1", "2026-09-25", almacen);
  guardar(unInventario({ id: "inv-2", direccion: "Humaitá 2750" }), almacen);
  assert.equal(lista(almacen).length, 1);
  assert.equal(lista(almacen)[0].id, "inv-2");
  assert.equal(papelera(almacen).length, 1, "el borrado sigue ahí");
});

test("vaciar la papelera sí lo borra de verdad", () => {
  const almacen = almacenFalso();
  guardar(unInventario(), almacen);
  borrar("inv-1", "2026-09-25", almacen);
  borrarDeVerdad("inv-1", almacen);
  assert.equal(leer(almacen).length, 0);
  assert.equal(buscar("inv-1", almacen), null);
});

test("sanear no inventa una papelera donde no hay", () => {
  assert.equal(sanear(unInventario()).papelera, "");
});
