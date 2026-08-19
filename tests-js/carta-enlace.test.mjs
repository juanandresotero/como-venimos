import { test } from "node:test";
import assert from "node:assert/strict";
import { aEnlace, deEnlace, comoWhatsApp, PRESUPUESTO } from "../lib/carta-enlace.js";
import { deTrazos, aBytes } from "../lib/firma.js";
import { recortar } from "../lib/firma-foto.js";

const ESTADO = {
  valores: {
    nombre: "Juan Pérez", cedula: "1.234.567-8", telefono: "099123456",
    correo: "juan@mail.com", padron: "62295", calle: "Pantaleón Pérez 4782",
    barrio: "Maroñas", departamento: "Montevideo", precio: 134000,
    dias_reserva: 15, dias_validez: 5, fecha_oferta: "2026-08-19",
  },
  quitadas: ["correo"],
  turno: "propietario",
  telefono_agente: "59899123456",
  agente: "Juan Andrés Otero",
  firmas: {},
};

const BASE = "https://juanandresotero.github.io/como-venimos/firmar.html";

test("el estado va al enlace y vuelve entero", async () => {
  const vuelta = await deEnlace(await aEnlace(BASE, ESTADO));
  assert.deepEqual(vuelta.valores, ESTADO.valores);
  assert.deepEqual(vuelta.quitadas, ESTADO.quitadas);
  assert.equal(vuelta.turno, "propietario");
  assert.equal(vuelta.telefono_agente, "59899123456");
  assert.equal(vuelta.agente, "Juan Andrés Otero");
});

/* Los datos NO pueden ir en la parte que el servidor ve. */
test("todo viaja despues del numeral, que nunca llega al servidor", async () => {
  const [antes, despues] = (await aEnlace(BASE, ESTADO)).split("#");
  assert.equal(antes, BASE);
  assert.ok(despues.length > 20);
  assert.doesNotMatch(antes, /Pérez|134000|62295/);
});

test("el fragmento usa solo caracteres que sobreviven a WhatsApp", async () => {
  const fragmento = (await aEnlace(BASE, ESTADO)).split("#")[1];
  assert.match(fragmento, /^[A-Za-z0-9_-]+$/, "nada de +, / ni = que haya que escapar");
});

test("las firmas viajan y vuelven identicas", async () => {
  const dibujada = deTrazos([[{ x: 10, y: 20 }, { x: 44, y: 61 }, { x: 90, y: 33 }]]);
  const enlace = await aEnlace(BASE, { ...ESTADO, firmas: { oferente: aBytes(dibujada) } });
  const vuelta = await deEnlace(enlace);
  assert.deepEqual([...vuelta.firmas.oferente], [...aBytes(dibujada)]);
  assert.equal(vuelta.firmas.depositario, undefined);
});

test("los acentos y la ñ vuelven bien", async () => {
  const vuelta = await deEnlace(await aEnlace(BASE, {
    ...ESTADO, valores: { ...ESTADO.valores, barrio: "Maroñas", calle: "Ramón Anador" },
  }));
  assert.equal(vuelta.valores.barrio, "Maroñas");
  assert.equal(vuelta.valores.calle, "Ramón Anador");
});

/* Firma parecida a la del usuario: trazos, no ruido al azar (que comprime distinto). */
function firmaDeFotoDePrueba() {
  const ancho = 900;
  const alto = 370;
  const data = new Uint8ClampedArray(ancho * alto * 4);
  for (let y = 0; y < alto; y++) {
    for (let x = 0; x < ancho; x++) {
      const enTrazo = Math.abs(y - (185 + 120 * Math.sin(x / 90))) < 4
        || Math.abs(y - (200 + 90 * Math.cos(x / 60))) < 3;
      const i = (y * ancho + x) * 4;
      data[i] = enTrazo ? 70 : 150;
      data[i + 1] = enTrazo ? 90 : 152;
      data[i + 2] = enTrazo ? 164 : 158;
      data[i + 3] = 255;
    }
  }
  return recortar({ data, width: ancho, height: alto });
}

/* EL TEST QUE DECIDE SI EL DISEÑO SE SOSTIENE.

   El tramo mas pesado es el ultimo: la carta llena, la firma dibujada del comprador y
   la firma del usuario recortada de su foto. */
test("una carta llena con las dos firmas entra en el presupuesto del enlace", async () => {
  const dibujada = deTrazos([
    Array.from({ length: 70 }, (_, i) => ({ x: 40 + i * 12, y: 250 + Math.round(90 * Math.sin(i / 6)) })),
    Array.from({ length: 55 }, (_, i) => ({ x: 90 + i * 9, y: 300 + Math.round(60 * Math.cos(i / 5)) })),
  ]);

  const enlace = await aEnlace(BASE, {
    ...ESTADO,
    quitadas: [],
    firmas: { oferente: aBytes(dibujada), depositario: aBytes(firmaDeFotoDePrueba()) },
  });

  const fragmento = enlace.split("#")[1];
  console.log(`      enlace ${enlace.length} caracteres `
    + `(fragmento ${fragmento.length} de ${PRESUPUESTO})`);
  assert.ok(fragmento.length <= PRESUPUESTO,
    `el fragmento mide ${fragmento.length} y el presupuesto es ${PRESUPUESTO}`);
});

test("un enlace roto devuelve null en vez de romper la pagina del cliente", async () => {
  assert.equal(await deEnlace(`${BASE}#no-es-esto`), null);
  assert.equal(await deEnlace(BASE), null);
  assert.equal(await deEnlace(""), null);
  assert.equal(await deEnlace(null), null);
  assert.equal(await deEnlace(`${BASE}#!!!!`), null);
});

test("el boton de WhatsApp abre la conversacion con quien corresponde", () => {
  const url = comoWhatsApp("https://x.y/#abc", { texto: "Te mando la carta", telefono: "598 99 123 456" });
  assert.match(url, /^https:\/\/wa\.me\/59899123456\?text=/);
  assert.match(decodeURIComponent(url.split("text=")[1]), /Te mando la carta\n\nhttps:\/\/x\.y\/#abc/);
});

test("sin telefono, WhatsApp pregunta a quien mandarsela", () => {
  assert.match(comoWhatsApp("https://x.y/#abc"), /^https:\/\/wa\.me\/\?text=/);
});
