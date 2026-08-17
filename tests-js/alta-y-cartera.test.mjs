/* Alta manual de negocios y edicion de propiedades: lo que la app escribe. */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  crearNegocio, borrarNegocio, nuevoId, editarPropiedad, guardarCalculo, borrarCalculo,
  editarAjustes, hayCambios, ARCHIVO_NEGOCIOS, ARCHIVO_MIS_DATOS, ARCHIVO_CALCULOS,
  ARCHIVO_AJUSTES,
} from "../lib/guardado.js";
import { ATAJOS, plantillaNegocio } from "../lib/motor.js";

const AJUSTES = {
  categorias: [{ categoria: "RAP", split_pct: 0.45, fee_mensual_usd: 70, desde: "2026-01-01", hasta: null }],
  defaults_comision: { venta: { 1: 0.03, 2: 0.06 }, alquiler: { 1: 1.0, 2: 2.0 } },
  regla_martin: { facturacion: 0.5, ganancia: 0.35 },
  pct_suplencia: 0.125, pct_referido_saliente: 0.25, pct_referido_entrante_otro: 0.75,
};

function estado() {
  return {
    datos: {
      negocios: [{ id: "excel-1" }, { id: "manual-1" }],
      cartera: {
        aaa: { entity_id: "aaa", direccion: "Vidal 3100", usar_en_proyeccion: true, notas: "" },
      },
      mis_datos: {},
      ajustes: { ...AJUSTES },
      calculos_renta: [],
    },
    hoy: "2026-08-17",
    sucios: new Set(),
  };
}

test("el id nuevo no pisa ninguno de los que ya hay", () => {
  assert.equal(nuevoId([{ id: "excel-1" }, { id: "manual-1" }]), "manual-2");
  assert.equal(nuevoId([]), "manual-1");
});

test("los cuatro atajos existen y traen su regla de plata", () => {
  assert.deepEqual(Object.keys(ATAJOS).sort(), ["alquiler", "suplencia", "venta", "yo_referi"]);
  assert.equal(ATAJOS.suplencia.regimen_comision, "suplencia");
  assert.equal(ATAJOS.yo_referi.regimen_comision, "yo_referi");
});

test("una venta nueva arranca al 3% y sin fecha de firma", () => {
  const p = plantillaNegocio("venta", AJUSTES, "2026-08-17");
  assert.equal(p.pct_comision_total, 0.03);
  assert.equal(p.fecha_fin, null, "poner la firma sola seria inventar plata cobrada");
  assert.equal(p.estado, "en_curso");
  assert.equal(p.manual, true);
});

test("un alquiler nuevo arranca al 100% de un mes", () => {
  assert.equal(plantillaNegocio("alquiler", AJUSTES, "2026-08-17").pct_comision_total, 1.0);
});

test("un atajo que no existe se rechaza en vez de crear un negocio raro", () => {
  assert.throws(() => plantillaNegocio("permuta", AJUSTES, "2026-08-17"), /Atajo desconocido/);
});

test("crear un negocio lo agrega, lo deja sucio y devuelve el nuevo", () => {
  const e = estado();
  const nuevo = crearNegocio(e, "venta");
  assert.equal(nuevo.id, "manual-2");
  assert.equal(e.datos.negocios.length, 3);
  assert.ok(e.sucios.has(ARCHIVO_NEGOCIOS));
  assert.ok(Array.isArray(nuevo.avisos), "sale ya revisado, con sus pendientes puestos");
});

test("un negocio creado desde una propiedad queda enganchado a ella", () => {
  const e = estado();
  const nuevo = crearNegocio(e, "alquiler", {
    entity_id_cartera: "aaa", direccion: "Vidal 3100", precio_operacion: 900,
  });
  assert.equal(nuevo.entity_id_cartera, "aaa");
  assert.equal(nuevo.precio_operacion, 900);
  assert.equal(nuevo.base, 900, "la BASE de un alquiler al 100% es un mes");
});

test("borrar un negocio lo saca y avisa si no estaba", () => {
  const e = estado();
  assert.equal(borrarNegocio(e, "manual-1"), true);
  assert.equal(e.datos.negocios.length, 1);
  assert.equal(borrarNegocio(e, "no-existe"), false);
});

/* §3.3: la app NO escribe cartera.json. */
test("editar una propiedad anota aparte y no ensucia el archivo del robot", () => {
  const e = estado();
  editarPropiedad(e, "aaa", { origen_captacion: "BDR" });
  assert.deepEqual(e.datos.mis_datos.cartera.aaa, { origen_captacion: "BDR" });
  assert.ok(e.sucios.has(ARCHIVO_MIS_DATOS));
  assert.ok(!e.sucios.has("datos/cartera.json"));
});

test("el cambio se ve al toque en la cartera que tiene la app en memoria", () => {
  const e = estado();
  editarPropiedad(e, "aaa", { notas: "llamar al dueño" });
  assert.equal(e.datos.cartera.aaa.notas, "llamar al dueño");
});

test("dos ediciones seguidas se acumulan en la misma anotacion", () => {
  const e = estado();
  editarPropiedad(e, "aaa", { origen_captacion: "BDR" });
  editarPropiedad(e, "aaa", { usar_en_proyeccion: false });
  assert.deepEqual(e.datos.mis_datos.cartera.aaa, {
    origen_captacion: "BDR", usar_en_proyeccion: false,
  });
});

test("la app no puede escribir un campo que es del robot", () => {
  const e = estado();
  assert.throws(() => editarPropiedad(e, "aaa", { precio: 1 }), /lo escribe el robot/);
  assert.equal(hayCambios(e), false, "y no queda nada a medio guardar");
});

test("los calculos de renta se guardan del mas nuevo al mas viejo", () => {
  const e = estado();
  guardarCalculo(e, { fecha: "2026-08-01", nombre_cliente: "Ana" });
  guardarCalculo(e, { fecha: "2026-08-17", nombre_cliente: "Beto" });
  assert.deepEqual(e.datos.calculos_renta.map((c) => c.nombre_cliente), ["Beto", "Ana"]);
  assert.ok(e.sucios.has(ARCHIVO_CALCULOS));
  assert.equal(borrarCalculo(e, 0), true);
  assert.equal(e.datos.calculos_renta.length, 1);
  assert.equal(borrarCalculo(e, 9), false);
});

test("cambiar un ajuste deja el archivo de ajustes para subir", () => {
  const e = estado();
  editarAjustes(e, { tipo_cambio: { usd_uyu: 41.2, fecha: "2026-08-17" } });
  assert.equal(e.datos.ajustes.tipo_cambio.usd_uyu, 41.2);
  assert.ok(e.sucios.has(ARCHIVO_AJUSTES));
});
