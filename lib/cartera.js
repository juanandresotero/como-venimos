/* La cartera de propiedades: mezcla lo que escribe el robot con lo que edita el usuario.

   El robot es el unico dueño de datos/cartera.json y la app es la unica dueña de
   datos/mis_datos.json (§3.3). Para que nunca choquen, las ediciones del usuario NO se
   escriben sobre la cartera: se guardan aparte, por entity_id, y se superponen al leer.
   El robot hace lo mismo del otro lado. */

import { normalizarOrigen } from "./catalogos.js";

export const CAMPOS_DEL_USUARIO = [
  "fecha_captacion_real",
  "fecha_captacion_estimada",
  "origen_captacion",
  "desenlace_confirmado",
  "usar_en_proyeccion",
  /* A que precio se esta negociando de verdad. El robot solo ve el precio PUBLICADO, y
     una oferta aceptada casi nunca es por ese numero. Sin esto, la proyeccion de lo que
     esta en negociacion se calcula sobre un precio que ya no existe. */
  "precio_negociacion",
  /* "NO ME CREES EL NEGOCIO DE ESTA". Cuando una propiedad pasa a negociacion, la app le
     estrena el negocio sola (ver lib/nacen-solos.js). Si el usuario lo borra, hay que
     ACORDARSE: sin esto, al abrir la app al dia siguiente vuelve a nacer, y otra vez, y otra
     — borrarlo no serviria de nada. */
  "sin_negocio",
  "notas",
];

export const DESENLACES = [
  ["sigue_activa", "Sigue activa"],
  ["vendida", "Se vendió"],
  ["alquilada", "Se alquiló"],
  ["caida", "Se cayó"],
  ["retirada", "La retiró el dueño"],
];

/* Devuelve una cartera nueva con el overlay del usuario aplicado. No toca los originales. */
export function fusionar(cartera, misDatos) {
  const overlay = (misDatos || {}).cartera || {};
  const salida = {};
  for (const [entityId, fila] of Object.entries(cartera || {})) {
    const mio = overlay[entityId] || {};
    const copia = { ...fila };
    for (const campo of CAMPOS_DEL_USUARIO) {
      if (campo in mio) copia[campo] = mio[campo];
    }
    salida[entityId] = copia;
  }
  return salida;
}

/* Completa cada propiedad con lo que ya esta cargado en sus negocios.

   La sincronia al editar no alcanzaba: los negocios ya tenian la fecha y el origen de
   antes, y como nadie los estaba editando, la propiedad seguia mostrandolos en rojo como
   si faltaran. Esto lo resuelve al abrir la app, mirando lo que hay.

   La fecha de captacion es la MAS VIEJA de sus negocios: una propiedad que se alquila
   tres veces se capto la primera vez, no la ultima. */
export function completarConNegocios(cartera, negocios) {
  const salida = { ...(cartera || {}) };

  /* Se recorre del negocio MAS VIEJO al mas nuevo. La captacion es la del primero, y el
     origen tambien: si una propiedad se alquila tres veces, salio de un solo lado. */
  const enOrden = [...(negocios || [])].sort(
    (a, b) => (a.fecha_inicio || "9999").localeCompare(b.fecha_inicio || "9999")
  );

  const yaTomoOrigen = new Set();
  for (const negocio of enOrden) {
    const propiedad = salida[negocio.entity_id_cartera];
    if (!propiedad) continue;

    const copia = salida[propiedad.entity_id] === propiedad ? { ...propiedad } : propiedad;

    if (negocio.fecha_inicio) {
      const esEstimada = copia.fecha_captacion_estimada !== false;
      if (esEstimada || !copia.fecha_captacion_real || negocio.fecha_inicio < copia.fecha_captacion_real) {
        copia.fecha_captacion_real = negocio.fecha_inicio;
        copia.fecha_captacion_estimada = false;
      }
    }

    /* Cuando los dos tienen origen y NO coinciden, gana el del negocio.

       Pasó de verdad: la propiedad decía "Cliente antiguo" y su negocio "Ref. B.d.r.".
       Gana el del negocio porque es el que decide la comisión — ese tiene que estar bien
       sí o sí. Y editar la propiedad igual lo baja a sus negocios al instante, así que la
       última corrección del usuario sigue mandando. */
    if (negocio.origen_captacion && !yaTomoOrigen.has(propiedad.entity_id)) {
      copia.origen_captacion = normalizarOrigen(negocio.origen_captacion);
      yaTomoOrigen.add(propiedad.entity_id);
    } else {
      copia.origen_captacion = normalizarOrigen(copia.origen_captacion);
    }

    salida[propiedad.entity_id] = copia;
  }
  return salida;
}

/* El estado que se muestra: si esta activa, el de RE/MAX; si no, como termino. */
export function estadoVisible(p) {
  if (p.activa) return p.estado || "publicada";
  return p.desenlace_confirmado || p.desenlace_propuesto || "desaparecida";
}

const NOMBRES_ESTADO = {
  publicada: "Publicada",
  en_negociacion: "En negociación",
  reservada: "Reservada",
  vendida: "Vendida",
  alquilada: "Alquilada",
  caida: "Se cayó",
  retirada: "Retirada",
  sigue_activa: "Sigue activa",
  desaparecida: "Desapareció",
};

export const nombreEstado = (clave) => NOMBRES_ESTADO[clave] || clave;

/* Cuando tiene sentido preguntar a que precio se esta cerrando.

   Desde que entra en negociacion hasta que la propiedad se va de la cartera. Antes era
   SOLO `en_negociacion`, y el campo desaparecia al pasar a reservada — o sea justo cuando
   el numero es mas firme y mas caro de tener mal: una reservada es lo mas cerca que hay de
   cobrar, y la proyeccion se calcula sobre este precio (salud.js). Una propiedad podia
   pasar de negociacion a reservada sin que se lo hubieran cargado nunca, y despues ya no
   habia donde ponerlo ni quien lo pidiera.

   Pasó de verdad con San Fructuoso 1200: reservada, sin precio cargado, proyectando sobre
   los 89.900 publicados. En las seis que si tenian el dato, el precio real vino entre 0% y
   9% por debajo del publicado.

   Vive aca y no en cada pantalla para que la que lo PIDE y la que lo OFRECE no puedan
   discrepar: si se separan, la app pide un dato que no se puede cargar. */
export const PRECIO_NEGOCIADO_VISIBLE = new Set(["en_negociacion", "reservada"]);

export const etiquetaDelPrecioNegociado = (estado) =>
  (estado === "reservada" ? "A qué precio se reservó" : "A qué precio se está negociando");

/* Orden de la lista: primero lo que esta mas cerca de cobrarse. */
const PESO = { reservada: 0, en_negociacion: 1, publicada: 2 };

export function listar(cartera, { archivo = false } = {}) {
  const todas = Object.values(cartera || {});
  const filtradas = todas.filter((p) => (archivo ? !p.activa : p.activa));
  if (archivo) {
    return filtradas.sort((a, b) =>
      (b.fecha_desaparicion || "").localeCompare(a.fecha_desaparicion || "")
    );
  }
  return filtradas.sort((a, b) => {
    const peso = (PESO[a.estado] ?? 3) - (PESO[b.estado] ?? 3);
    return peso || (b.precio || 0) - (a.precio || 0);
  });
}

/* Una propiedad genera muchos negocios (§4.2): puede alquilarse cinco veces y despues
   venderse. Por eso esto devuelve una lista y no un negocio solo. */
export function negociosDe(negocios, entityId) {
  return (negocios || [])
    .filter((n) => n.entity_id_cartera === entityId)
    .sort((a, b) => (b.fecha_fin || "").localeCompare(a.fecha_fin || ""));
}

export function rendimiento(negocios, entityId) {
  const lista = negociosDe(negocios, entityId);
  const cerrados = lista.filter((n) => n.estado === "cerrado");
  return {
    negocios: lista.length,
    cerrados: cerrados.length,
    facturacion: cerrados.reduce((t, n) => t + (n.facturacion || 0), 0),
    ganancia: cerrados.reduce((t, n) => t + (n.ganancia || 0), 0),
  };
}

/* La linea de tiempo de la propiedad: alta -> precios -> negociacion -> reserva -> final. */
export function lineaDeTiempo(p) {
  const hitos = [];
  const poner = (fecha, titulo, detalle) => {
    if (fecha) hitos.push({ fecha, titulo, detalle: detalle || "" });
  };

  poner(
    p.fecha_captacion_real,
    "Captación",
    p.fecha_captacion_estimada ? "fecha estimada — confirmala" : p.origen_captacion || ""
  );
  if (p.visto_primera_vez !== p.fecha_captacion_real) {
    poner(p.visto_primera_vez, "La vio el robot por primera vez");
  }

  const historial = p.historial_precio || [];
  historial.forEach((cambio, i) => {
    if (i === 0) return;   // el primero es el precio de salida, no un cambio
    const antes = historial[i - 1].precio;
    const flecha = cambio.precio < antes ? "bajó" : "subió";
    poner(
      cambio.fecha,
      `El precio ${flecha}`,
      `${Math.round(antes).toLocaleString("es-UY")} → ${Math.round(cambio.precio).toLocaleString("es-UY")} ${cambio.moneda || ""}`.trim()
    );
  });

  poner(p.fecha_negociacion, "Pasó a negociación");
  poner(p.fecha_reservada, "Quedó reservada");
  if (p.fecha_desaparicion) {
    poner(
      p.fecha_desaparicion,
      "Dejó de estar publicada",
      nombreEstado(p.desenlace_confirmado || p.desenlace_propuesto || "desaparecida")
    );
  }

  return hitos.sort((a, b) => a.fecha.localeCompare(b.fecha));
}

/* Desde cuando la tiene. Si el usuario confirmo la fecha de captacion, esa manda: el
   robot empezo a mirar en agosto de 2026 y para todo lo que ya estaba publicado de antes
   `visto_primera_vez` dice "hoy", que es falso y hace parecer nueva a una propiedad que
   lleva ocho meses sin moverse. */
export function desdeCuando(p) {
  if (p.fecha_captacion_real && !p.fecha_captacion_estimada) return p.fecha_captacion_real;
  return p.visto_primera_vez || p.fecha_captacion_real || null;
}

/* Cuantos dias lleva en la cartera (o cuantos estuvo, si ya no esta). */
export function diasEnCartera(p, hoy) {
  const desde = desdeCuando(p);
  if (!desde) return null;
  const hasta = p.activa ? hoy : p.fecha_desaparicion || hoy;
  return Math.round(
    (Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86400000
  );
}
