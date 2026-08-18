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
export function esBusqueda(negocio, ajustes) {
  return esMio(negocio.agente_compra, ajustes) && Boolean(negocio.agente_vende)
    && !esMio(negocio.agente_vende, ajustes);
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
  },
  suplencia: {
    nombre: "Suplencia",
    grupo: "sin_propiedad",
    explicacion: "Le cubriste una visita a un colega: te llevás el 12,5% y no factura.",
    tipo_negocio: "venta",
    marca: "es_suplencia",
    puntas: 0,
    lado: "ninguna",
  },
  yo_referi: {
    nombre: "Referido que diste",
    grupo: "sin_propiedad",
    explicacion: "Se lo pasaste a otro agente: cobrás el 25% de la comisión.",
    tipo_negocio: "venta",
    marca: "yo_referi",
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
  ninguna: () => ({ agente_vende: OTRO_AGENTE, agente_compra: OTRO_AGENTE }),
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
    fecha_inicio: busqueda ? null : hoy,
    fecha_negociacion: busqueda ? hoy : null,
    fecha_boleto: null,
    fecha_fin: null,
    entity_id_cartera: null,
    direccion: "",
    barrio: "",
    tipo_propiedad: null,
    precio_operacion: null,
    moneda: "USD",
    origen_captacion: null,
    estado: "en_curso",
    ficha_completa: false,
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
export function calcular(regimen, baseValor, fechaFin, ajustes) {
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
  const parte = ajustes.pct_referido_saliente ?? 0.25;
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
  if (propiedad) {
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

  n.base = base(n.precio_operacion, n.pct_comision_total);
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
  if (fechaParaLaPlata >= CORTE) {
    const [categoria] = splitVigente(fechaParaLaPlata, ajustes);
    const [facturacion, ganancia] = calcular(n.regimen_comision, n.base, fechaParaLaPlata, ajustes);
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

  if (!n.ficha_vigente) {
    // Si la propiedad sigue viva en la cartera, el negocio TODAVIA no se firmo: pedir la
    // fecha de firma o la de reserva seria pedir un dato que la app ya sabe que no existe.
    // Lo dijo el usuario mirando Flammarion, que esta en negociacion.
    if (!enMarcha) {
      if (!n.fecha_fin) n.avisos.push(aviso("sin_fecha_fin", "Sin fecha de firma no se sabe a qué año pertenece"));
      if (n.tipo_negocio === "venta" && !n.fecha_boleto) {
        n.avisos.push(aviso("falta_fecha_boleto", "Falta la fecha de la reserva o boleto"));
      }
    }
    /* A una busqueda no se le pide cuando se publico: el aviso era de otro agente, el
       usuario no tiene ese dato y no le sirve para nada. */
    if (!n.fecha_inicio && !esBusqueda(n, ajustes)) {
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
      n.avisos.push(aviso("cerrar_negocio",
        desenlace === "vendida" || desenlace === "alquilada"
          ? `La propiedad se fue de RE/MAX el ${propiedad.fecha_desaparicion} estando `
            + `reservada, así que se cerró. Cargá la fecha de firma y lo que cobraste.`
          : `La propiedad se fue de RE/MAX el ${propiedad.fecha_desaparicion}. `
            + `Si se concretó, cargá la fecha de firma y lo que cobraste; si se cayó, marcalo.`));
    }
    if (!n.agente_vende && !n.agente_compra) {
      n.avisos.push(aviso("faltan_agentes",
        "No dice quién tenía el aviso ni quién trajo al comprador: sin eso no se sabe cuántas puntas cobraste"));
    }
    if (!n.origen_captacion || n.origen_captacion === "Sin origen") {
      n.avisos.push(aviso("origen_sin_clasificar",
        "Falta de dónde salió: sin eso no se sabe qué canal te está dando plata"));
    }
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
