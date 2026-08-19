import { test } from "node:test";
import assert from "node:assert/strict";
import { comoVieneLlenando } from "../vistas/carta-mirada.js";

const carta = (valores = {}, quitadas = []) => ({ valores, quitadas, firmas: {} });

/* Lo que Juan quiere ver de un vistazo: qué le falta a cada parte. */
test("separa lo que puso cada parte de lo que le falta", () => {
  const c = carta({ nombre: "Rosanna Pérez", cedula: "4.255.360-3", telefono: "099 611 051" });
  const { puestos, faltan } = comoVieneLlenando(c, "comprador");
  assert.deepEqual(puestos, ["Nombre", "Documento de identidad", "Teléfono"]);
  assert.deepEqual(faltan, ["Correo electrónico"]);
});

test("cada parte ve solo lo suyo", () => {
  const c = carta({ nombre: "Rosanna", propietario_nombre: "Juan Carlos" });
  assert.deepEqual(comoVieneLlenando(c, "comprador").puestos, ["Nombre"]);
  assert.deepEqual(comoVieneLlenando(c, "propietario").puestos, ["Nombre del propietario"]);
});

/* Una casilla quitada no está en la carta: no puede "faltar". Si contara, el aviso pediría
   para siempre algo que se sacó a propósito. */
test("lo que se quitó de la carta no cuenta como que falta", () => {
  const c = carta({ nombre: "Rosanna" }, ["telefono", "correo", "cedula"]);
  const { puestos, faltan } = comoVieneLlenando(c, "comprador");
  assert.deepEqual(puestos, ["Nombre"]);
  assert.deepEqual(faltan, []);
});

test("un dato en blanco o con espacios cuenta como que falta", () => {
  for (const vacio of ["", "   ", null, undefined]) {
    const { faltan } = comoVieneLlenando(carta({ nombre: vacio, cedula: "1", telefono: "2", correo: "3" }), "comprador");
    assert.deepEqual(faltan, ["Nombre"], JSON.stringify(vacio));
  }
});

test("un cero es un dato puesto, no un vacío", () => {
  const { puestos } = comoVieneLlenando(carta({ sena: 0, precio: 134000 }), "usuario");
  assert.ok(puestos.includes("Seña simbólica (U$S)"), "un cero es un valor");
});

test("una carta rota no rompe la ventanita", () => {
  for (const rota of [{}, { valores: null, quitadas: null }, { valores: [], quitadas: "x" }]) {
    assert.doesNotThrow(() => comoVieneLlenando(rota, "comprador"));
  }
});
