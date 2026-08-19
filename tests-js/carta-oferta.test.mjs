import { test } from "node:test";
import assert from "node:assert/strict";
import { CAMPOS, PLANTILLA, DEPARTAMENTOS, armar, comoTexto } from "../lib/carta-oferta.js";

const porClave = Object.fromEntries(CAMPOS.map((c) => [c.clave, c]));

test("estan las dieciseis casillas del documento", () => {
  assert.deepEqual(CAMPOS.map((c) => c.clave), [
    "nombre", "cedula", "telefono", "correo",
    "padron", "calle", "barrio", "departamento",
    "precio", "dias_reserva", "dias_validez", "fecha_oferta",
    "propietario_nombre", "propietario_cedula", "propietario_domicilio", "fecha_aceptacion",
  ]);
});

/* Quitar el precio o un plazo deja una carta que no obliga a nada. */
test("solo se puede quitar lo que la frase sobrevive sin ello", () => {
  assert.deepEqual(CAMPOS.filter((c) => c.quitable).map((c) => c.clave),
    ["telefono", "correo", "padron", "barrio", "departamento", "propietario_domicilio"]);
});

test("cada casilla dice quien la llena", () => {
  assert.equal(porClave.nombre.quien, "comprador");
  assert.equal(porClave.precio.quien, "usuario");
  assert.equal(porClave.propietario_nombre.quien, "propietario");
});

test("cada casilla dice de que largo es su rayita", () => {
  for (const campo of CAMPOS) assert.ok(campo.rayita >= 4, `${campo.clave} sin rayita`);
});

test("el departamento se elige de los diecinueve, no se tipea", () => {
  assert.equal(DEPARTAMENTOS.length, 19);
  assert.ok(DEPARTAMENTOS.includes("Canelones"));
  assert.ok(DEPARTAMENTOS.includes("Montevideo"));
  assert.equal(porClave.departamento.opciones, DEPARTAMENTOS);
});

/* Las palabras que enganchan una casilla con la frase VIAJAN CON ELLA. Es lo que hace
   posible el tercer estado: al quitar la casilla se va tambien su enganche. */
test("toda pieza es texto suelto o una casilla con su enganche", () => {
  const claves = new Set(CAMPOS.map((c) => c.clave));
  for (const bloque of PLANTILLA) {
    for (const pieza of bloque.piezas || []) {
      if (pieza.texto !== undefined) continue;
      assert.ok(claves.has(pieza.campo), `pieza con campo desconocido: ${pieza.campo}`);
      assert.equal(typeof pieza.antes, "string", `${pieza.campo} sin 'antes'`);
    }
  }
});

test("la plantilla nombra cada casilla exactamente una vez", () => {
  const usadas = PLANTILLA.flatMap((b) => b.piezas || []).filter((p) => p.campo).map((p) => p.campo);
  assert.deepEqual([...usadas].sort(), CAMPOS.map((c) => c.clave).sort());
});

test("el documento tiene dos hojas y tres lugares para firmar", () => {
  assert.equal(PLANTILLA.filter((b) => b.tipo === "salto-de-hoja").length, 1);
  const firmas = PLANTILLA.filter((b) => b.tipo === "firmas").flatMap((b) => b.firmas);
  assert.deepEqual(firmas.map((f) => f.clave), ["oferente", "depositario", "propietario"]);
});

// ---------------------------------------------------------------- armar()

const BASE = {
  nombre: "Juan Pérez", cedula: "1.234.567-8", telefono: "099123456",
  correo: "juan@mail.com", padron: "62295", calle: "Pantaleón Pérez 4782",
  barrio: "Maroñas", departamento: "Montevideo", precio: 134000,
  dias_reserva: 15, dias_validez: 5, fecha_oferta: "2026-08-19",
};

function frase(bloques, pedazo) {
  const p = bloques.filter((b) => b.tipo === "parrafo")
    .find((b) => b.partes.map((x) => x.texto).join("").includes(pedazo));
  return p ? p.partes.map((x) => x.texto).join("") : "";
}

test("una casilla llena sale escrita adentro de la frase", () => {
  assert.match(frase(armar(BASE, []), "empadronado"),
    /empadronado con el número 62295 ubicado en la calle Pantaleón Pérez 4782, Maroñas, Montevideo, en la República/);
});

test("una casilla vacia deja la rayita para completar a mano", () => {
  assert.match(frase(armar({ ...BASE, padron: null }, []), "empadronado"),
    /empadronado con el número _+ ubicado/);
});

/* El tercer estado, que es el que pidio el usuario y el que puede romper la prosa. */
test("una casilla quitada se lleva su enganche y la frase se cierra sola", () => {
  const texto = frase(armar(BASE, ["barrio"]), "empadronado");
  assert.match(texto, /calle Pantaleón Pérez 4782, Montevideo, en la República Oriental/);
  assert.doesNotMatch(texto, /Maroñas/);
});

test("quitar barrio y departamento deja la calle pegada al pais, sin basura", () => {
  const texto = frase(armar(BASE, ["barrio", "departamento"]), "empadronado");
  assert.match(texto, /calle Pantaleón Pérez 4782, en la República Oriental del Uruguay\./);
});

test("quitar no deja espacios dobles, comas huerfanas ni puntos sueltos", () => {
  const combinaciones = [[], ["barrio"], ["departamento"], ["padron"], ["telefono"], ["correo"],
    ["padron", "barrio"], ["barrio", "departamento"], ["telefono", "correo"],
    ["propietario_domicilio"],
    ["telefono", "correo", "padron", "barrio", "departamento", "propietario_domicilio"]];
  for (const quitadas of combinaciones) {
    for (const bloque of armar(BASE, quitadas)) {
      if (bloque.tipo !== "parrafo") continue;
      const texto = bloque.partes.map((p) => p.texto).join("");
      assert.doesNotMatch(texto, / {2}/, `espacio doble con [${quitadas}]: ${texto.slice(0, 90)}`);
      assert.doesNotMatch(texto, / [,.]/, `coma o punto sueltos con [${quitadas}]`);
      assert.doesNotMatch(texto, /^\s|\s$/, `sobra espacio en los bordes con [${quitadas}]`);
      assert.doesNotMatch(texto, /,\s*,/, `dos comas seguidas con [${quitadas}]`);
    }
  }
});

test("quitar el telefono deja el encabezado corrido, sin agujero", () => {
  const texto = frase(armar(BASE, ["telefono"]), "OFERENTE, expresa");
  assert.match(texto, /Nombre: Juan Pérez Doc\. Identidad 1\.234\.567-8 Correo electrónico/);
  assert.doesNotMatch(texto, /Teléfono/);
});

/* La correccion del QUINTO: la palabra y el numero salen del MISMO dato. */
test("los plazos se escriben en letra y en numero, siempre iguales", () => {
  const doc = armar({ ...BASE, dias_reserva: 15, dias_validez: 10 }, []);
  assert.match(frase(doc, "TERCERO"), /dentro de los quince \(15\) días hábiles/);
  assert.match(frase(doc, "QUINTO"), /por un plazo de diez \(10\) días hábiles/);
  assert.doesNotMatch(frase(doc, "QUINTO"), /cinco \(10\)/, "era el error del modelo");
});

test("el precio va en letras y en cifras", () => {
  assert.match(frase(armar(BASE, []), "SEGUNDO"),
    /suma de ciento treinta y cuatro mil \(U\$S 134\.000\) dólares estadounidenses/);
});

test("la fecha se escribe como la escribe una persona", () => {
  assert.match(frase(armar(BASE, []), "SEXTO"), /en Montevideo el día 19 de agosto de 2026\./);
});

test("cada parte dice si es texto, valor escrito o rayita", () => {
  const clases = new Set(armar({ ...BASE, padron: null }, [])
    .filter((b) => b.tipo === "parrafo").flatMap((b) => b.partes).map((p) => p.clase));
  assert.deepEqual([...clases].sort(), ["rayita", "texto", "valor"]);
});

test("las firmas dicen si ya estan hechas", () => {
  const firmas = armar(BASE, [], { firmadas: ["oferente"] })
    .filter((b) => b.tipo === "firmas").flatMap((b) => b.firmas);
  assert.equal(firmas.find((f) => f.clave === "oferente").firmada, true);
  assert.equal(firmas.find((f) => f.clave === "propietario").firmada, false);
});

/* La plata la recibe RE/MAX, que no firma nunca. Firma el usuario por ella. */
test("el DEPOSITARIO firma en representacion de RE/MAX, con su nombre", () => {
  const firmas = armar(BASE, [], { agente: "Juan Andrés Otero" })
    .filter((b) => b.tipo === "firmas").flatMap((b) => b.firmas);
  const dep = firmas.find((f) => f.clave === "depositario");
  assert.equal(dep.nota, "En representación de RE/MAX");
  assert.equal(dep.nombre, "Juan Andrés Otero");
  assert.equal(firmas.find((f) => f.clave === "oferente").nombre, "",
    "al comprador no se le pone nombre: ya esta en el encabezado");
});

test("sin ningun valor sale la carta entera en rayitas, sin romperse", () => {
  const doc = armar({}, []);
  assert.ok(doc.length > 5);
  assert.match(frase(doc, "SEGUNDO"), /suma de _+ dólares estadounidenses/);
  assert.match(frase(doc, "TERCERO"), /dentro de los _+ días hábiles/);
  assert.match(frase(doc, "empadronado"), /calle _+, _+, _+, en la República/);
});

test("comoTexto devuelve la carta entera para leerla de un tiron", () => {
  const texto = comoTexto(armar(BASE, []));
  assert.match(texto, /^OFERTA DE COMPRA/);
  assert.match(texto, /ACEPTACIÓN/);
  assert.ok(texto.split("\n\n").length >= 9);
});
