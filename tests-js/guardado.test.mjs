import { test } from "node:test";
import assert from "node:assert/strict";
import {
  editarNegocio, editarPropiedad, marcarAtendido, hayCambios, resumenCambios, sincronizar,
  ARCHIVO_NEGOCIOS,
} from "../lib/guardado.js";

const AJUSTES = {
  categorias: [{ categoria: "RAP", split_pct: 0.45, fee_mensual_usd: 70, desde: "2026-01-01", hasta: null }],
  defaults_comision: { venta: { 1: 0.03, 2: 0.06 }, alquiler: { 1: 1.0, 2: 2.0 } },
  regla_martin: { facturacion: 0.5, ganancia: 0.35 },
  pct_suplencia: 0.125, pct_referido_saliente: 0.25, pct_referido_entrante_otro: 0.75,
};

function estado() {
  return {
    datos: {
      negocios: [
        { id: "excel-5", tipo_negocio: "venta", estado: "cerrado", fecha_inicio: null,
          fecha_boleto: "2026-02-10", fecha_fin: "2026-03-15", direccion: "Calle 100",
          barrio: "Cerrito", precio_operacion: 100000, pct_comision_total: 0.03,
          regimen_comision: "captacion_mia", puntas: 1, base: 3000, facturacion: 3000,
          ganancia: 1350, ficha_completa: false,
          agente_vende: "Juan Andrés Otero", agente_compra: "Otro", origen_captacion: "BDR",
          avisos: [{ tipo: "falta_fecha_inicio", detalle: "x" }] },
      ],
      mis_datos: { eventos_atendidos: [] },
      ajustes: AJUSTES,
    },
    hoy: "2026-08-17",
    sucios: new Set(),
  };
}

test("editar cambia el dato y recalcula la plata", () => {
  const e = estado();
  editarNegocio(e, "excel-5", { precio_operacion: 200000 });
  const n = e.datos.negocios[0];
  assert.equal(n.precio_operacion, 200000);
  assert.equal(n.facturacion, 6000);
  assert.equal(n.ganancia, 2700);
});

test("editar hace desaparecer el aviso que se corrigio", () => {
  const e = estado();
  assert.equal(e.datos.negocios[0].avisos.length, 1);
  editarNegocio(e, "excel-5", { fecha_inicio: "2026-01-10" });
  assert.equal(e.datos.negocios[0].avisos.length, 0);
});

test("editar marca el archivo como sucio", () => {
  const e = estado();
  editarNegocio(e, "excel-5", { fecha_inicio: "2026-01-10" });
  assert.ok(e.sucios.has("datos/negocios.json"));
  assert.equal(hayCambios(e), true);
});

test("sin editar nada no hay cambios", () => {
  assert.equal(hayCambios(estado()), false);
});

test("editar un negocio que no existe no revienta ni ensucia", () => {
  const e = estado();
  editarNegocio(e, "no-existe", { fecha_inicio: "2026-01-10" });
  assert.equal(hayCambios(e), false);
});

test("dar la ficha por completa silencia los faltantes", () => {
  const e = estado();
  editarNegocio(e, "excel-5", { ficha_completa: true });
  assert.deepEqual(e.datos.negocios[0].avisos, []);
});

test("marcar un evento como atendido lo guarda en mis_datos", () => {
  const e = estado();
  marcarAtendido(e, "2026-08-17|abc|baja");
  assert.deepEqual(e.datos.mis_datos.eventos_atendidos, ["2026-08-17|abc|baja"]);
  assert.ok(e.sucios.has("datos/mis_datos.json"));
});

test("marcar dos veces el mismo evento no lo duplica", () => {
  const e = estado();
  marcarAtendido(e, "ev-1");
  marcarAtendido(e, "ev-1");
  assert.equal(e.datos.mis_datos.eventos_atendidos.length, 1);
});

test("el resumen dice en castellano que hay para subir", () => {
  const e = estado();
  editarNegocio(e, "excel-5", { fecha_inicio: "2026-01-10" });
  assert.match(resumenCambios(e), /negocios/i);
});

test("el resumen vacio no miente", () => {
  assert.equal(resumenCambios(estado()), "");
});

/* Un GitHub de mentira: registra que se le pidio y devuelve lo que se le indique. */
function fingirGitHub({ falla = null, conflictoLaPrimera = false } = {}) {
  const escrituras = [];
  let yaFallo = false;
  return {
    escrituras,
    api: {
      async leerArchivo() {
        return { datos: { desdeGitHub: true }, sha: "sha-fresco" };
      },
      async escribirArchivo(ruta, datos, sha, mensaje) {
        if (falla) throw new Error(falla);
        if (conflictoLaPrimera && !yaFallo) {
          yaFallo = true;
          throw new Error("Hubo un conflicto: el archivo cambió en GitHub");
        }
        escrituras.push({ ruta, datos, sha, mensaje });
        return { sha: "sha-nuevo" };
      },
    },
  };
}

test("sincronizar sube los archivos sucios y limpia la cola", async () => {
  const e = estado();
  e.shas = { [ARCHIVO_NEGOCIOS]: "sha-viejo" };
  editarNegocio(e, "excel-5", { fecha_inicio: "2026-01-10" });
  const g = fingirGitHub();

  const r = await sincronizar(e, g.api, "tok");
  assert.equal(r.ok, true);
  assert.equal(g.escrituras.length, 1);
  assert.equal(g.escrituras[0].ruta, ARCHIVO_NEGOCIOS);
  assert.equal(hayCambios(e), false);
});

test("sincronizar guarda el sha nuevo para la proxima", async () => {
  const e = estado();
  e.shas = { [ARCHIVO_NEGOCIOS]: "sha-viejo" };
  editarNegocio(e, "excel-5", { fecha_inicio: "2026-01-10" });
  await sincronizar(e, fingirGitHub().api, "tok");
  assert.equal(e.shas[ARCHIVO_NEGOCIOS], "sha-nuevo");
});

test("sin cambios, sincronizar no llama a GitHub", async () => {
  const g = fingirGitHub();
  const r = await sincronizar(estado(), g.api, "tok");
  assert.equal(r.ok, true);
  assert.equal(g.escrituras.length, 0);
});

test("sin token avisa y no borra los cambios", async () => {
  const e = estado();
  editarNegocio(e, "excel-5", { fecha_inicio: "2026-01-10" });
  const r = await sincronizar(e, fingirGitHub().api, "");
  assert.equal(r.ok, false);
  assert.match(r.mensaje, /token/i);
  assert.equal(hayCambios(e), true);
});

test("si falla la subida, los cambios NO se pierden", async () => {
  const e = estado();
  editarNegocio(e, "excel-5", { fecha_inicio: "2026-01-10" });
  const r = await sincronizar(e, fingirGitHub({ falla: "sin internet" }).api, "tok");
  assert.equal(r.ok, false);
  assert.equal(hayCambios(e), true, "la cola tiene que quedar intacta para reintentar");
});

test("ante un conflicto, relee el sha y reintenta solo", async () => {
  const e = estado();
  e.shas = { [ARCHIVO_NEGOCIOS]: "sha-viejo" };
  editarNegocio(e, "excel-5", { fecha_inicio: "2026-01-10" });
  const g = fingirGitHub({ conflictoLaPrimera: true });

  const r = await sincronizar(e, g.api, "tok");
  assert.equal(r.ok, true, "el reintento tiene que salir bien");
  assert.equal(g.escrituras[0].sha, "sha-fresco", "tiene que usar el sha releido");
});

/* ---------- Contestar qué pasó con una propiedad que se fue ---------- */

function conPropiedadQueSeFue() {
  return {
    datos: {
      negocios: [
        { id: "manual-9", tipo_negocio: "venta", estado: "en_curso", entity_id_cartera: "sf",
          fecha_inicio: "2026-01-08", fecha_negociacion: "2026-02-26", fecha_boleto: "2026-05-05",
          fecha_fin: null, direccion: "San Fructuoso 1200", barrio: "Reducto",
          precio_operacion: 89900, pct_comision_total: 0.06, puntas: 2, puntas_confirmadas: true,
          agente_vende: "Juan Andrés Otero", agente_compra: "Juan Andrés Otero",
          origen_captacion: "B.d.r.", ficha_completa: false, avisos: [] },
        /* Lo que se hizo sobre la misma propiedad hace dos años: cerrado y cobrado. */
        { id: "excel-1", tipo_negocio: "venta", estado: "cerrado", entity_id_cartera: "sf",
          fecha_inicio: "2024-01-10", fecha_boleto: "2024-02-10", fecha_fin: "2024-03-01",
          direccion: "San Fructuoso 1200", barrio: "Reducto", precio_operacion: 80000,
          pct_comision_total: 0.03, puntas: 1, agente_vende: "Juan Andrés Otero",
          agente_compra: "Otro", origen_captacion: "B.d.r.", ficha_completa: true, avisos: [] },
      ],
      cartera: {
        sf: { entity_id: "sf", activa: false, estado: "reservada", direccion: "San Fructuoso 1200",
          fecha_desaparicion: "2026-09-02", desenlace_propuesto: "vendida",
          desenlace_confirmado: null },
      },
      eventos: [{ id: "2026-09-02|sf|baja", tipo: "baja", entity_id: "sf", fecha: "2026-09-02" }],
      mis_datos: { eventos_atendidos: [] },
      ajustes: AJUSTES,
    },
    hoy: "2026-09-11",
    sucios: new Set(),
  };
}

/* ES LA MISMA PREGUNTA vista desde dos pantallas, y contestada en un lado tiene que quedar
   contestada en los dos. Juan dijo en la propiedad que se vendió y el negocio le siguió
   preguntando "¿se concretó o se cayó?". */
test("decir en la propiedad que se vendió cierra su negocio abierto", () => {
  const e = conPropiedadQueSeFue();
  editarPropiedad(e, "sf", { desenlace_confirmado: "vendida" });
  const n = e.datos.negocios.find((x) => x.id === "manual-9");
  assert.equal(n.fecha_fin, "2026-09-02", "firmado el día que se fue del portal");
  assert.equal(n.estado, "cerrado");
  assert.ok(e.sucios.has(ARCHIVO_NEGOCIOS));
});

test("decir que se cayó lo da por caído", () => {
  const e = conPropiedadQueSeFue();
  editarPropiedad(e, "sf", { desenlace_confirmado: "caida" });
  assert.equal(e.datos.negocios.find((x) => x.id === "manual-9").estado, "caido");
});

test("el negocio viejo, ya cobrado, de la misma propiedad no se toca", () => {
  const e = conPropiedadQueSeFue();
  editarPropiedad(e, "sf", { desenlace_confirmado: "vendida" });
  assert.equal(e.datos.negocios.find((x) => x.id === "excel-1").fecha_fin, "2024-03-01");
});

/* "Desapareció de RE/MAX, ¿se cayó o se vendió?" es justo lo que se acaba de contestar. Sin
   esto había que tocar "Ya lo resolví" aparte: Juan lo hizo, dos veces por la misma cosa. */
test("contestar qué pasó despacha el aviso de que se fue", () => {
  const e = conPropiedadQueSeFue();
  editarPropiedad(e, "sf", { desenlace_confirmado: "vendida" });
  assert.ok(e.datos.mis_datos.eventos_atendidos.includes("2026-09-02|sf|baja"));
});
