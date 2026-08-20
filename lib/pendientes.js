/* Convierte los avisos de los negocios y los eventos del robot en una bandeja ordenada.

   El orden importa: lo primero que se ve al abrir la app tiene que ser lo que puede
   significar plata (un cierre detectado), no lo que es puro trabajo administrativo. */

import { PRECIO_NEGOCIADO_VISIBLE } from "./cartera.js";

export const GRUPOS = {
  // Lo primero de todo: un negocio cuya propiedad ya se fue de RE/MAX. Es plata que hay
  // que terminar de cargar, no trabajo administrativo.
  cerrar_negocio: { nombre: "Negocios para cerrar: la propiedad ya no está publicada", orden: 0, urgente: true },
  negocio_duplicado: { nombre: "Dos negocios abiertos sobre la misma propiedad", orden: 1, urgente: true },
  baja: { nombre: "Propiedades que se fueron de tu cartera", orden: 1, urgente: true },
  ficha_reabierta: { nombre: "La propiedad avanzó: hay datos nuevos para cargar", orden: 2, urgente: true },
  falta_precio_negociacion: { nombre: "En negociación: falta a qué precio", orden: 2, urgente: true },
  /* Va arriba y en rojo porque es plata mal contada, no un dato administrativo: un negocio
     con dos puntas cuando es una proyecta el doble de lo que va a entrar. */
  revisar_puntas: { nombre: "Confirmá si es una punta o dos", orden: 2.5, urgente: true },
  firma_inventada: { nombre: "Dados por cobrados, pero la propiedad sigue viva", orden: 3, urgente: true },
  firma_futura: { nombre: "Con fecha de firma en el futuro", orden: 4, urgente: true },
  recalculo_distinto: { nombre: "La cuenta nueva no coincide con tu Excel", orden: 4, urgente: true },
  comision_absurda: { nombre: "Porcentaje de comisión imposible", orden: 5, urgente: true },
  separador_decimal: { nombre: "Coma decimal perdida en el Excel", orden: 6, urgente: true },
  aritmetica_no_cierra: { nombre: "La cuenta no cierra: ¿descuento o error?", orden: 7, urgente: false },
  fechas_al_reves: { nombre: "Fechas dadas vuelta", orden: 8, urgente: false },
  posible_cruce: { nombre: "Puede ser una propiedad de tu cartera", orden: 9, urgente: false },
  /* No es un error: es un negocio abierto del lado del comprador. Va en la bandeja porque
     una busqueda no figura en ninguna otra pantalla —la propiedad no es tuya— y es lo
     unico que se puede olvidar sin que nada lo recuerde. */
  busqueda_en_curso: { nombre: "Búsquedas en curso", orden: 9.5, urgente: false },
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

/* Los avisos que se muestran aunque el negocio este dado por completo. Ver el porque abajo,
   donde se usan. Que sea una lista y no un `if` suelto es para que el proximo caso se
   agregue aca y no repartido por el archivo. */
const ATRAVIESAN_FICHA_COMPLETA = new Set(["revisar_puntas"]);

function comoSeLlama(negocio) {
  return negocio.direccion || negocio.barrio || `Negocio ${negocio.id}`;
}

export function derivar(negocios, eventos, hoy, cartera) {
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

  /* Dos negocios ABIERTOS sobre la misma propiedad casi siempre es un duplicado: se toco
     "cargar otro negocio" sobre uno que ya existia. Que se alquile cinco veces al año es
     normal, pero esos negocios se van cerrando; dos abiertos a la vez, no.

     Esto se mira aca y no en `revisar()` porque hay que ver todos los negocios juntos. */
  const abiertosPorPropiedad = new Map();
  for (const negocio of negocios || []) {
    if (!negocio.entity_id_cartera || negocio.estado === "cerrado") continue;
    const juntos = abiertosPorPropiedad.get(negocio.entity_id_cartera) || [];
    juntos.push(negocio);
    abiertosPorPropiedad.set(negocio.entity_id_cartera, juntos);
  }

  for (const negocio of negocios || []) {
    /* "Ficha completa" es la forma de decir "ya se, no me avises mas" — pero vale solo
       mientras la propiedad no se mueva. `ficha_vigente` lo tiene en cuenta. */
    if (negocio.ficha_vigente ?? negocio.ficha_completa) {
      /* SALVO los que no son "falta un dato" sino "este numero puede estar mal y vale
         plata". "Ficha completa" quiere decir "ya cargue todo lo que se puede cargar hoy",
         y las puntas no faltan: estan puestas con un valor por defecto que puede duplicar
         la ganancia proyectada sin que se note.

         Cuatro de los seis negocios en curso de Juan estaban asi el dia que se agrego este
         aviso: dados por completos, con dos puntas puestas solas y sin confirmar. Si esto
         respetara la marca, no habria visto ninguno. */
      for (const aviso of negocio.avisos || []) {
        if (!ATRAVIESAN_FICHA_COMPLETA.has(aviso.tipo)) continue;
        agregar(aviso.tipo, {
          negocio_id: negocio.id,
          titulo: comoSeLlama(negocio),
          detalle: aviso.detalle,
        });
      }
      continue;
    }

    const hermanos = abiertosPorPropiedad.get(negocio.entity_id_cartera) || [];
    if (hermanos.length > 1) {
      agregar("negocio_duplicado", {
        negocio_id: negocio.id,
        titulo: comoSeLlama(negocio),
        detalle: `Hay ${hermanos.length} negocios abiertos sobre esta misma propiedad. `
          + `Si es uno solo, borrá el que sobra desde su ficha.`,
        fecha: negocio.fecha_fin,
      });
    }

    for (const aviso of negocio.avisos || []) {
      agregar(aviso.tipo, {
        negocio_id: negocio.id,
        titulo: comoSeLlama(negocio),
        detalle: aviso.detalle,
        fecha: negocio.fecha_fin,
      });
    }
  }

  /* Una propiedad que entro en negociacion sin decir a que precio.

     El robot ve que paso a negociacion y anota la fecha, pero el precio que conoce es el
     PUBLICADO — y una oferta aceptada casi nunca es por ese numero. Mientras no se cargue,
     la proyeccion de lo que esta por cerrarse se calcula sobre un precio que ya no existe,
     que es justo donde mas duele equivocarse: es lo que esta mas cerca de entrar. */
  for (const propiedad of Object.values(cartera || {})) {
    if (!propiedad.activa || !PRECIO_NEGOCIADO_VISIBLE.has(propiedad.estado)) continue;
    if (propiedad.precio_negociacion) continue;
    const reservada = propiedad.estado === "reservada";
    const desde = reservada ? propiedad.fecha_reservada : propiedad.fecha_negociacion;
    agregar("falta_precio_negociacion", {
      entity_id: propiedad.entity_id,
      titulo: propiedad.direccion || "Propiedad sin dirección",
      detalle: `${reservada ? "Está reservada" : "Está en negociación"}`
        + `${desde ? ` desde el ${desde}` : ""}`
        + `. Publicada en ${Math.round(propiedad.precio || 0).toLocaleString("es-UY")}`
        + `. ¿A qué precio se está cerrando?`,
      fecha: propiedad.fecha_negociacion || null,
    });
  }

  /* Un aviso que PIDE algo tiene que callarse cuando ese algo ya esta cargado.

     Paso de verdad: Jose Batlle y Ordoñes 2500 seguia pidiendo el origen de la captacion
     con "Ref. Martin" ya puesto, y el usuario tuvo que tocar "Ya lo resolvi" para sacarse
     de encima un aviso que no correspondia. Los avisos del robot se agregaban sin mirar
     nunca si lo que pedian seguia faltando.

     Los otros avisos (cambio de precio, cambio de estado, baja) NO se resuelven solos:
     son noticias, y hay que darlas por vistas a mano. */
  const YA_NO_CORRESPONDE = {
    alta: (p) => Boolean(p && p.origen_captacion),
    carga_inicial: (p) => Boolean(p && p.origen_captacion),
    origen_sin_clasificar: (p) => Boolean(p && p.origen_captacion),
  };

  for (const evento of eventos || []) {
    if (evento.atendido) continue;
    const seResolvio = YA_NO_CORRESPONDE[evento.tipo];
    if (seResolvio && seResolvio((cartera || {})[evento.entity_id])) continue;
    agregar(evento.tipo, {
      eventos: [evento.id],
      entity_id: evento.entity_id,
      titulo: evento.direccion || evento.titulo || "Propiedad",
      detalle: describirEvento(evento),
      fecha: evento.fecha,
    });
  }

  return [...mapa.values()].sort((a, b) => a.orden - b.orden);
}

/* Junta los pendientes que son de la misma propiedad.

   La bandeja agrupa por TIPO de problema, y eso sirve: con cinco propiedades a las que
   les falta el precio de negociacion, verlas juntas es una lista de tareas que se hace
   de corrido. Pero cuando UNA misma propiedad cae en varios grupos, aparece repetida y
   nada dice que las dos entradas llevan a la MISMA pantalla, donde ademas se arreglan
   las dos de una sola vez. Se veia como trabajo doble que no lo era.

   Se juntan SOLO las repetidas. El resto de la bandeja queda intacta.

   Esto es presentacion, no dato: `derivar` sigue devolviendo un pendiente por problema.
   Por eso vive aparte y no adentro de `derivar`. */
function sujeto(item) {
  if (item.negocio_id) return `n:${item.negocio_id}`;
  if (item.entity_id) return `p:${item.entity_id}`;
  return null;
}

export function juntarRepetidos(grupos) {
  const visto = new Map();

  // Los grupos vienen ordenados por urgencia, asi que el que sobrevive es el mas urgente.
  for (const grupo of grupos) {
    for (const item of grupo.items) {
      const clave = sujeto(item);
      if (!clave) continue;
      const antes = visto.get(clave);
      if (!antes) {
        visto.set(clave, { item, grupo });
        continue;
      }
      if (!antes.item.mas) antes.item.mas = [antes.item.detalle];
      antes.item.mas.push(item.detalle);
      // "Ya lo resolvi" tiene que despachar TODOS los avisos que quedaron adentro.
      antes.item.eventos = [...(antes.item.eventos || []), ...(item.eventos || [])];
      item.juntado = true;
    }
  }

  return grupos
    .map((grupo) => ({ ...grupo, items: grupo.items.filter((i) => !i.juntado) }))
    .filter((grupo) => grupo.items.length);
}

/* La bandeja tal cual se muestra. Es la unica puerta: nadie llama a `derivar` por su
   cuenta.

   Existe porque el globito rojo del menu y el "⚠ Atencion N" del titulo contaban lo
   mismo por caminos separados. Al juntar los repetidos, el titulo dijo 3 y el globito
   siguio diciendo 4. Dos cuentas de lo mismo siempre se terminan separando. */
export function bandeja(negocios, eventos, hoy, cartera) {
  return juntarRepetidos(derivar(negocios, eventos, hoy, cartera));
}

export function cuantosPendientes(grupos) {
  return grupos.reduce((total, grupo) => total + grupo.items.length, 0);
}

/* Que se puede hacer con un pendiente.

   Devuelve una LISTA, no una sola accion. Existe por un error concreto: la pantalla
   elegia el boton con un if/else de tres ramas, y un aviso del robot trae sus eventos
   Y TAMBIEN `entity_id`. Como el evento se preguntaba primero, esos avisos ofrecian
   unicamente "Ya lo resolvi" y no habia forma de abrir la propiedad para arreglar lo
   que el aviso estaba senalando. Se veia como un boton que no hace nada.

   Un pendiente puede habilitar dos cosas a la vez: ir a arreglarlo y darlo por visto.
   Son cosas distintas y ninguna reemplaza a la otra. */
export function accionesDe(item) {
  const acciones = [];
  if (item.negocio_id) {
    acciones.push({ tipo: "ficha", destino: item.negocio_id, texto: "Abrir y completar" });
  } else if (item.entity_id) {
    acciones.push({ tipo: "propiedad", destino: item.entity_id, texto: "Ver y editar" });
  }
  if (item.eventos && item.eventos.length) {
    acciones.push({ tipo: "atendido", destino: item.eventos, texto: "Ya lo resolví" });
  }
  return acciones;
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
