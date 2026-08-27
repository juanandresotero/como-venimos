/* Los calculos del tablero. Funciones puras: entran datos, salen numeros.

   Se usa MEDIANA y no promedio en los ratios: con los datos reales, un par de filas
   con errores de tipeo llevaban el promedio de ganancia sobre precio a 649%, cuando la
   mediana da 1,8%. La mediana es inmune a esos casos. */

import { calcular, CAIDO } from "./motor.js";

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

const FAMILIA_DE = { venta: "venta", alquiler: "alquiler", renovacion_alquiler: "alquiler" };

/* Cuánto va a facturar una propiedad que todavía no se vendió.

   Se estima con las PUNTAS PROMEDIO: si en promedio cerrás con 1,61 puntas y una punta
   cobra el 3%, lo esperable de una venta nueva es el 4,84% del precio.

   Antes se usaba la mediana de facturación sobre precio, que es un número empírico pero
   opaco: no se puede verificar mirándolo. Este sale de dos datos que el usuario conoce —
   su comisión de una punta y con cuántas puntas cierra— y da casi lo mismo donde hay
   muchos datos: en alquileres, 1,80 contra una mediana real de 1,7996. */
export function estimacionPorPuntas(negocios, ajustes) {
  const salida = {};
  for (const familia of ["venta", "alquiler"]) {
    const cerrados = (negocios || []).filter(
      (n) => n.estado === "cerrado" && FAMILIA_DE[n.tipo_negocio] === familia && n.puntas
    );
    const puntas = cerrados.length
      ? cerrados.reduce((t, n) => t + n.puntas, 0) / cerrados.length
      : 1;
    const unaPunta = ((ajustes.defaults_comision || {})[familia] || {})[1] || 0;
    salida[familia] = { puntas, unaPunta, pct: unaPunta * puntas, negocios: cerrados.length };
  }
  return salida;
}

/* De dónde sale la plata, en los cuatro momentos del camino:

     COBRADO       lo que ya entró
     RESERVADO     firmó la reserva, falta la escritura
     EN NEGOCIACIÓN hay una oferta sobre la mesa
     PUBLICADO     está a la venta y todavía no se movió

   Los tres últimos van al 100%: la pregunta es "cuánto cobro si esto cierra". La cuenta
   con probabilidades va aparte, en `ponderado`, que es la que sirve para proyectar el año.

   Un negocio EN CURSO no tiene fecha de firma — todavía no firmó. Antes el filtro pedía
   una fecha de firma del año, así que los dejaba a todos afuera y "casi seguro" daba cero
   teniendo propiedades reservadas. */
const GRUPOS_CARTERA = {
  reservada: "reservado",
  en_negociacion: "negociacion",
  publicada: "publicado",
};

export function capas(negocios, cartera, ajustes, anio) {
  const cerrados = (negocios || []).filter(
    (n) => n.estado === "cerrado" && n.fecha_fin && n.fecha_fin.slice(0, 4) === anio
  );
  // Sin fecha de firma es un negocio vivo de hoy; con fecha, tiene que ser de este año.
  const enCurso = (negocios || []).filter(
    (n) => n.estado === "en_curso" && (!n.fecha_fin || n.fecha_fin.slice(0, 4) === anio)
  );

  const r = ratios(negocios);
  const estimacion = estimacionPorPuntas(negocios, ajustes);
  // La tajada de hoy: lo que le quedaria a el si esa propiedad se cerrara ahora.
  const vigente = (ajustes.categorias || []).find((c) => c.hasta === null) || {};
  const split = vigente.split_pct || 0;

  const probabilidades = ajustes.probabilidades_cierre || {};
  const negocioDe = new Map();
  for (const n of enCurso) {
    if (n.entity_id_cartera) negocioDe.set(n.entity_id_cartera, n);
  }

  const grupos = {
    reservado: [],
    negociacion: [],
    publicado: [],
  };

  for (const propiedad of Object.values(cartera || {})) {
    if (!propiedad.activa || !propiedad.usar_en_proyeccion) continue;
    const grupo = GRUPOS_CARTERA[propiedad.estado];
    if (!grupo) continue;

    /* Si ya hay un negocio cargado sobre esa propiedad, manda ESE número: es el precio y
       la comisión de verdad, no una estimación con el ratio histórico. */
    const suNegocio = negocioDe.get(propiedad.entity_id);
    const como = estimacion[propiedad.operacion === "alquiler" ? "alquiler" : "venta"];
    /* Si se cargo a que precio se esta negociando, ESE manda sobre el publicado. Una
       oferta aceptada casi nunca es por el precio de la vidriera, y proyectar sobre el
       publicado infla la cuenta justo en lo que esta mas cerca de cerrarse. */
    const precioReal = propiedad.precio_negociacion || propiedad.precio;
    const facturacionEstimada = precioReal * como.pct;
    grupos[grupo].push({
      entity_id: propiedad.entity_id,
      direccion: propiedad.direccion,
      estado: propiedad.estado,
      precio: precioReal,
      precio_publicado: propiedad.precio,
      negociado: Boolean(propiedad.precio_negociacion),
      probabilidad: probabilidades[propiedad.estado] || 0,
      estimado: !suNegocio,
      // Para poder explicar el numero en pantalla: "3% x 1,61 puntas".
      pct: como.pct,
      puntas: como.puntas,
      unaPunta: como.unaPunta,
      facturacion: suNegocio ? suNegocio.facturacion || 0 : facturacionEstimada,
      ganancia: suNegocio ? suNegocio.ganancia || 0 : facturacionEstimada * split,
    });
  }

  // Un negocio en curso sin propiedad publicada (una búsqueda, por ejemplo) igual está en
  // marcha: va con las negociaciones, que es donde de verdad está.
  for (const n of enCurso) {
    if (n.entity_id_cartera && (cartera || {})[n.entity_id_cartera]) continue;
    grupos.negociacion.push({
      negocio_id: n.id,
      direccion: n.direccion || n.barrio || n.id,
      estado: "en_negociacion",
      precio: n.precio_operacion,
      probabilidad: probabilidades.en_negociacion || 0,
      estimado: false,
      facturacion: n.facturacion || 0,
      ganancia: n.ganancia || 0,
    });
  }

  const resumir = (lista) => {
    lista.sort((a, b) => b.facturacion - a.facturacion);
    return {
      cantidad: lista.length,
      facturacion: lista.reduce((t, x) => t + x.facturacion, 0),
      ganancia: lista.reduce((t, x) => t + x.ganancia, 0),
      detalle: lista,
    };
  };

  const cobrado = {
    negocios: cerrados.length,
    cantidad: cerrados.length,
    facturacion: sumar(cerrados, "facturacion"),
    ganancia: sumar(cerrados, "ganancia"),
    detalle: cerrados,
  };
  const reservado = resumir(grupos.reservado);
  const negociacion = resumir(grupos.negociacion);
  const publicado = resumir(grupos.publicado);

  const juntar = (...partes) => ({
    cantidad: partes.reduce((t, p) => t + p.cantidad, 0),
    facturacion: partes.reduce((t, p) => t + p.facturacion, 0),
    ganancia: partes.reduce((t, p) => t + p.ganancia, 0),
    detalle: partes.flatMap((p) => p.detalle),
  });

  // Con probabilidad de cierre: es la cuenta realista, la que sirve para proyectar.
  const conProbabilidad = (campo) =>
    [reservado, negociacion, publicado].reduce(
      (t, g) => t + g.detalle.reduce((s, x) => s + x[campo] * x.probabilidad, 0), 0
    );

  return {
    cobrado,
    reservado,
    negociacion,
    publicado,
    avanzado: juntar(reservado, negociacion),
    ratios: r,
    /* Lo ENCAMINADO: cobrado + reservado + en negociación. Lo apenas publicado queda
       afuera a proposito — es lo que hay dando vueltas, no lo que esta por entrar, y
       sumarlo con lo demas mezcla dos cosas que se leen distinto. */
    encaminado: {
      facturacion: cobrado.facturacion + reservado.facturacion + negociacion.facturacion,
      ganancia: cobrado.ganancia + reservado.ganancia + negociacion.ganancia,
    },
    total: {
      facturacion: cobrado.facturacion + reservado.facturacion + negociacion.facturacion
        + publicado.facturacion,
      ganancia: cobrado.ganancia + reservado.ganancia + negociacion.ganancia
        + publicado.ganancia,
    },
    ponderado: {
      facturacion: cobrado.facturacion + conProbabilidad("facturacion"),
      ganancia: cobrado.ganancia + conProbabilidad("ganancia"),
    },
    // Nombre viejo, para lo que todavia lo usa.
    capa1: cobrado,
  };
}

const DIAS_DEL_ANIO = 365;

/* Cuanto del año se le fue encima, segun SU historia y no segun el almanaque.

   El año de Juan no es parejo. Contando 2023, 2024 y 2025 —los años completos— el 63% de lo
   que factura cierra en el segundo semestre. Marzo, abril y noviembre son casi vacios;
   agosto y diciembre juntos son mas de un tercio del año. Con una division pareja del
   almanaque, en abril la app le dice que deberia ir por el 33% cuando en sus tres años a
   esa altura llevaba el 20%: lo trata de atrasado cuando va normal.

   Se calcula asi: por cada año completo, que porcentaje de lo que facturo ESE año ya habia
   cerrado a esta altura. Despues se promedia. Cada año pesa igual, para que un año grande no
   mande sobre la forma.

   DOS AÑOS SE DEJAN AFUERA a proposito:
     - el que esta corriendo, que todavia no tiene total contra el cual medir;
     - el PRIMERO de todos, que siempre es parcial — Juan arranco en septiembre de 2022 y ese
       año "cerro" el 100% en el segundo semestre por una razon que no se repite.

   Si no quedan al menos dos años, esto devuelve null y se vuelve al almanaque: con un solo
   año, la "forma" seria la casualidad de ese año. */
export function formaDelAnio(negocios, anioActual) {
  const porAnioLista = new Map();
  for (const n of negocios || []) {
    if (!n || n.estado !== "cerrado" || !n.fecha_fin) continue;
    const anio = Number(String(n.fecha_fin).slice(0, 4));
    if (!anio || anio >= Number(anioActual)) continue;
    const dia = diaDelAnio(n.fecha_fin);
    if (!dia) continue;
    if (!porAnioLista.has(anio)) porAnioLista.set(anio, []);
    porAnioLista.get(anio).push({ dia, plata: Number(n.facturacion) || 0 });
  }

  const anios = [...porAnioLista.keys()].sort((a, b) => a - b);
  if (anios.length >= 2) anios.shift();          // el primero siempre es parcial
  const utiles = anios.filter((a) => porAnioLista.get(a).some((x) => x.plata > 0));
  if (utiles.length < 2) return null;

  return {
    anios: utiles.length,
    /* Que fraccion del año habia cerrado al dia `dia`, en promedio. */
    alDia(dia) {
      let suma = 0;
      for (const anio of utiles) {
        const cierres = porAnioLista.get(anio);
        const total = cierres.reduce((n, x) => n + x.plata, 0);
        if (!total) continue;
        const hasta = cierres.reduce((n, x) => n + (x.dia <= dia ? x.plata : 0), 0);
        suma += hasta / total;
      }
      return suma / utiles.length;
    },
  };
}

/* El dia del año de una fecha ISO, del 1 al 365. */
function diaDelAnio(iso) {
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
  if (!partes) return 0;
  const inicio = Date.UTC(Number(partes[1]), 0, 1);
  const cuando = Date.UTC(Number(partes[1]), Number(partes[2]) - 1, Number(partes[3]));
  return Math.round((cuando - inicio) / 86400000) + 1;
}

/* La metrica mas util del tablero: responde "voy bien o voy mal" en un solo numero.

   Usa SOLO la capa 1 (lo cobrado). Ese era justamente el error del Excel: mezclaba plata
   cobrada con plata esperada y mostraba un avance que no existia. */
export function ritmo(cobrado, objetivo, anio, hoy, forma = null) {
  if (!objetivo) return null;

  const inicio = Date.parse(`${anio}-01-01T00:00:00Z`);
  const ahora = Date.parse(`${hoy}T00:00:00Z`);
  const dia = Math.round((ahora - inicio) / 86400000) + 1;
  const calendario = dia / DIAS_DEL_ANIO;

  /* Lo que se le compara es SU forma del año si la hay, y el almanaque si no. `calendario`
     se sigue devolviendo aparte porque las dos pantallas muestran las dos cosas. */
  const porHistoria = forma ? forma.alDia(dia) : null;
  const esperado = porHistoria === null ? calendario : porHistoria;

  const avance = cobrado / objetivo;
  const falta = Math.max(0, objetivo - cobrado);
  const mesesQueQuedan = Math.max(0.1, (DIAS_DEL_ANIO - dia) / 30.4);

  return {
    dia,
    calendario,
    esperado,
    /* Con cuantos años se calculo la forma. Cero quiere decir "no habia con que". */
    aniosDeHistoria: forma ? forma.anios : 0,
    avance,
    aRitmo: avance >= esperado,
    proyeccion: esperado > 0 ? cobrado / esperado : 0,
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
    ...loQueSeCayo(negocios, anio),
    /* CUANTO BAJAS DEL PUBLICADO PARA CERRAR. Mediana y no promedio, como todo lo de aca: un
       solo negocio con el precio mal cargado corre el promedio y no la mediana. */
    bajaTipica: mediana(
      delAnio.map((n) => n.baja_sobre_publicado).filter((x) => typeof x === "number")),
  };
}

/* CUANTAS NEGOCIACIONES SE TE CAYERON.

   Lo pidió Juan: cuando una propiedad vuelve de negociación o reserva a publicada, ese
   negocio se cayó y "ahí debería de contarlo para estadísticas".

   Es un número que no tenía dónde mirarse y vale la pena: dos agentes con la misma
   facturación no son iguales si uno cierra ocho de diez negociaciones y el otro cinco. El que
   se cae mucho está aceptando ofertas que no se sostienen, o trabajando compradores sin
   crédito aprobado — y eso se arregla antes, no después.

   EL DENOMINADOR SON LOS QUE TERMINARON, cerrados más caídos. Los que siguen en curso no
   entran: todavía no se sabe cómo van a terminar, y meterlos abajo hace que el porcentaje
   parezca mejor cuanto más trabajo abierto tenés, que es al revés de lo que dice. */
function loQueSeCayo(negocios, anio) {
  const delAnio = (fecha) => Boolean(fecha) && fecha.slice(0, 4) === anio;
  const caidos = negocios.filter(
    (n) => n.estado === CAIDO && delAnio(n.fecha_caida || n.fecha_negociacion));
  const cerrados = negocios.filter((n) => n.estado === "cerrado" && delAnio(n.fecha_fin));
  const terminados = caidos.length + cerrados.length;
  return {
    caidos: caidos.length,
    terminados,
    pctCaidos: terminados ? caidos.length / terminados : null,
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
