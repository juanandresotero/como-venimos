import { test } from "node:test";
import assert from "node:assert/strict";
import {
  leerFirmaPropia, guardarFirmaPropia, olvidarFirmaPropia,
  leerBorrador, guardarBorrador, borrarBorrador,
  leerPadron, guardarPadron, leerHistorial,
} from "../lib/carta-guardado.js";

/* Un localStorage de mentira, como el que usan los otros tests del proyecto. */
function almacen(inicial = {}) {
  const datos = { ...inicial };
  return {
    getItem: (k) => (k in datos ? datos[k] : null),
    setItem: (k, v) => { datos[k] = String(v); },
    removeItem: (k) => { delete datos[k]; },
    _datos: datos,
  };
}

test("la firma del usuario se carga una vez y vuelve identica", () => {
  const a = almacen();
  const bytes = Uint8Array.from([2, 1, 44, 0, 123, 255, 0, 17]);
  guardarFirmaPropia(bytes, "2026-08-19", a);
  const vuelta = leerFirmaPropia(a);
  assert.deepEqual([...vuelta.bytes], [...bytes]);
  assert.equal(vuelta.cuando, "2026-08-19");
});

test("sin firma guardada devuelve null, no una firma vacia", () => {
  assert.equal(leerFirmaPropia(almacen()), null);
});

test("se puede olvidar la firma", () => {
  const a = almacen();
  guardarFirmaPropia(Uint8Array.from([1, 2, 3]), null, a);
  olvidarFirmaPropia(a);
  assert.equal(leerFirmaPropia(a), null);
});

test("el borrador guarda casillas, quitadas y firmas", () => {
  const a = almacen();
  guardarBorrador({
    valores: { nombre: "Juan Pérez", precio: 134000 },
    quitadas: ["correo"],
    firmas: { oferente: Uint8Array.from([1, 1, 5, 0, 10, 0, 20]) },
  }, "2026-08-19", a);
  const vuelta = leerBorrador(a);
  assert.deepEqual(vuelta.valores, { nombre: "Juan Pérez", precio: 134000 });
  assert.deepEqual(vuelta.quitadas, ["correo"]);
  assert.deepEqual([...vuelta.firmas.oferente], [1, 1, 5, 0, 10, 0, 20]);
});

test("una firma vacia no se guarda: seria una firma que no existe", () => {
  const a = almacen();
  guardarBorrador({ valores: {}, quitadas: [], firmas: { oferente: new Uint8Array() } }, null, a);
  assert.deepEqual(leerBorrador(a).firmas, {});
});

test("el borrador se puede tirar", () => {
  const a = almacen();
  guardarBorrador({ valores: { nombre: "X" } }, null, a);
  borrarBorrador(a);
  assert.equal(leerBorrador(a), null);
});

/* El padron no se puede averiguar solo, asi que al menos no se tipea dos veces. */
test("el padron se recuerda por propiedad", () => {
  const a = almacen();
  guardarPadron("abc-123", "62295", a);
  guardarPadron("def-456", "10101", a);
  assert.equal(leerPadron("abc-123", a), "62295");
  assert.equal(leerPadron("def-456", a), "10101");
  assert.equal(leerPadron("no-existe", a), null);
  assert.equal(leerPadron(null, a), null);
});

test("borrar el padron lo saca, no guarda una cadena vacia", () => {
  const a = almacen();
  guardarPadron("abc", "62295", a);
  guardarPadron("abc", "   ", a);
  assert.equal(leerPadron("abc", a), null);
});

test("basura guardada no rompe la app", () => {
  const roto = almacen({
    "como-venimos:carta-firma": "{no es json",
    "como-venimos:carta-borrador": "[]]",
    "como-venimos:carta-padrones": "???",
  });
  assert.equal(leerFirmaPropia(roto), null);
  assert.equal(leerBorrador(roto), null);
  assert.equal(leerPadron("abc", roto), null);
});

test("sin lugar donde guardar, la app sigue andando", () => {
  const lleno = {
    getItem: () => null,
    setItem: () => { throw new Error("QuotaExceededError"); },
    removeItem: () => {},
  };
  assert.doesNotThrow(() => guardarFirmaPropia(Uint8Array.from([1]), null, lleno));
  assert.doesNotThrow(() => guardarBorrador({ valores: {} }, null, lleno));
  assert.doesNotThrow(() => guardarPadron("abc", "1", lleno));
});

/* Lo guardado en el teléfono NUNCA puede tumbar la app. Pasó: un `null` suelto en el
   historial y la pantalla de la carta oferta no dibujaba nada — "Cannot read properties
   of null". Una escritura a medias o una versión vieja alcanzan para dejar eso. */
const BASURA = [
  '[{"id":1},{"nope":true},null]',
  '[null,null]',
  '"ni siquiera es una lista"',
  '{"no":"es una lista"}',
  '[[1,2,3]]',
];

test("un historial con basura no rompe: devuelve lo que se pueda", () => {
  for (const crudo of BASURA) {
    const a = almacen({ "como-venimos:carta-historial": crudo });
    assert.doesNotThrow(() => leerHistorial(a), crudo);
    for (const c of leerHistorial(a)) {
      assert.equal(typeof c.id, "string", crudo);
      assert.ok(Array.isArray(c.quitadas), crudo);
      assert.equal(typeof c.valores, "object", crudo);
    }
  }
});

test("un borrador con la forma equivocada no rompe", () => {
  for (const crudo of [
    '{"valores":null,"quitadas":"no es lista","firmas":123}',
    '{"valores":[1,2],"quitadas":[1,null,"telefono"],"firmas":"x"}',
    '"un texto suelto"', '[1,2,3]', 'null',
  ]) {
    const a = almacen({ "como-venimos:carta-borrador": crudo });
    let b;
    assert.doesNotThrow(() => { b = leerBorrador(a); }, crudo);
    if (b) {
      assert.ok(Array.isArray(b.quitadas), `quitadas tiene que ser lista: ${crudo}`);
      assert.ok(b.quitadas.every((q) => typeof q === "string"), `basura adentro: ${crudo}`);
      assert.equal(typeof b.valores, "object", crudo);
      assert.equal(typeof b.firmas, "object", crudo);
    }
  }
});

test("una firma guardada con la forma equivocada no rompe", () => {
  for (const crudo of ['{"bytes":"no es lista"}', '[1,2]', '"texto"', '{"bytes":null}']) {
    const a = almacen({ "como-venimos:carta-firma": crudo });
    assert.doesNotThrow(() => leerFirmaPropia(a), crudo);
    assert.equal(leerFirmaPropia(a), null, crudo);
  }
});

test("los padrones guardados con basura no rompen", () => {
  for (const crudo of ['[1,2]', '"texto"', '{"abc":{"no":"es texto"}}']) {
    const a = almacen({ "como-venimos:carta-padrones": crudo });
    assert.doesNotThrow(() => leerPadron("abc", a), crudo);
    assert.equal(leerPadron("abc", a), null, crudo);
  }
});
