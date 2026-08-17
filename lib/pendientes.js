/* Convierte los avisos de los negocios y los eventos del robot en una bandeja ordenada.

   El orden importa: lo primero que se ve al abrir la app tiene que ser lo que puede
   significar plata (un cierre detectado), no lo que es puro trabajo administrativo. */

export const GRUPOS = {
  baja: { nombre: "Propiedades que se fueron de tu cartera", orden: 1, urgente: true },
  firma_inventada: { nombre: "Dados por cobrados, pero la propiedad sigue viva", orden: 2, urgente: true },
  firma_futura: { nombre: "Con fecha de firma en el futuro", orden: 3, urgente: true },
  recalculo_distinto: { nombre: "La cuenta nueva no coincide con tu Excel", orden: 4, urgente: true },
  comision_absurda: { nombre: "Porcentaje de comisión imposible", orden: 5, urgente: true },
  separador_decimal: { nombre: "Coma decimal perdida en el Excel", orden: 6, urgente: true },
  aritmetica_no_cierra: { nombre: "La cuenta no cierra: ¿descuento o error?", orden: 7, urgente: false },
  fechas_al_reves: { nombre: "Fechas dadas vuelta", orden: 8, urgente: false },
  posible_cruce: { nombre: "Puede ser una propiedad de tu cartera", orden: 9, urgente: false },
  alta: { nombre: "Propiedades nuevas sin origen", orden: 10, urgente: false },
  carga_inicial: { nombre: "Propiedades que hay que completar", orden: 11, urgente: false },
  posible_duplicado: { nombre: "¿Publicaste la misma propiedad dos veces?", orden: 12, urgente: false },
  origen_sin_clasificar: { nombre: "Sin clasificar de dónde salió", orden: 13, urgente: false },
  faltan_agentes: { nombre: "Sin agente vendedor ni comprador", orden: 14, urgente: false },
  sin_fecha_fin: { nombre: "Sin fecha de firma", orden: 15, urgente: false },
  falta_fecha_boleto: { nombre: "Sin fecha de boleto", orden: 16, urgente: false },
  falta_fecha_inicio: { nombre: "Sin fecha de inicio", orden: 17, urgente: false },
  falta_direccion: { nombre: "Sin dirección", orden: 18, urgente: false },
  falta_barrio: { nombre: "Sin barrio", orden: 19, urgente: false },
  cambio_precio: { nombre: "Cambios de precio", orden: 20, urgente: false },
  cambio_estado: { nombre: "Cambios de estado", orden: 21, urgente: false },
  reaparecio: { nombre: "Volvieron a aparecer", orden: 22, urgente: false },
};

const OTRO = { nombre: "Otros", orden: 99, urgente: false };

function comoSeLlama(negocio) {
  return negocio.direccion || negocio.barrio || `Negocio ${negocio.id}`;
}

export function derivar(negocios, eventos, hoy) {
  const mapa = new Map();

  const agregar = (clave, item) => {
    const config = GRUPOS[clave] || OTRO;
    if (!mapa.has(clave)) {
      mapa.set(clave, {
        clave,
        nombre: config.nombre,
        orden: config.orden,
        urgente: config.urgente,
        items: [],
      });
    }
    mapa.get(clave).items.push(item);
  };

  for (const negocio of negocios || []) {
    // "Ficha completa" es la forma que tiene el usuario de decir "ya se, no me avises mas".
    if (negocio.ficha_completa) continue;
    for (const aviso of negocio.avisos || []) {
      agregar(aviso.tipo, {
        negocio_id: negocio.id,
        titulo: comoSeLlama(negocio),
        detalle: aviso.detalle,
        fecha: negocio.fecha_fin,
      });
    }
  }

  for (const evento of eventos || []) {
    if (evento.atendido) continue;
    agregar(evento.tipo, {
      evento_id: evento.id,
      entity_id: evento.entity_id,
      titulo: evento.direccion || evento.titulo || "Propiedad",
      detalle: describirEvento(evento),
      fecha: evento.fecha,
    });
  }

  return [...mapa.values()].sort((a, b) => a.orden - b.orden);
}

function describirEvento(evento) {
  const d = evento.detalle || {};
  switch (evento.tipo) {
    case "baja":
      return d.desenlace_propuesto === "vendida"
        ? "Estaba reservada y desapareció. Lo más probable es que se haya vendido."
        : "Desapareció de RE/MAX. ¿Se cayó o se vendió igual?";
    case "cambio_precio":
      return `${Math.round(d.antes).toLocaleString("es-UY")} → ${Math.round(d.ahora).toLocaleString("es-UY")} ${d.moneda || ""}`.trim();
    case "cambio_estado":
      return `Pasó de ${(d.antes || "").replace("_", " ")} a ${(d.ahora || "").replace("_", " ")}`;
    case "posible_duplicado":
      return "Misma dirección y mismo precio que otra. ¿Es la misma publicada dos veces?";
    case "carga_inicial":
    case "alta":
      return "Falta cargar de dónde salió la captación.";
    default:
      return evento.titulo || "";
  }
}
