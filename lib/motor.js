/* El motor de plata, en JavaScript. Es el gemelo de negocios/motor.py.

   Existe porque cuando el usuario corrige un negocio en el celular, la facturacion y la
   ganancia tienen que recalcularse ahi mismo. Las dos implementaciones se verifican
   cruzadas: sobre los mismos datos tienen que dar los mismos numeros.

   Las reglas estan en §5 de la especificacion. */

import {
  regimenDe, origenSegunReferidor, esOrigenDeReferido, normalizarOrigen,
} from "./catalogos.js";
import { sugerencias } from "./cruce.js";

export const REGIMENES = [
  "captacion_mia",
  "ref_martin",
  "ref_otro_colega",
  "yo_referi",
  "suplencia",
];

const FAMILIA = {
  venta: "venta",
  alquiler: "alquiler",
  renovacion_alquiler: "alquiler",
  suplencia: "venta",
};

/* Sin esto la plata sale con colas binarias (1012.5000000000001). */
const plata = (n) => (n === null || n === undefined ? null : Math.round(n * 100) / 100);

export function pctPorDefecto(tipoNegocio, puntas, ajustes) {
  const familia = FAMILIA[tipoNegocio] || tipoNegocio;
  const tabla = (ajustes.defaults_comision || {})[familia];
  if (!tabla) return null;
  return tabla[puntas === 2 ? 2 : 1];
}

/* Quien es "yo" en los campos de agente. El importador del Excel escribio este nombre
   exacto en los 85 negocios; se puede cambiar desde Ajustes. */
export const YO_POR_DEFECTO = "Juan Andrés Otero";
export const OTRO_AGENTE = "Otro";

export const nombrePropio = (ajustes) =>
  ((ajustes || {}).agente || {}).nombre || YO_POR_DEFECTO;

export const esMio = (nombreAgente, ajustes) =>
  Boolean(nombreAgente) && String(nombreAgente).trim() === nombrePropio(ajustes);

/* Una BUSQUEDA es un negocio donde el aviso era de otro y el cliente era tuyo: le
   encontraste vos la propiedad a un comprador o a un inquilino.

   Importa distinguirla porque nunca tiene captacion detras y nunca puede proyectarse
   desde la cartera: no hay aviso tuyo del cual proyectarla. */
/* UNA PROPIEDAD REFERIDA: se la pasaste a otro agente porque vos no la podias trabajar.

   Es el espejo de una busqueda. En una busqueda tenes la punta compradora y el aviso es de
   otro; aca NO TENES NINGUNA PUNTA — la propiedad no es tuya, no esta en tu cartera y el
   negocio lo hace el colega. Lo unico que te toca es el 25% de la comision total de esa
   operacion, sea de una punta o de dos, y de ahi tu split.

   Se reconoce por la marca, no por los agentes: en un referido los agentes son de otra
   oficina y muchas veces ni se saben. */
export const esReferidaMia = (negocio) => Boolean((negocio || {}).yo_referi);

export function esBusqueda(negocio, ajustes) {
  return esMio(negocio.agente_compra, ajustes) && Boolean(negocio.agente_vende)
    && !esMio(negocio.agente_vende, ajustes);
}

/* Qué está contando hoy, dicho en plata. Un aviso que sólo dijera "confirmá las puntas" no
   mueve a nadie; uno que diga "si el comprador lo trajo otro, esto vale la mitad", sí. */
export function comoEstaContando(negocio, ajustes) {
  if (esBusqueda(negocio, ajustes)) {
    return "Está contando 1 punta, la compradora. Confirmalo: si además tenías vos el aviso "
      + "son 2 y la ganancia es el doble.";
  }
  if (negocio.puntas === 2) {
    return "Está contando LAS DOS PUNTAS. Si al comprador lo trajo otro agente es una sola, "
      + "y esta ganancia vale la mitad de lo que dice.";
  }
  if (negocio.puntas === 1) {
    return "Está contando 1 punta. Confirmalo: si los dos lados fueron tuyos son 2 y la "
      + "ganancia es el doble.";
  }
  return "No dice cuántas puntas son, así que este negocio no está sumando ganancia.";
}

/* Las puntas salen de quien puso cada lado. 2 si los dos sos vos, 1 si uno solo. */
export function puntasSegunAgentes(agenteVende, agenteCompra, ajustes) {
  if (!agenteVende && !agenteCompra) return null;
  return (esMio(agenteVende, ajustes) ? 1 : 0) + (esMio(agenteCompra, ajustes) ? 1 : 0);
}

/* Los atajos del alta manual (§7.3). Cada uno deja el negocio listo con su regla de plata
   y con los dos lados puestos, para que el usuario solo cargue precio y fecha.

   El orden refleja para que se usa esta pantalla de verdad: si un negocio hay que cargarlo
   a mano es porque la propiedad NO esta en la cartera, y entonces casi siempre el aviso
   era de otro. Las ventas y alquileres propios quedan al final, para el caso raro de una
   propiedad tuya que el robot nunca vio. */
export const GRUPOS_ATAJOS = [
  {
    clave: "busquedas",
    nombre: "Le encontraste vos la propiedad al cliente",
    apunte: "El aviso era de otro agente. Cobrás una sola punta.",
  },
  {
    clave: "sin_propiedad",
    nombre: "Sin propiedad tuya de por medio",
    apunte: "No hay aviso ni cliente tuyo: cobrás por el trabajo.",
  },
  {
    clave: "mias",
    nombre: "Una propiedad tuya que no está en la cartera",
    apunte: "Lo normal es cargarla desde su ficha en Cartera. Esto es para la que el robot nunca vio.",
  },
];

export const ATAJOS = {
  busqueda: {
    nombre: "Búsqueda",
    grupo: "busquedas",
    explicacion: "Le encontraste la propiedad a un comprador. El aviso era de otro.",
    tipo_negocio: "venta",
    regimen_comision: "captacion_mia",
    puntas: 1,
    lado: "compradora",
  },
  busqueda_alquiler: {
    nombre: "Búsqueda de alquiler",
    grupo: "busquedas",
    explicacion: "Le conseguiste el alquiler a un inquilino. El aviso era de otro.",
    tipo_negocio: "alquiler",
    regimen_comision: "captacion_mia",
    puntas: 1,
    lado: "compradora",
    /* Una busqueda de alquiler se carga RECIEN CUANDO HAY RESERVA: "la cargo solo si consegui
       la reserva del alquiler", dijo Juan. Asi que la fecha que se pone sola es la de la
       reserva, no la de negociacion. */
    reserva_hoy: true,
  },
  suplencia: {
    nombre: "Suplencia",
    grupo: "sin_propiedad",
    explicacion: "Le cubriste una visita a un colega: te llevás el 12,5% y no factura.",
    tipo_negocio: "venta",
    marca: "es_suplencia",
    puntas: 0,
    lado: "ninguna",
    /* La fecha se pone SOLA con el dia de la carga. Una suplencia se anota cuando ya paso:
       si la estas cargando es porque la visita se hizo y la propiedad quedo reservada.
       Y lo que se anota es LA RESERVA, no la negociacion: la negociacion es un estado del
       portal de OTRO agente, que ni ves ni te importa. Lo corrigio Juan. */
    reserva_hoy: true,
  },
  suplencia_alquiler: {
    nombre: "Suplencia de alquiler",
    grupo: "sin_propiedad",
    explicacion: "Le cubriste una visita a un colega: te llevás el 12,5% y no factura.",
    tipo_negocio: "alquiler",
    marca: "es_suplencia",
    puntas: 0,
    lado: "ninguna",
    /* UN ALQUILER VA: publicado -> reservado -> se va del portal. No pasa por negociacion.
       La fecha que se pone sola es la de la RESERVA. */
    reserva_hoy: true,
  },
  yo_referi: {
    nombre: "Propiedad que referiste",
    grupo: "sin_propiedad",
    explicacion: "No la podías trabajar y se la pasaste a un colega: te toca el 25% de la "
      + "comisión total, sea de una punta o de dos.",
    tipo_negocio: "venta",
    marca: "yo_referi",
    /* CERO puntas: no tenes ni la vendedora ni la compradora. El negocio lo hace el colega
       y a vos te toca una tajada del total, no de una punta. */
    puntas: 0,
    lado: "ninguna",
  },
  venta: {
    nombre: "Venta de una propiedad tuya",
    grupo: "mias",
    explicacion: "El aviso era tuyo. Arranca con las dos puntas: si la compradora fue de otro, cambialo.",
    tipo_negocio: "venta",
    regimen_comision: "captacion_mia",
    puntas: 2,
    lado: "ambas",
  },
  alquiler: {
    nombre: "Alquiler de una propiedad tuya",
    grupo: "mias",
    explicacion: "El aviso era tuyo. Arranca con las dos puntas.",
    tipo_negocio: "alquiler",
    regimen_comision: "captacion_mia",
    puntas: 2,
    lado: "ambas",
  },
};

const AGENTES_SEGUN_LADO = {
  compradora: (yo) => ({ agente_vende: OTRO_AGENTE, agente_compra: yo }),
  ambas: (yo) => ({ agente_vende: yo, agente_compra: yo }),
  /* SIN CARGAR, no "Otro". En una suplencia la pregunta es "a quién cubriste" y en un
     referido "a quién se la pasaste": las dos tienen una respuesta concreta que hay que
     poner. Arrancar con "Otro" puesto hace que el campo parezca contestado. */
  ninguna: () => ({ agente_vende: null, agente_compra: null }),
};

/* Un negocio nuevo, vacio pero coherente. La fecha de firma queda SIN cargar a proposito:
   es la que decide a que año pertenece, y ponerla sola seria inventar plata cobrada.

   Con las BUSQUEDAS pasa algo distinto y lo dijo el usuario: la propiedad es de otro
   agente, asi que cuando se publico no le importa ni lo sabe — y la negociacion arranco
   en el momento exacto en que la esta cargando, que es cuando aparecio su comprador. Se
   deja la fecha de publicacion vacia y la de negociacion en hoy. */
export function plantillaNegocio(atajo, ajustes, hoy) {
  const molde = ATAJOS[atajo];
  if (!molde) throw new Error(`Atajo desconocido: ${atajo}`);
  const yo = nombrePropio(ajustes);
  const busqueda = molde.grupo === "busquedas";
  return {
    tipo_negocio: molde.tipo_negocio,
    // Las dos marcas van sueltas: un negocio puede llegar por "Dueño Vende" y despues
    // referirse igual. El regimen sale de las dos cosas juntas, no de una sola casilla.
    es_suplencia: molde.marca === "es_suplencia",
    yo_referi: molde.marca === "yo_referi",
    puntas: molde.puntas,
    ...AGENTES_SEGUN_LADO[molde.lado](yo),
    pct_comision_total: pctPorDefecto(molde.tipo_negocio, molde.puntas, ajustes),
    /* CUANDO SE PUBLICO no siempre importa. En una busqueda el aviso era de otro; en una
       suplencia se cubrio una visita y esa propiedad ni es tuya. Ahi ese dato no se sabe ni
       hace falta. */
    fecha_inicio: busqueda || molde.marca === "es_suplencia" ? null : hoy,
    /* Algunas nacen con la fecha PUESTA en el dia de la carga, porque se anotan cuando ya
       pasaron. La pregunta es CUAL de las dos fechas:

       - una busqueda de VENTA se carga cuando aparecio el comprador -> negociacion
       - una busqueda de ALQUILER se carga cuando ya conseguiste la reserva -> reserva
       - una SUPLENCIA se carga cuando la visita ya se hizo y quedo reservada -> reserva

       Queda editable: si se cargo tarde, se corrige. */
    fecha_negociacion: (busqueda && !molde.reserva_hoy) || molde.negocia_hoy ? hoy : null,
    fecha_boleto: molde.reserva_hoy ? hoy : null,
    fecha_fin: null,
    entity_id_cartera: null,
    direccion: "",
    barrio: "",
    tipo_propiedad: null,
    precio_operacion: null,
    /* LA MONEDA. Un alquiler en Uruguay casi siempre se cobra en pesos y una venta SIEMPRE en
       dolares —"excepto venta que no existe la opcion pesos", Juan— asi que cada uno nace
       como es. En la ficha del alquiler queda como desplegable por si ese es de los otros. */
    moneda: molde.tipo_negocio === "alquiler" ? "UYU" : "USD",
    /* A cuanto estaba el dolar. Se guarda EN EL NEGOCIO, no se mira el de hoy cada vez: un
       alquiler que cobraste en marzo se cobro al dolar de marzo, y que su ganancia en dolares
       se moviera sola cada dia seria mentir sobre lo que entro. */
    tipo_cambio: null,
    origen_captacion: null,
    estado: "en_curso",
    ficha_completa: false,
    /* Nace SIN confirmar: es el acto de una persona mirando el negocio, no un valor por
       defecto. Ver el aviso `revisar_puntas`. */
    puntas_confirmadas: false,
    notas: "",
    manual: true,
    atajo,
  };
}

export function base(precio, pctComision) {
  if (precio === null || precio === undefined) return 0;
  if (pctComision === null || pctComision === undefined) return 0;
  return precio * pctComision;
}

/* Lleva fechas porque si el usuario pasa a ALTO en junio, los negocios de enero a mayo
   tienen que seguir calculandose al 45%. */
export function splitVigente(fecha, ajustes) {
  if (!fecha) return [null, null];
  for (const c of ajustes.categorias || []) {
    if (c.desde && fecha < c.desde) continue;
    if (c.hasta && fecha > c.hasta) continue;
    return [c.categoria, c.split_pct];
  }
  return [null, null];
}

/* Devuelve [facturacion, ganancia]. Si en esa fecha no habia categoria configurada, la
   ganancia vuelve null: significa "no lo recalcules, el numero viene del Excel". */
export function calcular(regimen, baseValor, fechaFin, ajustes, pctReferido) {
  if (!REGIMENES.includes(regimen)) {
    throw new Error(`Régimen de comisión desconocido: ${regimen}`);
  }
  const [, split] = splitVigente(fechaFin, ajustes);

  if (regimen === "suplencia") {
    // Cubrir una visita no pasa por RE/MAX: no factura, y el 12,5% va entero al bolsillo.
    return [0, plata(baseValor * (ajustes.pct_suplencia ?? 0.125))];
  }
  if (regimen === "ref_martin") {
    // Arreglo fijo: no escala con RAP/ALTO/PURO.
    const r = ajustes.regla_martin || { facturacion: 0.5, ganancia: 0.35 };
    return [plata(baseValor * r.facturacion), plata(baseValor * r.ganancia)];
  }
  if (regimen === "captacion_mia") {
    return [plata(baseValor), split === null ? null : plata(split * baseValor)];
  }
  if (regimen === "ref_otro_colega") {
    const resto = ajustes.pct_referido_entrante_otro ?? 0.75;
    return [plata(baseValor), split === null ? null : plata(split * resto * baseValor)];
  }
  /* CUANTO TE TOCA DE LO QUE REFERISTE. Normalmente el 25%, pero se puede acordar otra cosa
     con el colega, asi que el negocio puede traer el suyo y ese manda. */
  const parte = pctReferido ?? ajustes.pct_referido_saliente ?? 0.25;
  const facturacion = baseValor * parte;
  return [plata(facturacion), split === null ? null : plata(split * facturacion)];
}

export const CORTE = "2026-01-01";

/* Avisos que salen de comparar contra el Excel original. La app no tiene con que
   recalcularlos, asi que se conservan tal cual cuando el usuario edita. */
/* Ya no se conserva NINGÚN aviso del importador.

   Eran todos de la forma "tu Excel dice X pero la cuenta da Y". El usuario decidió que ese
   Excel quedó viejo y que la app pasa a ser la fuente de verdad, así que discutir con una
   planilla que no va a volver a abrir es puro ruido en la bandeja. Los números del Excel
   siguen guardados en cada negocio (`excel_facturado`, `excel_importe`) por si algún día
   hay que mirarlos.

   Lo que sí se avisa es lo que se puede arreglar: datos que faltan y contradicciones
   dentro de la app misma. Eso lo genera `revisar()` mirando el dato, no la planilla. */
const AVISOS_DEL_IMPORTADOR = new Set();

const aviso = (tipo, detalle) => ({ tipo, detalle });

/* Recalcula la plata y regenera los avisos de un negocio. Devuelve una copia nueva.

   Es lo que hace que la bandeja de pendientes baje sola: cuando el usuario carga la fecha
   que faltaba, el aviso correspondiente ya no se vuelve a generar. */
/* Un negocio esta EN MARCHA si su propiedad sigue viva en la cartera: publicada, en
   negociacion o reservada. Todavia no se firmo, y eso lo sabe la app sola. */
export function enMarchaSegunCartera(negocio, cartera) {
  const propiedad = (cartera || {})[negocio.entity_id_cartera];
  return Boolean(propiedad && propiedad.activa);
}

/* En que momento del camino esta la propiedad de este negocio. Se guarda junto con la
   marca de "ficha completa" para saber DESDE CUANDO vale esa marca. */
export const FUERA_DE_CARTERA = "fuera_de_cartera";

/* UN NEGOCIO SE PUEDE CAER, y hasta hoy no habia donde decirlo.

   Juan borro la fecha de negociacion de uno para avisar que se habia caido. La app se la
   volvio a poner sola desde la cartera —la propiedad seguia figurando en negociacion en
   RE/MAX— y encima le siguio pidiendo que confirmara las puntas. El aviso de cerrar hasta
   decia "si se cayo, marcalo", prometiendo algo que no existia.

   Un negocio caido no suma en ningun lado (todos los calculos filtran por "en_curso" o
   "cerrado", asi que queda afuera solo), no pide datos y no se le recalcula nada. Pero NO se
   borra: cuantos se caen y en que momento es informacion del negocio, no basura. */
export const CAIDO = "caido";
export const estaCaido = (negocio) => (negocio || {}).estado === CAIDO;

/* LA PROPIEDAD VOLVIO AL MERCADO: estuvo en negociacion o reservada, y hoy esta publicada.

   Este es el dato que la app ya tenia y no usaba. El robot lee el portal todos los dias y
   guarda `fecha_negociacion` la primera vez que entro —no se limpia al salir, a proposito,
   para poder medir plazos— asi que "tiene fecha de negociacion pero hoy figura publicada"
   quiere decir que volvio para atras.

   Juan lo dijo con todas las letras: su primera regla es que la app sea FIEL A LO QUE PASA
   EN EL PORTAL. Si ahi la propiedad volvio a estar publicada, el negocio que estaba en
   negociacion no existe mas, y preguntarselo es preguntarle algo que la app puede ver sola. */
/* LO QUE DEJA DE TENER SENTIDO CUANDO EL NEGOCIO SE CAE.

   Si la propiedad volvio a estar publicada, todo lo que se habia cargado de esa negociacion
   es de una negociacion que no existe mas: a que precio se estaba cerrando, con que comision,
   una punta o dos, y quien habia traido al comprador. Juan lo vio en Juana de Ibarbourou —
   "tuve que borrarlo cuando era obvio que ya no deberia estar cargado".

   Y no es solo prolijidad: mientras esos numeros esten puestos, la proyeccion sigue contando
   una plata que ya no va a entrar.

   NO SE BORRA la direccion, el barrio, cuando se publico ni de donde salio: eso es de la
   PROPIEDAD, no de la negociacion, y sigue siendo verdad. Si manana entra otro comprador, se
   arranca de nuevo pero sobre la misma propiedad. */
export function sinLoDeLaNegociacion(negocio, esUnaBusqueda) {
  const limpio = {
    fecha_negociacion: null,
    fecha_boleto: null,
    precio_operacion: null,
    pct_comision_total: null,
    puntas: null,
    puntas_confirmadas: false,
    facturacion: null,
    ganancia: null,
    // Cuanto bajaste para cerrar ESA negociacion, que no existe mas.
    precio_publicado: null,
    baja_sobre_publicado: null,
  };
  /* EL AGENTE VENDEDOR NO SE TOCA: el aviso sigue siendo tuyo. El que se va es el comprador,
     que era el de ESA negociacion — Juan lo dijo mirando Juana de Ibarbourou.

     Pero en una BUSQUEDA el comprador es tuyo POR DEFINICION, no por esa negociacion: le
     encontraste vos la propiedad. Y en una suplencia o una referida no hay comprador tuyo que
     borrar. En esos tres casos no se toca nada de los agentes. */
  if (!esUnaBusqueda && !negocio.es_suplencia && !negocio.yo_referi) {
    limpio.agente_compra = null;
  }
  return limpio;
}

/* A CUANTO ESTABA PUBLICADA CUANDO ARRANCO LA NEGOCIACION.

   No es lo mismo que el precio de hoy: si la propiedad estuvo seis meses y le bajaste el
   precio dos veces, lo que el comprador negocio fue el precio que VEIA ese dia. Comparar el
   cierre contra el precio de hoy diria que bajaste menos de lo que bajaste.

   El robot guarda cada cambio en `historial_precio`, asi que se puede saber. Sin historial
   —o sin fecha de negociacion— vale el precio actual, que es lo unico que hay. */
export function precioPublicadoAl(propiedad, fecha) {
  if (!propiedad) return null;
  const historial = propiedad.historial_precio || [];
  if (fecha && historial.length) {
    const hasta = historial.filter((h) => h.fecha && h.fecha <= fecha && h.precio);
    if (hasta.length) {
      return hasta.reduce((ultimo, h) => (h.fecha >= ultimo.fecha ? h : ultimo)).precio;
    }
  }
  return propiedad.precio || null;
}

/* CUANTO BAJASTE DEL PUBLICADO PARA CERRAR, en tanto por uno: 0,09 es "cerraste un 9% abajo".

   Se guarda en el negocio porque es un dato del NEGOCIO, no de la propiedad: la propiedad
   puede haber tenido tres negociaciones y cada una haber bajado distinto. Y se guarda en vez
   de calcularse al mirarlo porque el precio publicado se mueve, y el dia que la propiedad se
   va del portal ese numero ya no se podria reconstruir.

   Negativo si cerraste POR ENCIMA del publicado. Pasa, y esconderlo seria mentir. */
export function bajaSobrePublicado(precioCierre, precioPublicado) {
  const cierre = Number(precioCierre);
  const publicado = Number(precioPublicado);
  if (!cierre || !publicado || publicado <= 0) return null;
  return Number(((publicado - cierre) / publicado).toFixed(4));
}

export function volvioAlMercado(propiedad) {
  if (!propiedad || !propiedad.activa) return false;
  if ((propiedad.estado || "publicada") !== "publicada") return false;
  return Boolean(propiedad.fecha_negociacion || propiedad.fecha_reservada);
}

/* Si en este negocio esta pasando algo AHORA.

   Es lo que separa un negocio vivo de una ficha que quedo abierta: hay una negociacion o un
   boleto, o la propiedad esta en negociacion o reservada. Sin nada de eso no hay nada que
   preguntar todavia. */
export function hayAlgoEnMarcha(negocio, propiedad) {
  if (negocio.fecha_negociacion || negocio.fecha_boleto) return true;
  const estado = (propiedad || {}).estado;
  return Boolean(propiedad && propiedad.activa
    && (estado === "en_negociacion" || estado === "reservada"));
}

/* EN QUE MOMENTO ESTA UN NEGOCIO QUE NO CUELGA DE NINGUNA PROPIEDAD.

   Una busqueda, una suplencia o una referida no estan en el portal de Juan: el robot no las
   ve nunca, asi que su estado no puede salir de la cartera. Sale de sus propias fechas, que
   es lo unico que hay.

   Hasta ahora la pantalla de Cartera lo tenia ESCRITO A MANO: una busqueda decia "en
   negociacion" para siempre, aunque le cargara la fecha de la reserva. Lo cazo Juan:
   "le cargue la fecha de cuando quedo reservada y ahora la miro y sigue diciendo en
   negociacion".

   El orden es el del camino, del final para atras: si ya cerro no importa cuando negocio. */
export function momentoDelNegocio(negocio) {
  const n = negocio || {};
  if (estaCaido(n)) return CAIDO;
  if (n.fecha_fin) return "cerrado";
  if (n.fecha_boleto) return "reservada";
  if (n.fecha_negociacion) return "en_negociacion";
  return null;
}

/* DESDE CUANDO ESTA EN ESE MOMENTO. Tiene que ser la fecha del estado que se muestra: si el
   cartel dice "Reservada" y al lado dice "desde 18 ago", se lee "reservada desde el 18", y lo
   que paso el 18 fue que entro en negociacion.

   Lo corrigio Juan: "desde el 18 de agosto esta en negociacion y el 27 de agosto se paso a
   reservada, que no se confunda eso". */
export function desdeCuandoElNegocio(negocio) {
  const n = negocio || {};
  switch (momentoDelNegocio(n)) {
    case "cerrado": return n.fecha_fin || null;
    case "reservada": return n.fecha_boleto || null;
    case "en_negociacion": return n.fecha_negociacion || null;
    default: return null;
  }
}

export function momentoDeLaPropiedad(propiedad) {
  if (!propiedad) return null;
  return propiedad.activa ? propiedad.estado || "publicada" : FUERA_DE_CARTERA;
}

export function revisar(negocio, ajustes, hoy, cartera) {
  const n = { ...negocio, avisos: [] };
  const propiedad = (cartera || {})[n.entity_id_cartera] || null;
  const enMarcha = Boolean(propiedad && propiedad.activa);
  const momento = momentoDeLaPropiedad(propiedad);

  /* Lo que el robot ya vio no se vuelve a pedir: se llena solo.
     Solo rellena lo que esta vacio, nunca pisa lo que el usuario haya cargado. */
  /* UNA BUSQUEDA ES SIEMPRE UNA PUNTA, Y SIEMPRE LA COMPRADORA. Es la definicion: le
     encontraste vos la propiedad a un comprador, el aviso era de otro. No hay nada que
     preguntar ahi, asi que se fija sola y queda confirmada. Lo dijo Juan como regla. */
  if (esBusqueda(n, ajustes)) {
    n.puntas = 1;
    n.puntas_confirmadas = true;
  }

  /* Una suplencia y un referido no tienen puntas tuyas: quedan confirmadas de entrada para
     que nadie las pregunte. */
  if (n.es_suplencia || esReferidaMia(n)) n.puntas_confirmadas = true;

  /* EL ESTADO SIGUE AL PORTAL. Si la propiedad volvio a estar publicada, el negocio se da
     por caido solo; si vuelve a negociacion, revive solo. Es la regla que pidio Juan: la app
     fiel a lo que pasa en RE/MAX, sin preguntarle lo que puede ver.

     `estado_a_mano` lo frena. Cuando el toca el boton de la ficha —en cualquiera de las dos
     direcciones— es una correccion explicita, y una correccion explicita le gana al portal:
     puede haber republicado la propiedad para buscar otro comprador mientras el primero
     define, y eso el portal no lo sabe.

     Con fecha de firma no se toca nada: ya se cobro. */
  if (n.estado !== "cerrado" && !n.estado_a_mano && !n.fecha_fin) {
    const alMercado = volvioAlMercado(propiedad);
    if (alMercado && !estaCaido(n)) {
      n.estado = CAIDO;
      n.se_cayo_solo = true;
      n.fecha_caida = n.fecha_caida || hoy;
      Object.assign(n, sinLoDeLaNegociacion(n, esBusqueda(n, ajustes)));
    } else if (!alMercado && estaCaido(n) && n.se_cayo_solo) {
      n.estado = "en_curso";
      n.se_cayo_solo = false;
    }
  }

  /* A un negocio caido no se le rellena nada desde la cartera. Es justamente el caso que
     rompio: la propiedad seguia en negociacion en RE/MAX, asi que la fecha borrada volvia
     sola en el proximo arranque. */
  if (propiedad && !estaCaido(n)) {
    if (!n.fecha_inicio) {
      n.fecha_inicio = propiedad.fecha_captacion_real && !propiedad.fecha_captacion_estimada
        ? propiedad.fecha_captacion_real
        : propiedad.visto_primera_vez || null;
    }
    if (!n.fecha_negociacion && propiedad.fecha_negociacion) {
      n.fecha_negociacion = propiedad.fecha_negociacion;
    }
    if (!n.fecha_boleto && propiedad.fecha_reservada) {
      n.fecha_boleto = propiedad.fecha_reservada;
    }
    /* La direccion y el barrio TAMBIEN salen de la cartera. Estaban entre los que la app
       pedia teniendolos: si el negocio cuelga de una propiedad, esos datos ya estan ahi.
       Juan: "solo pregunte si por algun motivo no pudo averiguarlo". */
    if (!n.direccion && propiedad.direccion) n.direccion = propiedad.direccion;
    if (!n.barrio && propiedad.barrio) n.barrio = propiedad.barrio;
  }

  /* CUANTO BAJASTE DEL PUBLICADO PARA CERRAR. Se recalcula siempre que se pueda: el precio de
     cierre se edita a mano y el publicado lo mueve el robot, asi que el numero tiene que
     seguirlos. Lo que NO se hace es borrarlo si hoy no se puede calcular — un negocio ya
     cerrado cuya propiedad se fue del portal se quedaria sin el dato para siempre. */
  const publicadoEntonces = precioPublicadoAl(
    propiedad, n.fecha_negociacion || n.fecha_boleto || n.fecha_fin);
  const baja = bajaSobrePublicado(n.precio_operacion, publicadoEntonces);
  if (baja !== null) {
    n.precio_publicado = publicadoEntonces;
    n.baja_sobre_publicado = baja;
  }

  /* Y EL % DE COMISION VUELVE AL DE SIEMPRE si quedo vacio.

     Pasa despues de que un negocio se cae y revive: al caerse se le borra el % —era el de esa
     negociacion— y si nadie lo repusiera, el negocio nuevo arrancaria sin comision y no
     proyectaria un peso. Es el mismo numero con el que nace cualquier negocio. */
  if (!estaCaido(n) && (n.pct_comision_total === null || n.pct_comision_total === undefined)) {
    n.pct_comision_total = pctPorDefecto(n.tipo_negocio, n.puntas, ajustes);
  }

  /* "Ficha completa" quiere decir "ya cargué todo lo que HOY se puede cargar", no "no me
     hables nunca más de este negocio". Cuando la propiedad avanza —pasa a reservada, o se
     va de la cartera— aparecen datos nuevos que antes no existían, y el negocio tiene que
     volver a la bandeja. Por eso la marca se guarda junto al momento en que se puso.

     La marca NO se borra: se deja de aplicar. Si se borrara, el aviso aparecería una sola
     vez y al siguiente repaso se iría solo, sin que el usuario hubiera hecho nada. */
  const marcaVencida = Boolean(
    n.ficha_completa && momento && n.ficha_completa_momento
    && n.ficha_completa_momento !== momento
  );
  n.ficha_vigente = Boolean(n.ficha_completa) && !marcaVencida;

  if (marcaVencida) {
    n.avisos.push(aviso("ficha_reabierta", momento === FUERA_DE_CARTERA
      ? "La propiedad se fue de tu cartera: hay datos nuevos para cargar."
      : `La propiedad pasó a ${momento.replace("_", " ")}: hay datos nuevos para cargar.`));
  }

  /* Lo que se haya cargado en el viejo "Quién te lo refirió" se pasa al origen, que es el
     campo que de verdad mueve la plata. Ese campo se elimino justamente porque preguntaba
     lo mismo que el origen pero no cambiaba ni un peso: se cargaba "Martin Sedes" y la
     comision seguia igual. */
  if (n.referidor) {
    const desdeReferidor = origenSegunReferidor(n.referidor);
    if (desdeReferidor && !esOrigenDeReferido(n.origen_captacion)) {
      n.origen_captacion = desdeReferidor;
    }
    n.referidor = null;
    n.referidor_nombre = null;
  }

  // El Excel escribia los origenes distinto: se traducen al vocabulario de hoy para que
  // el desplegable los encuentre y no aparezca vacio teniendo el dato cargado.
  n.origen_captacion = normalizarOrigen(n.origen_captacion);

  // La regla de comision ya no se carga a mano: sale de como llego el negocio y de si es
  // una suplencia o algo que referiste. Se deriva siempre, para que no se pueda quedar
  // pegada una regla vieja despues de cambiar el origen.
  n.regimen_comision = regimenDe(n);

  /* LA COMISION SE CALCULA EN LA MONEDA EN QUE SE COBRA, Y DE AHI SE PASA A DOLARES.

     `facturacion` y `ganancia` son dolares en toda la app: son los numeros con los que
     RE/MAX te mide y con los que se arman Salud, los escalones y el año. Dejar entrar pesos
     ahi seria sumar 30.000 pesos con 750 dolares sin que nada avise.

     Asi que la conversion pasa UNA sola vez, aca. Lo que se cobro en pesos queda guardado
     igual —la moneda y el tipo de cambio viven en el negocio— para que la cara personal
     pueda meter la plata en la caja que corresponde. */
  n.moneda = n.moneda === "UYU" ? "UYU" : "USD";
  if (n.moneda === "UYU" && !n.tipo_cambio) {
    /* Redondeado a dos decimales: el servicio devuelve 40,134841 y ese sexto decimal no
       cambia nada, solo ensucia la pantalla. */
    const traido = ((ajustes || {}).tipo_cambio || {}).usd_uyu;
    n.tipo_cambio = traido ? Math.round(traido * 100) / 100 : null;
  }
  const aDolares = n.moneda === "UYU" ? Number(n.tipo_cambio) || null : 1;
  n.base = aDolares ? base(n.precio_operacion, n.pct_comision_total) / aDolares : 0;
  if (n.moneda === "UYU" && !aDolares && n.precio_operacion) {
    n.avisos.push(aviso("sin_tipo_de_cambio",
      "Este negocio se cobra en pesos y no hay tipo de cambio cargado, así que no puedo "
      + "pasarlo a dólares. Escribilo en la ficha."));
  }
  /* Que la plata SIEMPRE exista, aunque valga null. Un negocio recien creado no pasa por
     el recalculo (no tiene fecha de firma todavia) y se quedaba sin estos campos: la
     lista mostraba un hueco y las herramientas que los leen se rompian. */
  if (!("facturacion" in n)) n.facturacion = null;
  if (!("ganancia" in n)) n.ganancia = null;

  /* Cuando recalcular la plata:
       - con fecha de firma desde 2026 -> se recalcula con las reglas de esa fecha
       - SIN fecha de firma            -> se recalcula con las reglas de HOY
       - con fecha anterior a 2026     -> no se toca, manda el numero del Excel

     El caso del medio faltaba, y era grave: un negocio en curso no tiene fecha de firma
     todavia, asi que no se recalculaba NUNCA. Se cambiaba el origen a "Ref. Martin", el
     cartel decia la regla de Martin, y los numeros seguian siendo los de antes. */
  const fechaParaLaPlata = n.fecha_fin || hoy;

  /* EN UNA SUPLENCIA MANDA EL MONTO QUE COBRASTE.

     Cubriste la visita de un colega: no facturas nada por RE/MAX, y lo que entra es lo que
     arreglaste con el —un numero que no sale de ningun porcentaje ni de las puntas—. Si lo
     cargaste, ese es el numero y no hay nada que recalcular.

     Juan: "no importa las puntas sino el monto que cobro para sumarlo a mis ganancias. la
     realidad que de ahi no facturo nada a remax".

     Si NO lo cargo, sigue valiendo la cuenta vieja (12,5% de la comision), que es de donde
     salen las suplencias que vinieron del Excel. */
  const cobroDeSuplencia = n.es_suplencia
    && n.cobrado_suplencia !== null && n.cobrado_suplencia !== undefined;
  /* UN NEGOCIO CON LA PLATA ACORDADA A MANO NO SE RECALCULA. Hay operaciones que no salen de
     ningún porcentaje: un colega que devuelve un favor con un monto, un arreglo puntual. Ahí
     lo único que vale es lo facturado y lo que quedó en el bolsillo, y recalcularlo con una
     regla que nunca se aplicó lo rompería. */
  /* UN NEGOCIO CAIDO NO SE RECALCULA. Sin esto, la cuenta corre igual sobre los datos que se
     le acaban de borrar y deja la plata en CERO en vez de vacia: un cero se lee como "este
     negocio dio cero", y lo que paso es que no hubo negocio. */
  if (estaCaido(n)) {
    n.facturacion = null;
    n.ganancia = null;
  } else if (cobroDeSuplencia) {
    n.facturacion = 0;
    // Lo que cobraste tambien puede estar en pesos: se guarda como lo escribiste y se cuenta
    // en dolares, igual que todo lo demas.
    n.ganancia = aDolares ? plata(Number(n.cobrado_suplencia) / aDolares) : null;
    n.recalculado = true;
  } else if (fechaParaLaPlata >= CORTE && !n.plata_acordada) {
    const [categoria] = splitVigente(fechaParaLaPlata, ajustes);
    const [facturacion, ganancia] = calcular(
      n.regimen_comision, n.base, fechaParaLaPlata, ajustes, n.pct_referido);
    n.categoria_vigente = categoria;
    n.recalculado = true;
    n.facturacion = facturacion;
    // Si en esa fecha no hay ninguna categoria configurada, la ganancia sale null. Antes
    // eso se guardaba tal cual y la plata desaparecia sin que nada lo dijera; ahora se
    // conserva la que habia y se avisa, porque el problema esta en Ajustes, no en el
    // negocio. (Paso de verdad al quedar el año 0001 en "desde cuando sos RAP".)
    if (ganancia === null && categoria === null) {
      n.avisos.push(aviso("sin_categoria",
        `El ${n.fecha_fin} no tenés ninguna categoría configurada, así que no se puede `
        + `calcular tu ganancia. Revisá las fechas en Ajustes.`));
    } else {
      n.ganancia = ganancia;
    }
  }

  /* El estado sale de la fecha de firma, no al reves.

     Sin fecha de firma NO hay nada cobrado, por mas que el negocio figurara cerrado. Pasó
     de verdad: al borrar una firma inventada, el negocio quedaba marcado como cerrado y
     sin fecha, que es una contradiccion. */
  if (!n.fecha_fin) {
    /* Un caido se queda caido: sin esto, la regla de "sin firma no hay cierre" lo devolvia
       a en_curso en cada arranque. */
    if (n.estado === "cerrado") n.estado = "en_curso";
    n.fecha_fin_estimada = false;
  } else if (n.fecha_fin > hoy) {
    // Una firma con fecha futura no ocurrio: por definicion no esta cobrada.
    n.estado = "en_curso";
    n.fecha_fin_estimada = true;
    n.avisos.push(aviso("firma_futura",
      `La firma dice ${n.fecha_fin}, que todavía no llegó, así que no está cobrado.`));
  } else if (n.fecha_fin_estimada && !enMarcha) {
    // Se corrigio la fecha y no hay una propiedad viva que lo contradiga.
    n.estado = "cerrado";
    n.fecha_fin_estimada = false;
  }

  if (n.fecha_inicio && n.fecha_boleto && n.fecha_boleto < n.fecha_inicio) {
    n.avisos.push(aviso("fechas_al_reves",
      `El boleto (${n.fecha_boleto}) es anterior al inicio (${n.fecha_inicio})`));
  }
  if (n.fecha_boleto && n.fecha_fin && n.fecha_fin < n.fecha_boleto) {
    n.avisos.push(aviso("fechas_al_reves",
      `La firma (${n.fecha_fin}) es anterior al boleto (${n.fecha_boleto})`));
  }
  /* La reserva antes que la negociacion.

     Pasa sobre todo con las busquedas: la fecha de negociacion se pone sola el dia que se
     carga el negocio, y si te acordaste de cargarlo recien cuando ya estaba reservada,
     queda una reserva anterior a su propia negociacion. Lo dijo el usuario antes de que
     pasara: "capaz me olvide de cargarla y la cargo cuando esta reservada". */
  if (n.fecha_negociacion && n.fecha_boleto && n.fecha_boleto < n.fecha_negociacion) {
    n.avisos.push(aviso("fechas_al_reves",
      `El boleto (${n.fecha_boleto}) es anterior a la negociación (${n.fecha_negociacion})`));
  }

  if (!n.ficha_vigente && !estaCaido(n)) {
    /* Si el negocio TODAVIA no se cerro, pedir la fecha de firma es pedir un dato que la
       app ya sabe que no existe. Lo dijo el usuario mirando Flammarion, que esta en
       negociacion.

       A una BUSQUEDA tampoco se le piden. Una busqueda es un negocio sobre una propiedad
       que no es tuya: no esta en tu cartera, asi que la app no puede saber sola si se
       cerro, y le pedia "sin fecha de firma" a algo que nadie firmo todavia. Es la misma
       razon por la que tampoco se le pide cuando se publico.

       En su lugar aparece como BUSQUEDA EN CURSO, que es lo que de verdad es. El usuario
       quiere verla en la bandeja —es lo unico que no figura en ninguna otra pantalla— pero
       con el nombre correcto. Cuando le carga la fecha de firma, desaparece sola.

       Ojo con la diferencia: una propiedad que SE FUE de la cartera si tiene que pedirlas,
       porque irse casi siempre significa que se vendio. */
    if (esReferidaMia(n) && !n.fecha_fin) {
      /* Una referida se carga a mano y no hay NADA que el robot pueda verificar: la propiedad
         no esta en el portal de Juan. Asi que se pide solo lo que falta, y se acepta que
         todavia no haya entrado en negociacion — puede haberla cargado el dia que la refirio. */
      const falta = [];
      if (!n.referido_a && !n.referido_a_nombre) falta.push("a quién se la referiste");
      if (!n.direccion) falta.push("la dirección");
      if (n.fecha_negociacion && !n.precio_operacion) falta.push("a qué precio se cierra");
      if (falta.length) {
        n.avisos.push(aviso("referida_en_curso",
          `Propiedad referida. Falta ${falta.join(", ")}.`));
      } else if (!n.fecha_negociacion) {
        n.avisos.push(aviso("referida_en_curso",
          "Propiedad referida, todavía sin negociar. Cuando tu colega avise, cargale la fecha "
          + "y el precio."));
      }
    } else if (esBusqueda(n, ajustes) && !n.fecha_fin) {
      /* UNA BUSQUEDA CARGADA YA ESTA EN NEGOCIACION: por eso se cargó. Decírselo es contarle
         lo que él acaba de escribir. Lo dijo Juan.

         Lo que sí falta se pide, y sólo eso: de dónde salió el comprador, quién tiene el
         aviso del otro lado, y a qué precio se está cerrando. Son los tres datos que la app
         no puede ver en ningún lado, porque la propiedad no es suya. */
      const falta = [];
      if (!n.origen_captacion || n.origen_captacion === "Sin origen") falta.push("de dónde salió el comprador");
      if (!n.agente_vende) falta.push("quién tiene el aviso");
      if (!n.precio_operacion) falta.push("a qué precio se cierra");
      if (falta.length) {
        n.avisos.push(aviso("busqueda_en_curso",
          `Búsqueda en curso. Falta ${falta.join(", ")}.`));
      }
    } else if (n.es_suplencia && !n.fecha_fin) {
      /* UNA SUPLENCIA SIN COBRAR. Lo unico que hay que hacer es ponerle la fecha del dia que
         cobraste: hasta que no este, esa plata no cuenta en ningun lado.

         Antes caia en la rama de abajo y le reclamaba tres cosas que en una suplencia NI
         SIQUIERA EXISTEN como campo — cuando se publico y de donde salio, que se sacaron de
         la ficha porque esa propiedad no es tuya y ese cliente no llego a vos. Juan lo vio
         de una: "en el apartado de que falta aca esta todo mal". */
      const falta = [];
      if (n.cobrado_suplencia === null || n.cobrado_suplencia === undefined) {
        falta.push("cuánto cobraste");
      }
      if (!n.agente_vende) falta.push("a quién cubriste");
      if (!n.direccion) falta.push("la dirección");
      n.avisos.push(aviso("suplencia_sin_cobrar", falta.length
        ? `Suplencia sin cobrar. Falta ${falta.join(", ")}, y la fecha de cierre.`
        : "Suplencia sin cobrar. Ponele la fecha de cierre el día que te la paguen."));
    } else if (!enMarcha) {
      if (!n.fecha_fin) n.avisos.push(aviso("sin_fecha_fin", "Sin fecha de firma no se sabe a qué año pertenece"));
      if (n.tipo_negocio === "venta" && !n.fecha_boleto) {
        n.avisos.push(aviso("falta_fecha_boleto", "Falta la fecha de la reserva o boleto"));
      }
    }
    /* NI A UNA BUSQUEDA NI A UNA SUPLENCIA se les pide cuando se publico: el aviso era de
       otro agente, el usuario no tiene ese dato y no le sirve para nada. Tampoco esta el
       campo en la ficha, asi que reclamarlo era pedir algo que no se puede contestar. */
    if (!n.fecha_inicio && !esBusqueda(n, ajustes) && !n.es_suplencia) {
      n.avisos.push(aviso("falta_fecha_inicio", "Sin la fecha en que se publicó no se puede medir el plazo"));
    }
    if (!n.direccion) n.avisos.push(aviso("falta_direccion", "Falta la dirección"));
    if (!n.barrio) n.avisos.push(aviso("falta_barrio", "Falta el barrio"));
    /* Sin el vínculo con la propiedad, la app no sabe que ese negocio ya está en la
       cartera y le sigue pidiendo fechas que todavía no existen. Es lo que pasó con
       Juana de Ibarbourou: el Excel decía "juana de ibarburu" y RE/MAX "Juana de
       Ibarbourou 200", así que nadie los junto. */
    if (!n.entity_id_cartera && cartera) {
      const [mejor] = sugerencias(n, cartera);
      if (mejor) {
        n.avisos.push(aviso("posible_cruce",
          `Puede ser "${mejor.propiedad.direccion}", que está en tu cartera `
          + `(${(mejor.propiedad.estado || "").replace("_", " ")}). Si es la misma, engancharlas.`));
      }
    }

    /* La propiedad se fue de la cartera y el negocio sigue abierto: es el momento en que
       hay que cerrarlo. Es el pendiente más valioso de todos, porque es plata. */
    if (propiedad && !propiedad.activa && n.estado !== "cerrado") {
      const desenlace = propiedad.desenlace_confirmado || propiedad.desenlace_propuesto;
      /* UNA SOLA PREGUNTA: ¿se concretó o se cayó? Lo demás la app lo sabe — la fecha de
         firma es el día que dejó de aparecer, y lo que cobraste sale del precio de cierre
         que ya cargaste cuando pasó a negociación. Las dos quedan editables por si un cierre
         importante cayó corrido de mes. */
      n.avisos.push(aviso("cerrar_negocio",
        `La propiedad se fue de RE/MAX el ${propiedad.fecha_desaparicion}`
        + `${desenlace === "vendida" || desenlace === "alquilada" ? " estando reservada" : ""}`
        + ". ¿Se concretó o se cayó?"));
    }
    /* En una SUPLENCIA las dos cosas de abajo no aplican: los agentes no son puntas tuyas
       —lo que se pregunta es a quien cubriste, y va en su propio aviso— y de donde salio el
       negocio no se pregunta porque no salio de vos. Los dos campos se sacaron de la ficha. */
    if (!n.es_suplencia) {
      if (!n.agente_vende && !n.agente_compra) {
        n.avisos.push(aviso("faltan_agentes",
          "No dice quién tenía el aviso ni quién trajo al comprador: sin eso no se sabe cuántas puntas cobraste"));
      }
      if (!n.origen_captacion || n.origen_captacion === "Sin origen") {
        n.avisos.push(aviso("origen_sin_clasificar",
          "Falta de dónde salió: sin eso no se sabe qué canal te está dando plata"));
      }
    }
  }

  /* UNA PUNTA O DOS: hay que confirmarlo a mano, y hasta entonces se avisa.

     Cuando una propiedad de la cartera pasa a negociación, el negocio nace con Juan de los
     DOS lados —es su propiedad, así que el aviso es suyo— y eso da 2 puntas. Pero el
     comprador casi siempre lo trae otro agente: ahí es 1, y la ganancia proyectada de ese
     negocio vale la MITAD de lo que la app está mostrando.

     Nadie se da cuenta mirando la pantalla, porque un 2 puesto por defecto se ve igual que
     un 2 confirmado. Por eso no alcanza con avisar cuando FALTA el dato: hay que avisar
     hasta que alguien diga que sí. Se apaga en cuanto se toca cualquiera de los dos lados o
     el propio campo de puntas, o con el botón de la ficha.

     VA FUERA DEL BLOQUE DE `ficha_vigente`, a diferencia de todos los demás. "Ficha
     completa" quiere decir "ya cargué todo lo que se puede cargar hoy", y esto no es un dato
     que falte: es un número puesto solo que puede duplicar la plata proyectada. El día que
     se agregó, CUATRO de los seis negocios en curso estaban dados por completos con dos
     puntas sin confirmar — adentro del bloque no se habría visto ninguno.

     SÓLO mientras está EN CURSO: un negocio ya cobrado no hace falta revisarlo, la plata ya
     entró y se sabe cuánta fue. */
  /* UNA COMISION IMPOSIBLE EN UNA VENTA. Un 25% no existe: casi siempre es el PRECIO el que
     esta mal cargado, no el porcentaje.

     Salio de la auditoria del 2026-08-21: `excel-62` dice precio 4.800 con 25% de comision.
     Los 1.200 de facturacion cuadran con 48.000 al 2,5%, asi que lo que falta es un cero en
     el precio. No cambia la plata ya cobrada, pero ensucia el precio promedio, el ticket y
     lo que rinde cada barrio.

     EN LOS ALQUILERES NO APLICA: ahi el "porcentaje" son MESES de comision, y 1,5 quiere
     decir mes y medio. Por eso solo se mira en las ventas.

     El importador ya avisaba de esto, pero el aviso se apago al marcar la ficha completa.
     Este se regenera solo, asi que vuelve mientras el numero siga siendo imposible.

     SALVO QUE LA PLATA ESTE ACORDADA A MANO. Hay negocios que no salen de ningun porcentaje:
     un colega que devuelve un favor con un monto, un arreglo puntual. Ahi el porcentaje no
     significa nada y lo unico que vale es lo facturado y lo que quedo en el bolsillo. Marcar
     `plata_acordada` dice exactamente eso, y de paso protege esos numeros de cualquier
     recalculo futuro. */
  if (n.tipo_negocio === "venta" && n.pct_comision_total > 0.20 && !n.plata_acordada) {
    n.avisos.push(aviso("comision_absurda",
      `Dice ${(n.pct_comision_total * 100).toFixed(0)}% de comisión, que en una venta no `
      + `existe. Con USD ${Math.round(n.facturacion || 0).toLocaleString("es-UY")} `
      + `facturados, al 3% el precio daría `
      + `USD ${Math.round((n.facturacion || 0) / 0.03).toLocaleString("es-UY")} — `
      + "revisá si al precio le falta un cero."));
  }

  /* Se dio por caido solo: hay que DECIRLO. Que los numeros cambien sin que nadie avise es
     peor que preguntar de mas — es la app moviendo plata a espaldas del usuario. */
  if (estaCaido(n) && n.se_cayo_solo) {
    const cuando = (propiedad || {}).fecha_negociacion || "";
    n.avisos.push(aviso("se_cayo_solo",
      "La propiedad volvió a estar publicada en RE/MAX, así que di este negocio por caído y "
      + `dejó de sumar${cuando ? `. Había entrado en negociación el ${cuando}` : ""}. `
      /* QUE DIGA QUE BORRO. Se le borran el precio, la comisión, las puntas y quién trajo al
         comprador: eran de una negociación que no existe más. Si no lo dijera, la próxima vez
         que abra la ficha va a pensar que la app perdió datos. */
      + "Le borré el precio, la comisión, las puntas y quién trajo al comprador: eran de esa "
      + "negociación. Si sigue en marcha, abrilo y avisame."));
  }

  /* Sólo cuando hay algo EN MARCHA. Un negocio que se cayo, o una ficha abierta donde
     todavia no paso nada, no tiene puntas que confirmar: preguntarlo ahi es preguntar por
     algo que la app ya podria saber mirando las fechas y la propiedad. */
  /* En una REFERIDA tampoco se preguntan: no tenes ninguna punta, y las de la operacion las
     pone el colega cuando cierra. */
  /* Y en una SUPLENCIA menos todavía: cubriste una visita. Las puntas de esa operación son
     del colega, no tuyas — vos cobrás el 12,5% y no facturás. */
  if (n.estado === "en_curso" && !n.puntas_confirmadas && hayAlgoEnMarcha(n, propiedad)
      && !esBusqueda(n, ajustes) && !esReferidaMia(n) && !n.es_suplencia) {
    n.avisos.push(aviso("revisar_puntas", comoEstaContando(n, ajustes)));
  }

  // Los avisos que vinieron del Excel se conservan: la app no puede recalcularlos.
  for (const viejo of negocio.avisos || []) {
    if (!AVISOS_DEL_IMPORTADOR.has(viejo.tipo)) continue;
    // "Figura cobrado pero la propiedad sigue viva" deja de tener sentido en cuanto el
    // negocio ya no figura cobrado: si no, el mismo problema se avisa dos veces.
    if (viejo.tipo === "firma_inventada" && n.estado !== "cerrado") continue;
    n.avisos.push(viejo);
  }

  return n;
}
