import { test } from "node:test";
import assert from "node:assert/strict";
import {
  VACIO, sanear, aTexto, desdeTexto, leer, guardar, proximoId,
  cobrosDeNegocios, faltaPagar, estaPago, saldos, resumen,
  gastadoEnElMes, gastadoHastaElDia, mesAnterior, diasDelMes, mesAMes, proyeccionDelMes,
} from "../lib/personal.js";

/* Como arranca Juan el 2026-08-20: 750 dólares y 3.800 pesos, y nada de lo anterior cuenta. */
const ARRANQUE = { fecha: "2026-08-20", uyu: 3800, usd: 750 };

const conDatos = (extra = {}) => sanear({ arranque: ARRANQUE, ...extra });

const alquiler = (pagos = {}) => ({
  id: 1, nombre: "Alquiler", monto: 25000, moneda: "UYU", dia: 5, pagos,
});

/* ---------- Lo que entra de los negocios ---------- */

const NEGOCIOS = [
  /* Ya cobrado y gastado: es de antes del arranque y NO tiene que contar. */
  { id: "v1", estado: "cerrado", fecha_fin: "2026-06-10", ganancia: 4000, direccion: "Vieja 1" },
  { id: "v2", estado: "cerrado", fecha_fin: "2026-08-19", ganancia: 1500, direccion: "Vieja 2" },
  /* El mismo día del arranque ya cuenta. */
  { id: "n1", estado: "cerrado", fecha_fin: "2026-08-20", ganancia: 1200, direccion: "Nueva 1" },
  { id: "n2", estado: "cerrado", fecha_fin: "2026-09-15", ganancia: 2000, direccion: "Nueva 2" },
  /* Todavía no cerró: no hay plata. */
  { id: "abierto", estado: "en_curso", fecha_fin: null, ganancia: 9000 },
  /* Cerrado sin fecha de firma: la app entera lo trata como no cobrado. */
  { id: "sin-fecha", estado: "cerrado", fecha_fin: null, ganancia: 3000 },
];

/* LO QUE PIDIÓ JUAN: los 9.672 que ya ganó este año no cuentan porque ya se los gastó. */
test("sólo entra lo que se cobra desde el día del arranque", () => {
  const cobros = cobrosDeNegocios(NEGOCIOS, "2026-08-20");
  assert.deepEqual(cobros.map((c) => c.id), ["n1", "n2"]);
  assert.equal(cobros.reduce((t, c) => t + c.monto, 0), 3200);
});

test("un negocio sin fecha de firma no puso plata en el bolsillo", () => {
  const cobros = cobrosDeNegocios(NEGOCIOS, "2020-01-01");
  assert.ok(!cobros.some((c) => c.id === "sin-fecha"));
  assert.ok(!cobros.some((c) => c.id === "abierto"));
});

/* Juan eligió que la ganancia entre sola y entera. El descuento queda disponible porque lo
   que la app llama ganancia es ANTES de impuestos. */
test("la ganancia entra entera, salvo que se configure un descuento", () => {
  assert.equal(cobrosDeNegocios(NEGOCIOS, "2026-08-20", 0)[0].monto, 1200);
  assert.equal(cobrosDeNegocios(NEGOCIOS, "2026-08-20", 0.25)[0].monto, 900);
});

test("sin fecha de arranque no entra ningún cobro", () => {
  assert.deepEqual(cobrosDeNegocios(NEGOCIOS, null), []);
});

/* ---------- Los saldos ---------- */

test("sin nada cargado, el saldo es el arranque", () => {
  const s = saldos(conDatos(), [], "2026-08-20");
  assert.deepEqual(s, { UYU: 3800, USD: 750 });
});

test("la ganancia de un negocio cobrado entra en dólares", () => {
  const s = saldos(conDatos(), NEGOCIOS, "2026-08-31");
  assert.equal(s.USD, 750 + 1200, "el de septiembre todavía no pasó");
  assert.equal(s.UYU, 3800);
});

test("un gasto suelto descuenta apenas se carga", () => {
  const s = saldos(conDatos({
    variables: [{ id: 1, fecha: "2026-08-21", monto: 800, moneda: "UYU", categoria: "Comida" }],
  }), [], "2026-08-31");
  assert.equal(s.UYU, 3000);
});

/* Un fijo NO descuenta hasta que se marca pagado: hasta entonces la plata sigue en la
   cuenta. De esa diferencia sale el "si pago todo me queda". */
test("un gasto fijo descuenta recién cuando se marca pagado", () => {
  const sinPagar = conDatos({ fijos: [alquiler()] });
  assert.equal(saldos(sinPagar, [], "2026-08-31").UYU, 3800);

  const pagado = conDatos({
    fijos: [alquiler({ "2026-08": { monto: 25000, moneda: "UYU", fecha: "2026-08-05" } })],
  });
  assert.equal(saldos(pagado, [], "2026-08-31").UYU, 3800 - 25000);
});

/* Si el historial se calculara con el monto de HOY, subir el alquiler reescribiría todos los
   meses anteriores y las gráficas del año pasado cambiarían solas. */
test("cada pago guarda su propio monto: subir el alquiler no reescribe el pasado", () => {
  const d = conDatos({
    fijos: [{
      ...alquiler({
        "2026-07": { monto: 20000, moneda: "UYU", fecha: "2026-07-05" },
        "2026-08": { monto: 25000, moneda: "UYU", fecha: "2026-08-05" },
      }),
      monto: 25000,
    }],
  });
  assert.equal(gastadoEnElMes(d, "2026-07").UYU, 20000, "julio sigue diciendo 20.000");
  assert.equal(gastadoEnElMes(d, "2026-08").UYU, 25000);
});

test("cambiar plata saca de una moneda y pone en la otra", () => {
  const s = saldos(conDatos({
    cambios: [{ id: 1, fecha: "2026-08-21", de: "USD", monto_de: 200, a: "UYU", monto_a: 8000 }],
  }), [], "2026-08-31");
  assert.deepEqual(s, { UYU: 11800, USD: 550 });
});

test("lo que todavía no pasó no cuenta en el saldo de hoy", () => {
  const d = conDatos({
    variables: [{ id: 1, fecha: "2026-09-02", monto: 500, moneda: "UYU" }],
  });
  assert.equal(saldos(d, [], "2026-08-31").UYU, 3800);
  assert.equal(saldos(d, [], "2026-09-30").UYU, 3300);
});

/* ---------- El resumen ---------- */

test("los tres números de arriba: tengo, falta pagar, me queda", () => {
  const d = conDatos({
    fijos: [alquiler(), { id: 2, nombre: "Celular", monto: 1200, moneda: "UYU", dia: 15 }],
    entradas: [{ id: 1, fecha: "2026-08-20", monto: 40000, moneda: "UYU", nota: "sueldo" }],
  });
  const r = resumen(d, [], "2026-08-20");
  assert.equal(r.tengo.UYU, 43800);
  assert.equal(r.falta.UYU, 26200);
  assert.equal(r.queda.UYU, 17600);
});

test("un fijo ya pagado deja de figurar en lo que falta", () => {
  const d = conDatos({
    fijos: [alquiler({ "2026-08": { monto: 25000, moneda: "UYU", fecha: "2026-08-05" } })],
  });
  const r = resumen(d, [], "2026-08-20");
  assert.equal(r.falta.UYU, 0);
  assert.deepEqual(r.pendientes, []);
  assert.equal(estaPago(d.fijos[0], "2026-08"), true);
});

test("un fijo apagado no se cobra más", () => {
  const d = conDatos({ fijos: [{ ...alquiler(), activo: false }] });
  assert.deepEqual(faltaPagar(d, "2026-08"), []);
});

/* El número que frena la mano: lo que queda repartido en los días que faltan, con los fijos
   pendientes YA descontados para no prometer plata que tiene dueño. */
test("cuánto queda por día usa los días que faltan del mes, no los treinta", () => {
  const d = conDatos({ entradas: [{ id: 1, fecha: "2026-08-20", monto: 8400, moneda: "UYU" }] });
  const r = resumen(d, [], "2026-08-19");
  assert.equal(r.diasQueFaltan, 13, "del 19 al 31 inclusive");
  assert.equal(r.queda.UYU, 3800);
  assert.ok(Math.abs(r.porDia.UYU - 3800 / 13) < 0.001);
});

test("el último día del mes no divide por cero", () => {
  const r = resumen(conDatos(), [], "2026-08-31");
  assert.equal(r.diasQueFaltan, 1);
  assert.equal(r.porDia.UYU, 3800);
});

/* ---------- El ritmo, contra el mes pasado ---------- */

/* Comparar el día 8 contra un mes entero no dice nada: se compara a la misma altura. */
test("el ritmo compara contra el mes pasado hasta el mismo día", () => {
  const d = conDatos({
    variables: [
      { id: 1, fecha: "2026-07-05", monto: 1000, moneda: "UYU" },
      { id: 2, fecha: "2026-07-25", monto: 9000, moneda: "UYU" },
      { id: 3, fecha: "2026-08-05", monto: 1500, moneda: "UYU" },
    ],
  });
  const r = resumen(d, [], "2026-08-10");
  assert.equal(r.ritmo.UYU.antes, 1000, "julio hasta el día 10, no julio entero");
  assert.equal(r.ritmo.UYU.ahora, 1500);
  assert.equal(r.ritmo.UYU.cambio, 0.5);
});

/* "Subiste un 100%" contra un mes sin datos es una mentira con forma de número. */
test("sin mes anterior con qué comparar, no hay porcentaje", () => {
  const d = conDatos({ variables: [{ id: 1, fecha: "2026-08-05", monto: 1500, moneda: "UYU" }] });
  assert.equal(resumen(d, [], "2026-08-10").ritmo.UYU.cambio, null);
});

test("el mes anterior a enero es diciembre del año pasado", () => {
  assert.equal(mesAnterior("2026-01"), "2025-12");
  assert.equal(mesAnterior("2026-08"), "2026-07");
});

test("los días del mes salen bien, febrero incluido", () => {
  assert.equal(diasDelMes("2026-02"), 28);
  assert.equal(diasDelMes("2024-02"), 29);
  assert.equal(diasDelMes("2026-08"), 31);
  assert.equal(diasDelMes("2026-04"), 30);
});

/* ---------- Mes a mes y proyección ---------- */

test("mes a mes devuelve todos los meses, también los vacíos", () => {
  const d = conDatos({ variables: [{ id: 1, fecha: "2026-08-05", monto: 900, moneda: "UYU" }] });
  const serie = mesAMes(d, "2026-08-20", 3);
  assert.deepEqual(serie.map((x) => x.mes), ["2026-06", "2026-07", "2026-08"]);
  assert.equal(serie[0].gastado.UYU, 0, "un mes sin gastos es información, no se saltea");
  assert.equal(serie[2].gastado.UYU, 900);
});

test("la proyección estira lo que va gastando a todo el mes", () => {
  const d = conDatos({ variables: [{ id: 1, fecha: "2026-08-05", monto: 1000, moneda: "UYU" }] });
  const p = proyeccionDelMes(d, "2026-08-10");
  assert.equal(p.vaGastando.UYU, 1000);
  assert.equal(p.proyectado.UYU, (1000 / 10) * 31);
});

/* Los primeros días del mes cualquier proyección es ruido: un café el día 1 proyecta treinta
   cafés. Mejor no mostrar nada. */
test("antes del día 5 no se proyecta nada", () => {
  assert.equal(proyeccionDelMes(conDatos(), "2026-08-03"), null);
  assert.ok(proyeccionDelMes(conDatos(), "2026-08-05"));
});

/* ---------- Guardar, leer y la copia de respaldo ---------- */

function depositoFalso() {
  const caja = new Map();
  return {
    getItem: (k) => (caja.has(k) ? caja.get(k) : null),
    setItem: (k, v) => caja.set(k, String(v)),
    caja,
  };
}

test("lo guardado se vuelve a leer igual", () => {
  const d = depositoFalso();
  const original = conDatos({ variables: [{ id: 1, fecha: "2026-08-21", monto: 500, moneda: "UYU" }] });
  assert.equal(guardar(original, d), true);
  assert.deepEqual(leer(d), original);
});

test("sin nada guardado se arranca vacío", () => {
  assert.deepEqual(leer(depositoFalso()), VACIO);
});

test("basura guardada no rompe la app: se arranca vacío", () => {
  const d = depositoFalso();
  d.setItem("como-venimos:personal", "{esto no es json");
  assert.deepEqual(leer(d), VACIO);
});

test("sin lugar donde guardar, la app sigue andando", () => {
  assert.deepEqual(leer(null), VACIO);
  assert.equal(guardar(conDatos(), null), false);
});

/* La contracara de guardar sólo en el teléfono: poder bajarse una copia y volver a cargarla
   en otro aparato. Sin esto, cambiar de celular es perder el historial entero. */
test("la copia de respaldo va y vuelve entera", () => {
  const original = conDatos({
    fijos: [alquiler({ "2026-08": { monto: 25000, moneda: "UYU", fecha: "2026-08-05" } })],
    variables: [{ id: 1, fecha: "2026-08-21", monto: 500, moneda: "UYU", categoria: "Comida" }],
    cambios: [{ id: 1, fecha: "2026-08-22", de: "USD", monto_de: 100, a: "UYU", monto_a: 4000 }],
  });
  assert.deepEqual(desdeTexto(aTexto(original)), original);
});

test("un archivo que no es una copia válida se rechaza en vez de vaciar todo", () => {
  assert.equal(desdeTexto("no soy json"), null);
  assert.equal(desdeTexto("[1,2,3]"), null);
  assert.equal(desdeTexto("null"), null);
});

/* Una copia vieja a la que le faltan campos nuevos tiene que cargar igual. */
test("una copia incompleta se completa sola", () => {
  const leido = desdeTexto('{"arranque":{"fecha":"2026-08-20","uyu":3800,"usd":750}}');
  assert.deepEqual(leido.fijos, []);
  assert.deepEqual(leido.cambios, []);
  assert.equal(leido.impuestos_pct, 0);
});

test("los id no se repiten aunque se borren cosas del medio", () => {
  assert.equal(proximoId([]), 1);
  assert.equal(proximoId([{ id: 1 }, { id: 7 }, { id: 3 }]), 8);
});

/* ---------- Lo que NO puede pasar ---------- */

/* El repo de esta app es PÚBLICO. Si un día alguien engancha lo personal a la barra de
   guardado, los gastos de Juan quedan en internet para siempre. */
test("nada de lo personal habla con GitHub ni con el guardado del repo", async () => {
  const { readFileSync } = await import("node:fs");
  const archivos = [
    "../lib/personal.js",
    "../vistas/personal-resumen.js",
    "../vistas/personal-fijos.js",
    "../vistas/personal-variables.js",
  ];
  for (const ruta of archivos) {
    const fuente = readFileSync(new URL(ruta, import.meta.url), "utf8");
    for (const prohibido of ["lib/github", "guardado.js", "estado.guardar", "fetch("]) {
      assert.ok(!fuente.includes(prohibido),
        `${ruta} no puede nombrar "${prohibido}": estos datos no salen del teléfono`);
    }
  }
});

/* Y al reves: que la cara personal siga estando FUERA de lo que la app sube. Si alguien
   agrega "personal" a esa lista, los gastos de Juan empiezan a viajar al repo publico en el
   proximo guardado y nadie se entera hasta que ya esta en internet. */
test("la app no sube ningún archivo personal al repo", async () => {
  const { readFileSync } = await import("node:fs");
  const app = readFileSync(new URL("../app.js", import.meta.url), "utf8");
  const lista = /const ARCHIVOS = \[([^\]]*)\]/.exec(app)
    || /"cartera", "negocios"[^;]*/.exec(app);
  assert.ok(lista, "no encontré la lista de archivos que la app sube");
  assert.ok(!lista[0].includes("personal"),
    "lo personal vive en el teléfono: no puede estar en lo que se sube al repo");
});
