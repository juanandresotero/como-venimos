import { test } from "node:test";
import assert from "node:assert/strict";
import {
  TIPOS, mesDe, nombreDelMes, mesesConDato, buscar, calcular, textoParaElCliente,
} from "../lib/reajuste.js";

/* Los indices reales de agosto de 2026, ya cruzados por el robot. */
const INDICES = {
  actualizado: "2026-08-18",
  meses: {
    "2026-06": { coeficiente: 1.0377, ipc: 1.0377, verificado: true, avisos: [] },
    "2026-07": { coeficiente: 1.0425, ipc: 1.0425, verificado: true, avisos: [] },
    "2026-08": { coeficiente: 1.0427, ipc: 1.0427, verificado: true, avisos: [] },
  },
};

test("el mes sale de la fecha de hoy sin tener que elegirlo", () => {
  assert.equal(mesDe("2026-08-18"), "2026-08");
  assert.equal(nombreDelMes("2026-08"), "agosto 2026");
  assert.equal(nombreDelMes("2026-09"), "setiembre 2026");
  assert.equal(nombreDelMes(""), "");
});

test("con el indice del mes cargado, viene al dia", () => {
  const i = buscar(INDICES, "2026-08", "coeficiente");
  assert.equal(i.valor, 1.0427);
  assert.equal(i.mes, "2026-08");
  assert.equal(i.alDia, true);
});

/* Si el del mes todavia no salio, se usa el ultimo publicado y queda marcado. El usuario
   pidio que igual lo dejara mandar: el texto lo aclara. */
test("si el mes todavia no salio, cae en el ultimo publicado y lo marca", () => {
  const i = buscar(INDICES, "2026-09", "ipc");
  assert.equal(i.valor, 1.0427);
  assert.equal(i.mes, "2026-08");
  assert.equal(i.pedido, "2026-09");
  assert.equal(i.alDia, false);
});

test("nunca agarra un mes POSTERIOR al pedido: seria cobrarle de mas", () => {
  const i = buscar(INDICES, "2026-05", "coeficiente");
  assert.equal(i.valor, null);
  assert.equal(i.mes, null);
});

test("sin datos no inventa nada", () => {
  assert.equal(buscar({}, "2026-08", "ipc").valor, null);
  assert.equal(buscar(null, "2026-08", "ipc").valor, null);
  assert.deepEqual(mesesConDato(null, "ipc"), []);
});

test("un mes que no paso el control llega marcado, no escondido", () => {
  const dudoso = { meses: { "2026-08": { coeficiente: 1.06, verificado: false, avisos: ["no cierra"] } } };
  const i = buscar(dudoso, "2026-08", "coeficiente");
  assert.equal(i.valor, 1.06);
  assert.equal(i.verificado, false);
  assert.deepEqual(i.avisos, ["no cierra"]);
});

test("la cuenta: 40.000 con 1,0427 da 41.708", () => {
  const c = calcular(40000, 1.0427);
  assert.equal(c.actual, 40000);
  assert.equal(Math.round(c.nuevo), 41708);
  assert.equal(Math.round(c.aumento), 1708);
  assert.ok(Math.abs(c.pct - 0.0427) < 1e-9);
});

test("sin monto o sin indice no devuelve una cuenta a medias", () => {
  assert.equal(calcular(0, 1.0427), null);
  assert.equal(calcular(40000, 0), null);
  assert.equal(calcular(null, null), null);
});

test("los dos caminos tienen su explicacion corta", () => {
  assert.equal(TIPOS.length, 2);
  assert.ok(TIPOS.find((t) => t.clave === "coeficiente").cuando.includes("1968"));
  assert.ok(TIPOS.every((t) => t.cuando.length < 90));
});

/* El texto para el inquilino. */

const armar = (mesPedido, tipo = "coeficiente") => {
  const indice = buscar(INDICES, mesPedido, tipo);
  return textoParaElCliente({
    cuenta: calcular(40000, indice.valor),
    moneda: "UYU",
    tipo,
    indice,
    titulo: "Av. Italia 1234",
  });
};

test("con el dato del mes, el texto va limpio y sin salvedades", () => {
  const t = armar("2026-08");
  assert.match(t, /Alquiler actual: \$ 40\.000/);
  assert.match(t, /coeficiente de reajuste de agosto 2026: 4,27%/);
  assert.match(t, /\*Nuevo alquiler: \$ 41\.708\*/);
  assert.ok(!t.includes("estimado"));
  assert.ok(!t.includes("todavía no"));
});

/* Lo que pidio el usuario: que lo deje mandar igual, aclarando que hay que esperar. */
test("sin el dato del mes, avisa que es estimado y que falta publicar", () => {
  const t = armar("2026-09");
  assert.match(t, /\*Nuevo alquiler estimado: \$ 41\.708\*/);
  assert.match(t, /El índice de setiembre 2026 todavía no se publicó/);
  assert.match(t, /te confirmo el monto exacto/);
});

test("la palabra 'estimado' va pegada al monto, no solo en la aclaracion", () => {
  const renglonDelMonto = armar("2026-09").split("\n").find((l) => l.includes("Nuevo alquiler"));
  assert.ok(renglonDelMonto.includes("estimado"), "el que lee se queda con la negrita");
});

test("el IPC se nombra IPC y el coeficiente se nombra coeficiente", () => {
  assert.match(armar("2026-08", "ipc"), /Ajuste por IPC de agosto 2026/);
  assert.match(armar("2026-08", "coeficiente"), /Ajuste por coeficiente de reajuste/);
});

test("los dolares se muestran como dolares", () => {
  const indice = buscar(INDICES, "2026-08", "ipc");
  const t = textoParaElCliente({
    cuenta: calcular(1200, indice.valor), moneda: "USD", tipo: "ipc", indice,
  });
  assert.match(t, /Alquiler actual: USD 1\.200/);
  assert.match(t, /\*Nuevo alquiler: USD 1\.251\*/);
});

test("sin cuenta no sale un texto roto", () => {
  assert.equal(textoParaElCliente({ cuenta: null, indice: { valor: 1.04 } }), "");
  assert.equal(textoParaElCliente({ cuenta: { actual: 1 }, indice: { valor: null } }), "");
});
