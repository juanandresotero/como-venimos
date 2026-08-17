/* El motor de plata, en JavaScript. Es el gemelo de negocios/motor.py.

   Existe porque cuando el usuario corrige un negocio en el celular, la facturacion y la
   ganancia tienen que recalcularse ahi mismo. Las dos implementaciones se verifican
   cruzadas: sobre los mismos datos tienen que dar los mismos numeros.

   Las reglas estan en §5 de la especificacion. */

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
    tipo_negocio: "suplencia",
    regimen_comision: "suplencia",
    puntas: 0,
    lado: "ninguna",
  },
  yo_referi: {
    nombre: "Referido que diste",
    grupo: "sin_propiedad",
    explicacion: "Se lo pasaste a otro agente: cobrás el 25% de la comisión.",
    tipo_negocio: "venta",
    regimen_comision: "yo_referi",
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
   es la que decide a que año pertenece, y ponerla sola seria inventar plata cobrada. */
export function plantillaNegocio(atajo, ajustes, hoy) {
  const molde = ATAJOS[atajo];
  if (!molde) throw new Error(`Atajo desconocido: ${atajo}`);
  const yo = nombrePropio(ajustes);
  return {
    tipo_negocio: molde.tipo_negocio,
    regimen_comision: molde.regimen_comision,
    puntas: molde.puntas,
    ...AGENTES_SEGUN_LADO[molde.lado](yo),
    pct_comision_total: pctPorDefecto(molde.tipo_negocio, molde.puntas, ajustes),
    fecha_inicio: hoy,
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
/* `origen_sin_clasificar` y `faltan_agentes` NO están acá a propósito: desde que esos dos
   campos se pueden cargar en la ficha, el aviso lo regenera `revisar()` mirando el dato.
   Si se conservaran tal cual, el pendiente quedaría pegado aunque el usuario lo completara. */
const AVISOS_DEL_IMPORTADOR = new Set([
  "separador_decimal",
  "aritmetica_no_cierra",
  "comision_absurda",
  "recalculo_distinto",
  "firma_inventada",
  "posible_cruce",
]);

const aviso = (tipo, detalle) => ({ tipo, detalle });

/* Recalcula la plata y regenera los avisos de un negocio. Devuelve una copia nueva.

   Es lo que hace que la bandeja de pendientes baje sola: cuando el usuario carga la fecha
   que faltaba, el aviso correspondiente ya no se vuelve a generar. */
export function revisar(negocio, ajustes, hoy) {
  const n = { ...negocio, avisos: [] };

  n.base = base(n.precio_operacion, n.pct_comision_total);

  if (n.fecha_fin && n.fecha_fin >= CORTE) {
    const [categoria] = splitVigente(n.fecha_fin, ajustes);
    const [facturacion, ganancia] = calcular(n.regimen_comision, n.base, n.fecha_fin, ajustes);
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

  // Una firma con fecha futura no ocurrio: por definicion no esta cobrada.
  if (n.fecha_fin && n.fecha_fin > hoy) {
    n.estado = "en_curso";
    n.fecha_fin_estimada = true;
    n.avisos.push(aviso("firma_futura",
      `La firma dice ${n.fecha_fin}, que todavía no llegó, así que no está cobrado.`));
  } else if (n.fecha_fin_estimada && !negocio.entity_id_cartera) {
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

  if (!n.ficha_completa) {
    if (!n.fecha_fin) n.avisos.push(aviso("sin_fecha_fin", "Sin fecha de firma no se sabe a qué año pertenece"));
    if (!n.fecha_inicio) n.avisos.push(aviso("falta_fecha_inicio", "Sin fecha de inicio no se puede medir el plazo"));
    if (n.tipo_negocio === "venta" && !n.fecha_boleto) n.avisos.push(aviso("falta_fecha_boleto", "Falta la fecha del boleto"));
    if (!n.direccion) n.avisos.push(aviso("falta_direccion", "Falta la dirección"));
    if (!n.barrio) n.avisos.push(aviso("falta_barrio", "Falta el barrio"));
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
    if (AVISOS_DEL_IMPORTADOR.has(viejo.tipo)) n.avisos.push(viejo);
  }

  return n;
}
