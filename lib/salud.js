/* Los calculos del tablero. Funciones puras: entran datos, salen numeros.

   Se usa MEDIANA y no promedio en los ratios: con los datos reales, un par de filas
   con errores de tipeo llevaban el promedio de ganancia sobre precio a 649%, cuando la
   mediana da 1,8%. La mediana es inmune a esos casos. */

import { calcular } from "./motor.js";

export function mediana(numeros) {
  const orden = [...numeros].sort((a, b) => a - b);
  if (!orden.length) return 0;
  const medio = Math.floor(orden.length / 2);
  return orden.length % 2 ? orden[medio] : (orden[medio - 1] + orden[medio]) / 2;
}

export function ratios(negocios) {
  const porTipo = (tipo) => {
    const base = negocios.filter(
      (n) => n.tipo_negocio === tipo && n.precio_operacion && n.facturacion
    );
    if (!base.length) return { fact: 0, gan: 0 };
    return {
      fact: mediana(base.map((n) => n.facturacion / n.precio_operacion)),
      gan: mediana(base.map((n) => (n.ganancia || 0) / n.precio_operacion)),
    };
  };
  return { venta: porTipo("venta"), alquiler: porTipo("alquiler") };
}

const sumar = (lista, campo) => lista.reduce((t, n) => t + (n[campo] || 0), 0);

export function capas(negocios, cartera, ajustes, anio) {
  const delAnio = negocios.filter((n) => n.fecha_fin && n.fecha_fin.slice(0, 4) === anio);
  const cerrados = delAnio.filter((n) => n.estado === "cerrado");
  const enCurso = delAnio.filter((n) => n.estado === "en_curso");

  const r = ratios(negocios);
  const probabilidades = ajustes.probabilidades_cierre || {};

  // Una propiedad con un negocio en curso ya esta contada en la capa 2. Sumarla otra vez
  // en la capa 3 duplicaria la plata.
  const yaContadas = new Set(enCurso.map((n) => n.entity_id_cartera).filter(Boolean));

  const detalle = [];
  let facturacion3 = 0;
  let ganancia3 = 0;
  for (const propiedad of Object.values(cartera || {})) {
    if (!propiedad.activa || !propiedad.usar_en_proyeccion) continue;
    if (yaContadas.has(propiedad.entity_id)) continue;
    const probabilidad = probabilidades[propiedad.estado] || 0;
    const ratio = propiedad.operacion === "alquiler" ? r.alquiler : r.venta;
    const f = propiedad.precio * ratio.fact * probabilidad;
    const g = propiedad.precio * ratio.gan * probabilidad;
    facturacion3 += f;
    ganancia3 += g;
    detalle.push({
      entity_id: propiedad.entity_id,
      direccion: propiedad.direccion,
      estado: propiedad.estado,
      precio: propiedad.precio,
      probabilidad,
      facturacion: f,
      ganancia: g,
    });
  }
  detalle.sort((a, b) => b.facturacion - a.facturacion);

  const capa1 = {
    negocios: cerrados.length,
    facturacion: sumar(cerrados, "facturacion"),
    ganancia: sumar(cerrados, "ganancia"),
  };
  const capa2 = {
    negocios: enCurso.length,
    facturacion: sumar(enCurso, "facturacion"),
    ganancia: sumar(enCurso, "ganancia"),
    detalle: enCurso,
  };
  const capa3 = {
    propiedades: detalle.length,
    facturacion: facturacion3,
    ganancia: ganancia3,
    detalle,
  };

  return {
    capa1,
    capa2,
    capa3,
    ratios: r,
    total: {
      facturacion: capa1.facturacion + capa2.facturacion + capa3.facturacion,
      ganancia: capa1.ganancia + capa2.ganancia + capa3.ganancia,
    },
  };
}

const DIAS_DEL_ANIO = 365;

/* La metrica mas util del tablero: responde "voy bien o voy mal" en un solo numero.

   Usa SOLO la capa 1 (lo cobrado). Ese era justamente el error del Excel: mezclaba plata
   cobrada con plata esperada y mostraba un avance que no existia. */
export function ritmo(cobrado, objetivo, anio, hoy) {
  if (!objetivo) return null;

  const inicio = Date.parse(`${anio}-01-01T00:00:00Z`);
  const ahora = Date.parse(`${hoy}T00:00:00Z`);
  const dia = Math.round((ahora - inicio) / 86400000) + 1;
  const calendario = dia / DIAS_DEL_ANIO;

  const avance = cobrado / objetivo;
  const falta = Math.max(0, objetivo - cobrado);
  const mesesQueQuedan = Math.max(0.1, (DIAS_DEL_ANIO - dia) / 30.4);

  return {
    dia,
    calendario,
    avance,
    aRitmo: avance >= calendario,
    proyeccion: calendario > 0 ? cobrado / calendario : 0,
    falta,
    porMes: falta / mesesQueQuedan,
  };
}

export function porAnio(negocios) {
  const mapa = new Map();
  for (const n of negocios) {
    if (!n.fecha_fin || n.estado !== "cerrado") continue;
    const anio = n.fecha_fin.slice(0, 4);
    const fila = mapa.get(anio) || { anio, negocios: 0, facturacion: 0, ganancia: 0 };
    fila.negocios += 1;
    fila.facturacion += n.facturacion || 0;
    fila.ganancia += n.ganancia || 0;
    mapa.set(anio, fila);
  }
  return [...mapa.values()].sort((a, b) => a.anio.localeCompare(b.anio));
}

/* Los doce meses del año, aunque esten vacios: una grafica con huecos miente menos que
   una que salta de marzo a julio como si fueran consecutivos. */
export function porMes(negocios, anio) {
  const meses = Array.from({ length: 12 }, (_, i) => ({
    mes: i + 1, negocios: 0, facturacion: 0, ganancia: 0,
  }));
  for (const n of negocios || []) {
    if (!n.fecha_fin || n.estado !== "cerrado" || n.fecha_fin.slice(0, 4) !== anio) continue;
    const fila = meses[Number(n.fecha_fin.slice(5, 7)) - 1];
    if (!fila) continue;
    fila.negocios += 1;
    fila.facturacion += n.facturacion || 0;
    fila.ganancia += n.ganancia || 0;
  }
  return meses;
}

/* En que escalon de RE/MAX cae lo facturado y cuanto falta para el siguiente. */
export function nivelRemax(facturacion, niveles) {
  const escala = Object.entries(niveles || {})
    .map(([nombre, monto]) => ({ nombre, monto }))
    .sort((a, b) => a.monto - b.monto);
  let actual = null;
  let siguiente = null;
  for (const nivel of escala) {
    if (facturacion >= nivel.monto) actual = nivel;
    else { siguiente = nivel; break; }
  }
  return {
    actual,
    siguiente,
    falta: siguiente ? siguiente.monto - facturacion : 0,
  };
}

const dias = (desde, hasta) =>
  Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86400000);

function ranking(lista, campo) {
  const mapa = new Map();
  let total = 0;
  for (const n of lista) {
    const nombre = n[campo] || "Sin dato";
    const acumulado = (mapa.get(nombre) || 0) + (n.ganancia || 0);
    mapa.set(nombre, acumulado);
    total += n.ganancia || 0;
  }
  return [...mapa.entries()]
    .map(([nombre, ganancia]) => ({ nombre, ganancia, porcentaje: total ? ganancia / total : 0 }))
    .sort((a, b) => b.ganancia - a.ganancia);
}

export function metricas(negocios, anio) {
  const delAnio = negocios.filter(
    (n) => n.fecha_fin && n.fecha_fin.slice(0, 4) === anio && n.estado === "cerrado"
  );
  const ventas = delAnio.filter((n) => n.tipo_negocio === "venta");
  const alquileres = delAnio.filter((n) => n.tipo_negocio !== "venta");

  const plazos = (lista) =>
    mediana(
      lista.filter((n) => n.fecha_inicio && n.fecha_fin).map((n) => dias(n.fecha_inicio, n.fecha_fin))
    );

  return {
    total: delAnio.length,
    ventas: ventas.length,
    alquileres: alquileres.length,
    ticketVenta: mediana(ventas.map((n) => n.precio_operacion).filter(Boolean)),
    ticketAlquiler: mediana(alquileres.map((n) => n.precio_operacion).filter(Boolean)),
    puntasPromedio: delAnio.length
      ? delAnio.reduce((t, n) => t + (n.puntas || 0), 0) / delAnio.length
      : 0,
    plazoVenta: plazos(ventas),
    plazoAlquiler: plazos(alquileres),
    // De cuando empieza a trabajar la propiedad hasta que firma el boleto: es el plazo
    // que sirve para juzgar si una publicacion esta trabada.
    plazoBoleto: mediana(
      delAnio.filter((n) => n.fecha_inicio && n.fecha_boleto)
        .map((n) => dias(n.fecha_inicio, n.fecha_boleto))
    ),
    barrios: ranking(delAnio, "barrio"),
    origenes: ranking(delAnio, "origen_captacion"),
  };
}

/* Cuanto se gana o se pierde por estar en una categoria y no en otra.

   Se recalcula negocio por negocio y NO sobre el total, porque cada regimen de comision
   reacciona distinto al cambio de tajada: el arreglo con Martin, por ejemplo, es fijo y
   no se mueve; las suplencias tampoco. */
export function comparativaCategorias(negocios, ajustes, anio, hoy) {
  const escalones = ajustes.escalones || [];
  const vigente = (ajustes.categorias || []).find((c) => c.hasta === null);
  const cerrados = negocios.filter(
    (n) => n.fecha_fin && n.fecha_fin.slice(0, 4) === anio && n.estado === "cerrado"
  );
  const mesesCorridos = Math.max(1, Number(hoy.slice(5, 7)));

  // Se arma un juego de ajustes con la tajada que se quiere probar, y se deja que el
  // mismo motor de siempre haga la cuenta. Antes esto repetia las cinco reglas a mano.
  const gananciaCon = (split) => {
    const comoSi = {
      ...ajustes,
      categorias: [{ categoria: "prueba", split_pct: split, desde: "1900-01-01", hasta: null }],
    };
    return cerrados.reduce((total, n) => {
      const [, ganancia] = calcular(n.regimen_comision, n.base || 0, n.fecha_fin, comoSi);
      return total + (ganancia || 0);
    }, 0);
  };

  const filas = escalones.map((e) => {
    const bruto = gananciaCon(e.split_pct);
    return {
      categoria: e.categoria,
      split: e.split_pct,
      fee: e.fee_mensual_usd * mesesCorridos,
      neto: bruto - e.fee_mensual_usd * mesesCorridos,
      actual: vigente ? e.categoria === vigente.categoria : false,
    };
  });

  const actual = filas.find((f) => f.actual);
  const referencia = actual ? actual.neto : 0;
  for (const fila of filas) fila.diferencia = Math.round(fila.neto - referencia);
  return filas;
}
