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
test("los papeles de Catastro apuntan a donde tienen que apuntar", () => {
  const papeles = papelesDeCatastro("62295");
  assert.deepEqual(papeles.map((p) => p.clave), ["cedula", "parcela", "territorial", "visor"]);
  assert.match(papeles[0].url, /apwebimpresioncedulasgeocatastro\?C,V,AA,62295,,,$/);
  assert.match(papeles[1].url, /arwebmvdeocomunpublico\?62295,N$/);
  assert.equal(papeles.filter((p) => p.pdf).length, 2, "dos bajan PDF directo");
});

/* Una casa es propiedad comun (C); un apartamento es propiedad horizontal (H) y necesita
   la unidad. Con la direccion equivocada Catastro devuelve la cedula de otra cosa. */
test("un apartamento pide la cedula de propiedad horizontal, con su unidad", () => {
  const conApto = papelesDeCatastro("422399", { apartamento: "202", bloque: "B" });
  assert.match(conApto[0].url, /\?H,V,AA,422399,B,,202$/);
  const sinBloque = papelesDeCatastro("422399", { apartamento: "202" });
  assert.match(sinBloque[0].url, /\?H,V,AA,422399,,,202$/);
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
