/* Alta manual de negocios y edicion de propiedades: lo que la app escribe. */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  crearNegocio, borrarNegocio, nuevoId, editarPropiedad, guardarCalculo, borrarCalculo,
  editarAjustes, hayCambios, ARCHIVO_NEGOCIOS, ARCHIVO_MIS_DATOS, ARCHIVO_CALCULOS,
  ARCHIVO_AJUSTES,
} from "../lib/guardado.js";
import {
  ATAJOS, GRUPOS_ATAJOS, plantillaNegocio, esBusqueda, puntasSegunAgentes, esMio,
} from "../lib/motor.js";

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

test("los seis atajos existen, agrupados, y cada uno trae su regla de plata", () => {
  assert.deepEqual(Object.keys(ATAJOS).sort(),
    ["alquiler", "busqueda", "busqueda_alquiler", "suplencia", "venta", "yo_referi"]);
  // La regla de comision ya no se elige a mano: sale del origen mas estas dos marcas.
  assert.equal(ATAJOS.suplencia.marca, "es_suplencia");
  assert.equal(ATAJOS.yo_referi.marca, "yo_referi");
  // Todo atajo tiene que caer en alguno de los grupos que se dibujan, o queda invisible.
  const grupos = new Set(GRUPOS_ATAJOS.map((g) => g.clave));
  for (const [clave, molde] of Object.entries(ATAJOS)) {
    assert.ok(grupos.has(molde.grupo), `el atajo ${clave} está en un grupo que no se dibuja`);
    assert.ok(molde.explicacion, `al atajo ${clave} le falta la explicación`);
  }
});

/* Una BUSQUEDA es aviso ajeno + cliente tuyo: una sola punta, siempre. */
test("una búsqueda arranca con una sola punta y al 3%", () => {
  const p = plantillaNegocio("busqueda", AJUSTES, "2026-08-17");
  assert.equal(p.tipo_negocio, "venta", "una búsqueda de compra sigue siendo una venta");
  assert.equal(p.puntas, 1);
  assert.equal(p.pct_comision_total, 0.03);
  assert.equal(p.agente_compra, "Juan Andrés Otero");
  assert.notEqual(p.agente_vende, "Juan Andrés Otero");
  assert.equal(esBusqueda(p, AJUSTES), true);
  assert.equal(p.fecha_fin, null, "poner la firma sola seria inventar plata cobrada");
  assert.equal(p.estado, "en_curso");
  assert.equal(p.manual, true);
});

test("una búsqueda de alquiler cobra un mes, no dos", () => {
  const p = plantillaNegocio("busqueda_alquiler", AJUSTES, "2026-08-17");
  assert.equal(p.tipo_negocio, "alquiler");
  assert.equal(p.puntas, 1);
  assert.equal(p.pct_comision_total, 1.0);
  assert.equal(esBusqueda(p, AJUSTES), true);
});

/* Una propiedad propia arranca con las dos puntas: es lo que dice su historia
   (22 ventas con dos puntas contra 11 con la compradora de otro). */
test("una venta de propiedad tuya arranca con las dos puntas", () => {
  const p = plantillaNegocio("venta", AJUSTES, "2026-08-17");
  assert.equal(p.puntas, 2);
  assert.equal(p.pct_comision_total, 0.06);
  assert.equal(esBusqueda(p, AJUSTES), false);
});

test("un alquiler de propiedad tuya arranca con dos meses", () => {
  assert.equal(plantillaNegocio("alquiler", AJUSTES, "2026-08-17").pct_comision_total, 2.0);
});

test("una suplencia y un referido que das no tienen ninguna punta tuya", () => {
  for (const atajo of ["suplencia", "yo_referi"]) {
    const p = plantillaNegocio(atajo, AJUSTES, "2026-08-17");
    assert.equal(p.puntas, 0, atajo);
    assert.equal(esBusqueda(p, AJUSTES), false, `${atajo} no es una búsqueda`);
  }
});

test("las puntas salen de quién puso cada lado", () => {
  const yo = "Juan Andrés Otero";
  assert.equal(puntasSegunAgentes(yo, yo, AJUSTES), 2);
  assert.equal(puntasSegunAgentes(yo, "Otro", AJUSTES), 1);
  assert.equal(puntasSegunAgentes("Otro", yo, AJUSTES), 1);
  assert.equal(puntasSegunAgentes("Otro", "Otro REMAX", AJUSTES), 0);
  assert.equal(puntasSegunAgentes(null, null, AJUSTES), null, "sin datos no se inventa");
});

test("el nombre propio se puede cambiar desde Ajustes", () => {
  const otros = { ...AJUSTES, agente: { nombre: "Otra Persona" } };
  assert.equal(esMio("Otra Persona", otros), true);
  assert.equal(esMio("Juan Andrés Otero", otros), false);
  assert.equal(esMio("Juan Andrés Otero", AJUSTES), true, "sin configurar, vale el del Excel");
});

test("un negocio a medio cargar no se toma por búsqueda", () => {
  assert.equal(esBusqueda({ agente_compra: "Juan Andrés Otero" }, AJUSTES), false);
  assert.equal(esBusqueda({}, AJUSTES), false);
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
  assert.equal(nuevo.base, 1800, "el aviso es tuyo: arranca con las dos puntas, dos meses");
});

test("una búsqueda cargada sobre una propiedad ajena factura la mitad", () => {
  const e = estado();
  const propia = crearNegocio(e, "venta", { precio_operacion: 100000 });
  const ajena = crearNegocio(e, "busqueda", { precio_operacion: 100000 });
  assert.equal(propia.base, 6000);
  assert.equal(ajena.base, 3000, "una sola punta sobre el mismo precio");
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
