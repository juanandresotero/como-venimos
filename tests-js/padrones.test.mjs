import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  normalizar, grupoDe, buscar, sugerir, papelesDeCatastro, DEPARTAMENTO_CUBIERTO,
} from "../lib/padrones.js";

const RAIZ = fileURLToPath(new URL("..", import.meta.url));

test("normalizar deja las calles comparables", () => {
  assert.equal(normalizar("Dr. Pantaleón Pérez"), "DR PANTALEON PEREZ");
  assert.equal(normalizar("  maroñas  "), "MARONAS");
  assert.equal(normalizar("Av.  Gral.   Rivera"), "AV GRAL RIVERA");
});

/* LA CUENTA TIENE QUE DAR IGUAL QUE EN robot/padrones.py. Si se separan, la app pide el
   archivo equivocado y no encuentra nunca nada — sin error, sin aviso, solo "no está".
   Estos numeros salieron de correr la version de Python. */
test("el reparto en archivos da lo mismo que en el robot", () => {
  assert.equal(grupoDe("PANTALEON PEREZ"), "27");
  assert.equal(grupoDe("Dr. Pantaleón Pérez"), "11");
  assert.equal(grupoDe("FERMIN FERREIRA"), "02");
  assert.equal(grupoDe("AV GRAL RIVERA"), "06");
  assert.equal(grupoDe("MAROÑAS"), "03");
  assert.equal(grupoDe("18 DE JULIO"), "45");
});

test("el grupo siempre son dos digitos, del 00 al 47", () => {
  for (const calle of ["A", "ZZZZ", "18 DE JULIO", "SAN JOSE", "1", ""]) {
    const g = grupoDe(calle);
    assert.match(g, /^\d{2}$/, calle);
    assert.ok(Number(g) >= 0 && Number(g) < 48, calle);
  }
});

/* Un padron equivocado identifica OTRA propiedad en un documento que obliga. */
test("fuera de Montevideo no adivina: lo dice", async () => {
  const r = await buscar({ calle: "Calle 6", numero: 100, departamento: "Canelones" });
  assert.equal(r.estado, "fuera-de-montevideo");
  assert.equal(r.departamento, "Canelones");
});

test("Montevideo escrito de cualquier forma se reconoce", async () => {
  for (const d of ["Montevideo", "MONTEVIDEO", "montevideo"]) {
    const r = await buscar({ calle: "", numero: 1, departamento: d });
    assert.notEqual(r.estado, "fuera-de-montevideo", d);
  }
});

test("sin calle no busca nada", async () => {
  assert.equal((await buscar({ calle: "", numero: 100 })).estado, "calle-desconocida");
});

test("sugerir encuentra por el principio y tambien por el medio", () => {
  const calles = ["AV GRAL RIVERA", "RIVERA CHICO", "DR PANTALEON PEREZ", "PEREZ CASTELLANOS"];
  assert.deepEqual(sugerir(calles, "rivera"), ["RIVERA CHICO", "AV GRAL RIVERA"]);
  assert.deepEqual(sugerir(calles, "perez"), ["PEREZ CASTELLANOS", "DR PANTALEON PEREZ"]);
  assert.deepEqual(sugerir(calles, "x"), [], "con una sola letra no sugiere nada");
});

/* Estas direcciones no estan documentadas: salieron de leer el javascript del propio
   visor de Catastro, y estan probadas contra el servidor — devuelven un PDF de verdad.
   Si alguien las toca sin volver a probarlas, el usuario manda enlaces rotos. */
test("los papeles de una casa apuntan a donde tienen que apuntar", () => {
  const papeles = papelesDeCatastro("62295");
  assert.deepEqual(papeles.map((p) => p.clave), ["cedula", "parcela", "territorial", "visor"]);
  assert.equal(papeles.filter((p) => p.pdf).length, 2, "dos bajan PDF directo");
});

test("el departamento cubierto es Montevideo, y esta dicho en un solo lugar", () => {
  assert.equal(DEPARTAMENTO_CUBIERTO, "Montevideo");
});

/* ---------- contra el indice de verdad, si ya esta generado ---------- */

const CARPETA = join(RAIZ, "datos", "padrones");
const hayIndice = existsSync(join(CARPETA, "calles.json"));
/* En Node, fetch no lee file://. Los tests leen del disco. */
const delDisco = (grupo) => JSON.parse(readFileSync(join(CARPETA, `${grupo}.json`), "utf-8"));

test("el indice generado tiene las calles y los grupos que dice", { skip: !hayIndice }, () => {
  const calles = JSON.parse(readFileSync(join(CARPETA, "calles.json"), "utf-8"));
  assert.ok(calles.length > 4000, `solo ${calles.length} calles`);
  /* Cada calle tiene que estar en el archivo que dice su grupo. Si esto falla, el
     reparto de Python y el de JS se separaron. */
  const cache = new Map();
  for (const calle of calles.slice(0, 400)) {
    const g = grupoDe(calle);
    if (!cache.has(g)) cache.set(g, JSON.parse(readFileSync(join(CARPETA, `${g}.json`), "utf-8")));
    assert.ok(normalizar(calle) in cache.get(g), `${calle} no esta en ${g}.json`);
  }
});

/* El caso que decide si todo esto sirve: el padron que el usuario escribio a mano en una
   carta oferta de verdad. */
test("Pantaleon Perez 4782 da el padron 62295", { skip: !hayIndice }, async () => {
  const r = await buscar({ calle: "Dr. Pantaleón Pérez", numero: 4782, departamento: "Montevideo" },
    { leer: delDisco });
  assert.equal(r.estado, "encontrado");
  assert.equal(r.padron, "62295");
});

test("un numero que no existe ofrece los de al lado", { skip: !hayIndice }, async () => {
  const r = await buscar({ calle: "Dr. Pantaleón Pérez", numero: 999999, departamento: "Montevideo" },
    { leer: delDisco });
  assert.equal(r.estado, "sin-numero-exacto");
  assert.ok(r.cercanos.length > 0, "tiene que ofrecer alternativas");
  assert.ok(r.cercanos.every((c) => c.padron), "cada uno con su padron");
});

/* Catastro separa la dirección CON COMAS. Una coma escrita en la unidad la partía en ocho
   pedazos en vez de siete, y Catastro devolvía otro documento o un error. */
test("lo que se escribe en unidad y bloque no puede romper la dirección", () => {
  for (const [unidad, bloque] of [
    ["202,X", ""], ["", "B,999"], ["202 ", " B"], ["2/3", ""], ["ñ&=?", ""], ["a?b=c", "x&y"],
  ]) {
    for (const papel of papelesDeCatastro("422399", { apartamento: "1", unidad, bloque })) {
      if (!papel.url.includes("catastro.gub.uy:8443")) continue;
      const cola = papel.url.split("?")[1];
      assert.equal(cola.split(",").length, 7,
        `"${unidad}" / "${bloque}" dejó la dirección en ${cola}`);
      assert.doesNotMatch(cola, /[\s&=?/]/, `quedaron caracteres de URL en ${cola}`);
    }
  }
});

/* Todo lo de acá abajo está PROBADO contra el servidor de Catastro, no deducido. Si algún
   día cambia, se prueba de nuevo con curl antes de tocar estos valores. */
const urlDe = (padron, opciones, clave) =>
  (papelesDeCatastro(padron, opciones).find((p) => p.clave === clave) || {}).url;

test("una casa pide la cédula de propiedad común", () => {
  assert.match(urlDe("62295", {}, "cedula"), /apwebimpresioncedulasgeocatastro\?C,V,AA,62295,,,$/);
  assert.match(urlDe("62295", {}, "parcela"), /arwebmvdeocomunpublico\?62295,N$/);
});

/* La "unidad" de Catastro NO es el número de apartamento: para el padrón 82447 la unidad 1
   devuelve la cédula y la 202 devuelve un archivo vacío. Inventarla entrega el papel de
   OTRA unidad sin avisar, así que sin unidad NO se ofrece cédula. */
test("un apartamento sin unidad conocida no ofrece cédula, pero sí los datos de la parcela", () => {
  const papeles = papelesDeCatastro("84290", { apartamento: "202" });
  assert.equal(papeles.find((p) => p.clave === "cedula"), undefined,
    "no puede inventar la unidad");
  assert.match(urlDe("84290", { apartamento: "202" }, "parcela"),
    /arwebphmvdeopublico\?V,AA,84290,,,,N$/);
});

test("con la unidad puesta a mano sí sale la cédula de propiedad horizontal", () => {
  assert.match(urlDe("84290", { apartamento: "202", unidad: "1" }, "cedula"),
    /apwebimpresioncedulasgeocatastro\?H,V,AA,84290,,,1$/);
  assert.match(urlDe("84290", { apartamento: "202", unidad: "0001", bloque: "B" }, "cedula"),
    /apwebimpresioncedulasgeocatastro\?H,V,AA,84290,B,,0001$/);
});

/* Los dos que se aprendieron a los golpes: la app va por https y el navegador planta una
   pantalla de peligro antes de abrir un http en puerto 8080; y el visor no tiene https. */
test("los papeles de Catastro van por https, y el visor por http porque no tiene otra", () => {
  for (const opciones of [{}, { apartamento: "202" }, { apartamento: "202", unidad: "1" }]) {
    for (const papel of papelesDeCatastro("84290", opciones)) {
      if (papel.clave === "visor") {
        assert.equal(papel.url, "http://visor.catastro.gub.uy/visordnc/");
      } else {
        assert.match(papel.url, /^https:/, `${papel.clave} tiene que ir por https`);
      }
    }
  }
});

test("siempre están los datos territoriales de la Intendencia y el visor", () => {
  for (const opciones of [{}, { apartamento: "202" }, { apartamento: "202", unidad: "1" }]) {
    const claves = papelesDeCatastro("84290", opciones).map((p) => p.clave);
    assert.ok(claves.includes("territorial"), "faltan los datos de la Intendencia");
    assert.ok(claves.includes("visor"), "falta el visor, que es lo único que da croquis y planos");
    assert.ok(claves.includes("parcela"), "los datos de la parcela salen siempre");
  }
});
