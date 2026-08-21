/* El link de una publicación de RE/MAX.

   Juan: "agregale que pueda directamente poner el link de la propiedad para que le haga
   seguimiento y no tengo que buscar el match". */

import { test } from "node:test";
import assert from "node:assert/strict";
import { slugDelEnlace, enlaceDelSlug } from "../lib/enlace-remax.js";

const SLUG = "venta-apto-1-dormitorio-con-cochera-la-blanqueda";

test("el link tal cual sale de RE/MAX", () => {
  assert.equal(slugDelEnlace(`https://www.remax.com.uy/listings/${SLUG}`), SLUG);
});

/* Se pega como venga: nadie va a limpiar un link antes de pegarlo. */
test("se acepta pegado como venga", () => {
  for (const texto of [
    `http://www.remax.com.uy/listings/${SLUG}`,
    `remax.com.uy/listings/${SLUG}`,
    `https://remax.com.uy/listings/${SLUG}/`,
    `  https://www.remax.com.uy/listings/${SLUG}  `,
    `https://www.remax.com.uy/listings/${SLUG}?utm_source=whatsapp&x=1`,
    `https://www.remax.com.uy/listings/${SLUG}#fotos`,
    `https://www.remax.com.uy/listings/${SLUG}/fotos`,
    SLUG,
    SLUG.toUpperCase(),
  ]) {
    assert.equal(slugDelEnlace(texto), SLUG, texto);
  }
});

/* Un link de otro portal o una frase suelta tienen que devolver null, NO un slug inventado:
   con un slug inventado el robot iría a buscar una propiedad que no existe y todos los días
   le diría que no la encuentra. */
test("lo que no es un link de RE/MAX no devuelve nada", () => {
  for (const texto of [
    "", null, undefined, "   ",
    "https://www.mercadolibre.com.uy/algo-en-venta",
    "https://www.infocasas.com.uy/venta-apto-la-blanqueada",
    "Flammarión 5046",
    "no me acuerdo del link",
    "https://www.remax.com.uy/agentes/martin-sedes",
  ]) {
    assert.equal(slugDelEnlace(texto), null, JSON.stringify(texto));
  }
});

/* Una sola palabra no es un slug: los de RE/MAX siempre llevan guiones. Sin esto, escribir
   "hola" en el campo del link pasaría por una publicación. */
test("una palabra suelta no es un slug", () => {
  assert.equal(slugDelEnlace("hola"), null);
  assert.equal(slugDelEnlace("propiedad"), null);
});

test("el link se puede volver a armar para poder abrirlo", () => {
  assert.equal(enlaceDelSlug(SLUG), `https://www.remax.com.uy/listings/${SLUG}`);
  assert.equal(enlaceDelSlug(null), null);
});
