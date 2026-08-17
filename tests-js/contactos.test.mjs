import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizarTelefono, enlaceWhatsapp, hayPicker, elegirContacto } from "../lib/contactos.js";

test("un celular uruguayo pierde el cero y gana el codigo de pais", () => {
  assert.equal(normalizarTelefono("099 123 456"), "59899123456");
  assert.equal(normalizarTelefono("099123456"), "59899123456");
});

test("un celular ya escrito sin el cero tambien cierra", () => {
  assert.equal(normalizarTelefono("99123456"), "59899123456");
});

test("un numero internacional se respeta tal cual", () => {
  assert.equal(normalizarTelefono("+598 99 123 456"), "59899123456");
  assert.equal(normalizarTelefono("+54 9 11 5555 4444"), "5491155554444");
});

test("un fijo de Montevideo tambien sirve", () => {
  assert.equal(normalizarTelefono("2400 1234"), "59824001234");
});

test("lo que no parece un telefono no se inventa", () => {
  assert.equal(normalizarTelefono(""), null);
  assert.equal(normalizarTelefono(null), null);
  assert.equal(normalizarTelefono("123"), null);
  assert.equal(normalizarTelefono("sin telefono"), null);
});

test("el enlace de WhatsApp lleva el numero limpio", () => {
  assert.equal(enlaceWhatsapp("099 123 456"), "https://wa.me/59899123456");
});

test("el mensaje precargado va escapado", () => {
  const url = enlaceWhatsapp("099123456", "Hola Ana, ¿cómo va?");
  assert.match(url, /^https:\/\/wa\.me\/59899123456\?text=/);
  assert.ok(!url.includes(" "));
});

test("sin telefono no hay enlace, en vez de un link roto", () => {
  assert.equal(enlaceWhatsapp(""), null);
});

test("se detecta si el telefono tiene agenda disponible", () => {
  assert.equal(hayPicker({}), false);
  assert.equal(hayPicker({ contacts: {} }), false);
  assert.equal(hayPicker({ contacts: { select: () => {} } }), true);
});

test("elegir un contacto devuelve nombre y telefono", async () => {
  const navegador = {
    contacts: { select: async () => [{ name: ["Ana Pérez"], tel: ["099123456"] }] },
  };
  assert.deepEqual(await elegirContacto(navegador), {
    nombre: "Ana Pérez",
    telefono: "099123456",
  });
});

test("si se cancela la agenda no se rompe nada", async () => {
  assert.equal(await elegirContacto({ contacts: { select: async () => [] } }), null);
  assert.equal(await elegirContacto({ contacts: { select: async () => { throw new Error("no"); } } }), null);
  assert.equal(await elegirContacto({}), null);
});
