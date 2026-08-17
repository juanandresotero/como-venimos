import { test } from "node:test";
import assert from "node:assert/strict";
import {
  aBase64, deBase64, urlContenido, leerArchivo, escribirArchivo, probarToken, REPO,
} from "../lib/github.js";

test("base64 de ida y vuelta con acentos", () => {
  const texto = '{"barrio":"Maroñas","nota":"él dijo «sí»"}';
  assert.equal(deBase64(aBase64(texto)), texto);
});

test("base64 aguanta emojis", () => {
  const texto = "cerrado ✅ 🏠";
  assert.equal(deBase64(aBase64(texto)), texto);
});

test("base64 de texto vacio", () => {
  assert.equal(deBase64(aBase64("")), "");
});

test("el base64 no lleva saltos de linea", () => {
  const largo = JSON.stringify({ x: "a".repeat(500) });
  assert.ok(!aBase64(largo).includes("\n"));
});

test("la url apunta al repo correcto", () => {
  assert.equal(urlContenido("datos/negocios.json"),
    `https://api.github.com/repos/${REPO}/contents/datos/negocios.json`);
});

test("el repo es el del usuario", () => {
  assert.equal(REPO, "juanandresotero/como-venimos");
});

/* Un fetch de mentira: se le dice que responder y despues se revisa como lo llamaron. */
function fingirFetch(respuestas) {
  const llamadas = [];
  globalThis.fetch = async (url, opciones = {}) => {
    llamadas.push({ url, opciones });
    const r = respuestas.shift();
    if (!r) throw new Error("no quedan respuestas preparadas");
    return {
      ok: r.estado >= 200 && r.estado < 300,
      status: r.estado,
      json: async () => r.cuerpo,
    };
  };
  return llamadas;
}

test("leerArchivo devuelve el contenido y el sha", async () => {
  fingirFetch([{ estado: 200, cuerpo: { content: aBase64('{"a":1}'), sha: "abc123" } }]);
  const r = await leerArchivo("datos/negocios.json", "tok");
  assert.deepEqual(r.datos, { a: 1 });
  assert.equal(r.sha, "abc123");
});

test("leerArchivo manda el token", async () => {
  const llamadas = fingirFetch([{ estado: 200, cuerpo: { content: aBase64("{}"), sha: "s" } }]);
  await leerArchivo("datos/x.json", "mi-token");
  assert.equal(llamadas[0].opciones.headers.Authorization, "Bearer mi-token");
});

test("leerArchivo devuelve sha null si el archivo no existe", async () => {
  fingirFetch([{ estado: 404, cuerpo: { message: "Not Found" } }]);
  const r = await leerArchivo("datos/nuevo.json", "tok");
  assert.equal(r.sha, null);
  assert.equal(r.datos, null);
});

test("escribirArchivo manda PUT con el contenido y el sha", async () => {
  const llamadas = fingirFetch([{ estado: 200, cuerpo: { content: { sha: "nuevo" } } }]);
  const r = await escribirArchivo("datos/negocios.json", { a: 1 }, "viejo", "mensaje", "tok");
  const cuerpo = JSON.parse(llamadas[0].opciones.body);
  assert.equal(llamadas[0].opciones.method, "PUT");
  assert.equal(cuerpo.sha, "viejo");
  assert.equal(cuerpo.message, "mensaje");
  assert.deepEqual(JSON.parse(deBase64(cuerpo.content)), { a: 1 });
  assert.equal(r.sha, "nuevo");
});

test("escribirArchivo omite el sha si el archivo es nuevo", async () => {
  const llamadas = fingirFetch([{ estado: 201, cuerpo: { content: { sha: "s" } } }]);
  await escribirArchivo("datos/nuevo.json", {}, null, "crear", "tok");
  assert.ok(!("sha" in JSON.parse(llamadas[0].opciones.body)));
});

test("escribirArchivo avisa claro cuando hay conflicto", async () => {
  fingirFetch([{ estado: 409, cuerpo: { message: "conflict" } }]);
  await assert.rejects(
    () => escribirArchivo("datos/x.json", {}, "viejo", "m", "tok"),
    /conflicto/i
  );
});

test("escribirArchivo avisa claro cuando el token no sirve", async () => {
  fingirFetch([{ estado: 401, cuerpo: { message: "Bad credentials" } }]);
  await assert.rejects(() => escribirArchivo("datos/x.json", {}, null, "m", "tok"), /token/i);
});

test("probarToken dice que si cuando puede escribir", async () => {
  fingirFetch([{ estado: 200, cuerpo: { full_name: REPO, permissions: { push: true } } }]);
  const r = await probarToken("tok");
  assert.equal(r.ok, true);
});

test("probarToken dice que no si el token solo lee", async () => {
  fingirFetch([{ estado: 200, cuerpo: { full_name: REPO, permissions: { push: false } } }]);
  const r = await probarToken("tok");
  assert.equal(r.ok, false);
  assert.match(r.mensaje, /escribir/i);
});

test("probarToken explica si el token esta mal", async () => {
  fingirFetch([{ estado: 401, cuerpo: { message: "Bad credentials" } }]);
  const r = await probarToken("malo");
  assert.equal(r.ok, false);
  assert.match(r.mensaje, /token/i);
});
