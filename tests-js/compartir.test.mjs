import { test } from "node:test";
import assert from "node:assert/strict";
import { comoWhatsApp, comoAppDeWhatsApp } from "../lib/compartir.js";

/* `wa.me` es una PAGINA. Adentro del navegador que WhatsApp trae incorporado se queda ahi
   mismo mostrando "Continuar al chat", que no lleva a ningun lado — fue el primer reporte
   de Juan. `whatsapp://` no es una pagina: es una orden para el sistema, y saca al usuario
   de esa ventanita. Por eso son dos cosas distintas y las dos tienen que existir. */
test("la direccion para la web y la que abre la aplicacion son distintas", () => {
  assert.match(comoWhatsApp("hola", "59899123456"), /^https:\/\/wa\.me\/59899123456\?text=hola$/);
  assert.match(comoAppDeWhatsApp("hola", "59899123456"), /^whatsapp:\/\/send\?phone=59899123456&text=hola$/);
});

test("sin telefono se manda igual, y WhatsApp pregunta a quien", () => {
  assert.equal(comoWhatsApp("hola"), "https://wa.me/?text=hola");
  assert.equal(comoAppDeWhatsApp("hola"), "whatsapp://send?text=hola");
});

test("el telefono se limpia de todo lo que no sea numero", () => {
  for (const escrito of ["+598 99 123 456", "(598) 99-123-456", "598 99 123 456"]) {
    assert.match(comoAppDeWhatsApp("x", escrito), /phone=59899123456&/, escrito);
    assert.match(comoWhatsApp("x", escrito), /wa\.me\/59899123456\?/, escrito);
  }
});

/* El enlace de la carta lleva `#`, `+`, `/` y `=`. Si no se escapan, WhatsApp corta el
   mensaje en el primer caracter raro y del otro lado llega una carta partida. */
test("el texto viaja escapado entero", () => {
  const enlace = "https://x.uy/firmar.html#a+b/c=d&e ñ";
  for (const armar of [comoWhatsApp, comoAppDeWhatsApp]) {
    const url = armar(`Te paso la carta.\n\n${enlace}`, "59899123456");
    assert.ok(!url.includes("#a+b"), `quedo sin escapar: ${url}`);
    assert.ok(url.includes("%23"), "el numeral tiene que ir escapado");
    assert.equal(decodeURIComponent(url.split("text=")[1]), `Te paso la carta.\n\n${enlace}`);
  }
});
