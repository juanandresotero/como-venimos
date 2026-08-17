/* Que la app no pueda mostrar dos verdades distintas del mismo dato.

   "De donde salio" en la propiedad y "como llego" en el negocio son la MISMA pregunta
   vista desde dos pantallas. Este archivo lo verifica sobre los datos de verdad, para que
   si alguna vez se vuelven a separar, falle acá y no lo tenga que ver el usuario. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fusionar, completarConNegocios } from "../lib/cartera.js";
import { revisar } from "../lib/motor.js";
import { editarNegocio, editarPropiedad } from "../lib/guardado.js";

const leer = (nombre) => {
  try {
    return JSON.parse(readFileSync(new URL(`../datos/${nombre}.json`, import.meta.url), "utf8"));
  } catch {
    return nombre === "mis_datos" ? {} : [];
  }
};

/* Como arranca la app: fusiona el overlay, revisa los negocios y completa la cartera. */
function comoLoVeLaApp() {
  const ajustes = leer("ajustes");
  let cartera = fusionar(leer("cartera"), leer("mis_datos"));
  const negocios = leer("negocios").map((n) => revisar(n, ajustes, "2026-08-17", cartera));
  cartera = completarConNegocios(cartera, negocios);
  return { cartera, negocios, ajustes };
}

test("sobre los datos reales, propiedad y negocio dicen el mismo origen", () => {
  const { cartera, negocios } = comoLoVeLaApp();
  for (const n of negocios) {
    const p = cartera[n.entity_id_cartera];
    if (!p || !n.origen_captacion) continue;
    assert.equal(
      p.origen_captacion, n.origen_captacion,
      `${n.id} en "${p.direccion}": la propiedad dice otra cosa que su negocio`
    );
  }
});

test("sobre los datos reales, la fecha de captacion no es posterior a la del negocio", () => {
  const { cartera, negocios } = comoLoVeLaApp();
  for (const n of negocios) {
    const p = cartera[n.entity_id_cartera];
    if (!p || !n.fecha_inicio || !p.fecha_captacion_real) continue;
    assert.ok(
      p.fecha_captacion_real <= n.fecha_inicio,
      `${n.id}: la propiedad dice que se capto DESPUES de que empezo el negocio`
    );
  }
});

/* Y que editar cualquiera de los dos deje a los dos iguales, siempre. */
function estadoDePrueba() {
  const ajustes = leer("ajustes");
  return {
    datos: {
      ajustes,
      cartera: { aaa: { entity_id: "aaa", direccion: "Prueba 100", activa: true,
                        estado: "publicada", origen_captacion: null,
                        fecha_captacion_real: "2026-08-17", fecha_captacion_estimada: true } },
      negocios: [{ id: "n1", entity_id_cartera: "aaa", tipo_negocio: "venta",
                   estado: "en_curso", origen_captacion: null, fecha_inicio: null,
                   fecha_fin: null, precio_operacion: 100000, pct_comision_total: 0.03,
                   puntas: 1, avisos: [] }],
      mis_datos: {},
    },
    hoy: "2026-08-17",
    sucios: new Set(),
  };
}

test("editar el origen en el NEGOCIO deja los dos iguales", () => {
  const e = estadoDePrueba();
  editarNegocio(e, "n1", { origen_captacion: "Dueño Vende" });
  assert.equal(e.datos.cartera.aaa.origen_captacion, "Dueño Vende");
  assert.equal(e.datos.negocios[0].origen_captacion, "Dueño Vende");
});

test("editar el origen en la PROPIEDAD deja los dos iguales", () => {
  const e = estadoDePrueba();
  editarPropiedad(e, "aaa", { origen_captacion: "On mind" });
  assert.equal(e.datos.cartera.aaa.origen_captacion, "On mind");
  assert.equal(e.datos.negocios[0].origen_captacion, "On mind");
});

test("cambiarlo dos veces, una de cada lado, no los separa", () => {
  const e = estadoDePrueba();
  editarNegocio(e, "n1", { origen_captacion: "B.d.r." });
  editarPropiedad(e, "aaa", { origen_captacion: "Cliente antiguo" });
  assert.equal(e.datos.cartera.aaa.origen_captacion, "Cliente antiguo");
  assert.equal(e.datos.negocios[0].origen_captacion, "Cliente antiguo");

  editarNegocio(e, "n1", { origen_captacion: "Ref. Martin" });
  assert.equal(e.datos.cartera.aaa.origen_captacion, "Ref. Martin");
  assert.equal(e.datos.negocios[0].origen_captacion, "Ref. Martin");
});

test("y al volver a abrir la app siguen iguales", () => {
  const e = estadoDePrueba();
  editarNegocio(e, "n1", { origen_captacion: "Ref. Team", fecha_inicio: "2025-03-01" });

  // Se simula cerrar y abrir: se vuelve a armar la cartera desde cero.
  const reabierta = completarConNegocios(
    fusionar({ aaa: { ...e.datos.cartera.aaa } }, e.datos.mis_datos),
    e.datos.negocios
  );
  assert.equal(reabierta.aaa.origen_captacion, "Ref. Team");
  assert.equal(reabierta.aaa.fecha_captacion_real, "2025-03-01");
});
