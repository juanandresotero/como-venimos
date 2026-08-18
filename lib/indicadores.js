/* Los indicadores del tablero: todo lo que contesta "cómo trabajás", no "cuánto llevás".

   Dos reglas que valen para todo este archivo:

   1. Cada indicador dice SIEMPRE sobre cuántos negocios está hecho (`n`). Con 81 cierres
      en 5 años, cualquier corte fino cae rápido a celdas de uno o dos, y un promedio de
      dos negocios parece un dato cuando es una anécdota. El número de atrás es lo que
      deja leerlo con la desconfianza que merece.

   2. Los años llegan como una lista. `null` o lista vacía quiere decir "todos" — la
      carrera entera. Los indicadores de esta pantalla se leen mejor sobre la carrera que
      sobre el año en curso, justamente por lo de arriba. */

import { mediana, estimacionPorPuntas } from "./salud.js";

const FAMILIA_DE = { venta: "venta", alquiler: "alquiler", renovacion_alquiler: "alquiler" };

const gan = (n) => n.ganancia || 0;
const fac = (n) => n.facturacion || 0;
const familia = (n) => FAMILIA_DE[n.tipo_negocio] || "venta";

export const esCerrado = (n) => n.estado === "cerrado" && Boolean(n.fecha_fin);
export const anioDe = (n) => n.fecha_fin.slice(0, 4);

/* Los años que de verdad tienen cierres. No se inventan los huecos: si no trabajó en un
   año, ese año no aparece como opción para elegir. */
export function aniosDisponibles(negocios) {
  const vistos = new Set();
  for (const n of negocios || []) if (esCerrado(n)) vistos.add(anioDe(n));
  return [...vistos].sort();
}

export function cerradosDe(negocios, anios) {
  const cerrados = (negocios || []).filter(esCerrado);
  if (!anios || !anios.length) return cerrados;
  const set = new Set(anios);
  return cerrados.filter((n) => set.has(anioDe(n)));
}

/* Cómo nombrar el recorte en pantalla, para que ningún número quede sin contexto. */
export function etiquetaDeAnios(anios, disponibles) {
  if (!anios || !anios.length || anios.length === (disponibles || []).length) {
    const lista = disponibles || [];
    return lista.length > 1 ? `${lista[0]}–${lista[lista.length - 1]}` : lista[0] || "";
  }
  const orden = [...anios].sort();
  return orden.length <= 2 ? orden.join(" y ") : `${orden.length} años`;
}

/* ---------- Meses ---------- */

export const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio",
  "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/* Un mes SOLO se puede juzgar si ya terminó en alguno de los años elegidos.

   Sin esto, mirando 2026 en agosto la app diría "tu peor mes es noviembre" — y noviembre
   no llegó todavía. Un cero de un mes que no pasó no es un mal mes, es un mes que no
   existe. Con varios años seleccionados alcanza con que UNO lo haya terminado. */
export function mesTerminado(mes, anios, hoy) {
  const anioHoy = hoy.slice(0, 4);
  const mesHoy = Number(hoy.slice(5, 7));
  const lista = anios && anios.length ? anios : null;
  if (!lista) return true;   // "todos" incluye años viejos: todos los meses ya pasaron
  return lista.some((a) => a < anioHoy || (a === anioHoy && mes < mesHoy));
}

/* Los doce meses con todos los años elegidos sumados encima: todos los eneros juntos,
   todos los febreros juntos. Es lo que pidió el usuario para ver estacionalidad. */
export function mesesDe(negocios, anios, hoy) {
  const filas = MESES.map((nombre, i) => ({
    mes: i + 1, nombre, negocios: 0, facturacion: 0, ganancia: 0,
    terminado: hoy ? mesTerminado(i + 1, anios, hoy) : true,
  }));
  for (const n of cerradosDe(negocios, anios)) {
    const fila = filas[Number(n.fecha_fin.slice(5, 7)) - 1];
    if (!fila) continue;
    fila.negocios += 1;
    fila.facturacion += fac(n);
    fila.ganancia += gan(n);
  }
  return filas;
}

/* Un juego de doce meses por cada año, para poder superponerlos en la misma gráfica. */
export function mesesPorAnio(negocios, anios, hoy) {
  const lista = anios && anios.length ? [...anios].sort() : aniosDisponibles(negocios);
  return lista.map((anio) => ({ anio, meses: mesesDe(negocios, [anio], hoy) }));
}

/* La curva de cómo se va sumando la plata a lo largo del año. Es la vista que más sirve
   contra un objetivo: se ve si vas encaminado mucho antes que en la barra de ritmo. */
export function acumular(meses, campo = "ganancia") {
  let suma = 0;
  return meses.map((m) => {
    suma += m[campo] || 0;
    return { ...m, acumulado: suma };
  });
}

/* Mejor y peor mes, contando solo los meses que ya terminaron.

   El desempate del peor lo pidió el usuario: si hay varios meses en cero, gana el que
   peor viene en la carrera entera, aunque esté mirando un solo año. Sin eso, con cinco
   meses en cero la app elegiría enero solo por estar primero en la lista. */
export function mejorYPeorMes(negocios, anios, hoy, campo = "ganancia") {
  const filas = mesesDe(negocios, anios, hoy).filter((m) => m.terminado);
  if (!filas.length) return { mejor: null, peor: null, evaluados: 0 };

  const historial = mesesDe(negocios, null, hoy);
  const enLaCarrera = (mes) => historial[mes - 1][campo] || 0;

  const mejor = filas.reduce((a, b) => (b[campo] > a[campo] ? b : a));
  const minimo = Math.min(...filas.map((m) => m[campo] || 0));
  const empatados = filas.filter((m) => (m[campo] || 0) === minimo);
  const peor = empatados.reduce((a, b) => (enLaCarrera(b.mes) < enLaCarrera(a.mes) ? b : a));

  return { mejor, peor, evaluados: filas.length, empatadosEnPeor: empatados.length };
}

/* ---------- Barrios ---------- */

const MINIMO_PARA_PROMEDIAR = 3;

/* Tres lecturas distintas del mismo dato, porque cuentan cosas distintas:

     - dónde REPETÍS      (el usuario lo pidió: top 5 por cantidad)
     - dónde entró más PLATA
     - dónde te pagan mejor POR NEGOCIO

   Con sus datos las tres dan barrios distintos, y esa es justamente la gracia: Cerrito es
   donde más trabaja y de los que menos le deja por negocio; el barrio que más plata le
   dio en la carrera fue de un solo negocio. Por eso ninguna fila sale sin su `negocios`
   al lado — "El Pinar · 4.172" invita a mudarse ahí por una casualidad.

   El empate del top 5 (tiene cuatro barrios con 4 negocios cada uno) se rompe por plata. */
export function barrios(negocios, anios) {
  const cerrados = cerradosDe(negocios, anios);
  const mapa = new Map();
  for (const n of cerrados) {
    const nombre = n.barrio || "Sin barrio";
    const fila = mapa.get(nombre) || { nombre, negocios: 0, facturacion: 0, ganancia: 0 };
    fila.negocios += 1;
    fila.facturacion += fac(n);
    fila.ganancia += gan(n);
    mapa.set(nombre, fila);
  }
  const filas = [...mapa.values()].map((f) => ({ ...f, porNegocio: f.ganancia / f.negocios }));

  const porCantidad = [...filas].sort((a, b) => b.negocios - a.negocios || b.ganancia - a.ganancia);
  const porPlata = [...filas].sort((a, b) => b.ganancia - a.ganancia);
  const repetidos = filas.filter((f) => f.negocios >= MINIMO_PARA_PROMEDIAR);

  return {
    total: filas.length,
    unaVez: filas.filter((f) => f.negocios === 1).length,
    repetidos: filas.filter((f) => f.negocios > 1).length,
    top: porCantidad.slice(0, 5),
    masPlata: porPlata[0] || null,
    mejorPorNegocio: [...repetidos].sort((a, b) => b.porNegocio - a.porNegocio)[0] || null,
    minimoParaPromediar: MINIMO_PARA_PROMEDIAR,
    todos: porPlata,
  };
}

/* ---------- De dónde viene la plata ---------- */

export function porOrigen(negocios, anios) {
  const cerrados = cerradosDe(negocios, anios);
  const total = cerrados.reduce((t, n) => t + gan(n), 0);
  const mapa = new Map();
  for (const n of cerrados) {
    const nombre = n.origen_captacion || "Sin dato";
    const fila = mapa.get(nombre) || { nombre, negocios: 0, facturacion: 0, ganancia: 0 };
    fila.negocios += 1;
    fila.facturacion += fac(n);
    fila.ganancia += gan(n);
    mapa.set(nombre, fila);
  }
  return [...mapa.values()]
    .map((f) => ({ ...f, porNegocio: f.ganancia / f.negocios, parte: total ? f.ganancia / total : 0 }))
    .sort((a, b) => b.ganancia - a.ganancia);
}

/* El indicador que no pidió y que más le cambia la lectura del negocio: más de la mitad
   de sus cierres son alquileres y le dejan una quinta parte de la plata. */
export function ventaVsAlquiler(negocios, anios) {
  const cerrados = cerradosDe(negocios, anios);
  const total = cerrados.reduce((t, n) => t + gan(n), 0);
  const armar = (cual) => {
    const lista = cerrados.filter((n) => familia(n) === cual);
    const ganancia = lista.reduce((t, n) => t + gan(n), 0);
    const precios = lista.map((n) => n.precio_operacion).filter(Boolean);
    const puntas = lista.map((n) => n.puntas).filter(Boolean);
    return {
      familia: cual,
      negocios: lista.length,
      facturacion: lista.reduce((t, n) => t + fac(n), 0),
      ganancia,
      porNegocio: lista.length ? ganancia / lista.length : 0,
      parteDeLosNegocios: cerrados.length ? lista.length / cerrados.length : 0,
      parteDeLaPlata: total ? ganancia / total : 0,
      ticket: mediana(precios),
      puntas: puntas.reduce((t, p) => t + p, 0),
      puntasPromedio: puntas.length ? puntas.reduce((t, p) => t + p, 0) / puntas.length : 0,
    };
  };
  const venta = armar("venta");
  const alquiler = armar("alquiler");
  return {
    venta,
    alquiler,
    // Cuántas veces más deja una venta que un alquiler. Con sus datos: casi cinco.
    veces: alquiler.porNegocio ? venta.porNegocio / alquiler.porNegocio : 0,
    puntasTotales: venta.puntas + alquiler.puntas,
  };
}

/* De cuánto dependés: qué parte del año la trajeron los tres mejores negocios.

   Un año que descansa sobre una sola venta grande es frágil, y conviene saberlo en junio
   y no en diciembre. Se mide por año aunque haya varios elegidos, porque la pregunta es
   "¿ese año dependió de poco?", no "¿la carrera dependió de poco?". */
export function concentracion(negocios, anios, cuantos = 3) {
  const lista = anios && anios.length ? [...anios].sort() : aniosDisponibles(negocios);
  return lista.map((anio) => {
    const delAnio = cerradosDe(negocios, [anio]).sort((a, b) => gan(b) - gan(a));
    const total = delAnio.reduce((t, n) => t + gan(n), 0);
    const top = delAnio.slice(0, cuantos).reduce((t, n) => t + gan(n), 0);
    return {
      anio,
      negocios: delAnio.length,
      total,
      top,
      parte: total ? top / total : 0,
      elMejor: delAnio[0] ? gan(delAnio[0]) : 0,
      parteDelMejor: total && delAnio[0] ? gan(delAnio[0]) / total : 0,
      cuantos,
    };
  });
}

/* Lo que hay vivo hoy, agrupado por canal: de dónde va a venir la plata de los próximos
   meses. Mira la cartera y no el historial, así que no depende del año elegido. */
export function carteraPorCanal(cartera, negocios, ajustes) {
  const estimacion = estimacionPorPuntas(negocios || [], ajustes || {});
  const vigente = ((ajustes || {}).categorias || []).find((c) => c.hasta === null) || {};
  const split = vigente.split_pct || 0;

  const negocioDe = new Map();
  for (const n of negocios || []) {
    if (n.estado === "en_curso" && n.entity_id_cartera) negocioDe.set(n.entity_id_cartera, n);
  }

  const mapa = new Map();
  for (const propiedad of Object.values(cartera || {})) {
    if (!propiedad.activa || !propiedad.usar_en_proyeccion) continue;
    const nombre = propiedad.origen_captacion || "Sin dato";
    const suNegocio = negocioDe.get(propiedad.entity_id);
    const como = estimacion[propiedad.operacion === "alquiler" ? "alquiler" : "venta"] || {};
    const estimada = (propiedad.precio || 0) * (como.pct || 0);
    const fila = mapa.get(nombre) || { nombre, propiedades: 0, facturacion: 0, ganancia: 0 };
    fila.propiedades += 1;
    fila.facturacion += suNegocio ? fac(suNegocio) : estimada;
    fila.ganancia += suNegocio ? gan(suNegocio) : estimada * split;
    mapa.set(nombre, fila);
  }
  return [...mapa.values()].sort((a, b) => b.ganancia - a.ganancia);
}

/* Plazos: cuánto tarda desde que empieza a trabajar la propiedad hasta que firma. */
export function plazos(negocios, anios) {
  const dias = (desde, hasta) =>
    Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86400000);
  const cerrados = cerradosDe(negocios, anios);
  const de = (cual, hasta) =>
    mediana(
      cerrados
        .filter((n) => familia(n) === cual && n.fecha_inicio && n[hasta])
        .map((n) => dias(n.fecha_inicio, n[hasta]))
        .filter((d) => d >= 0)
    );
  return {
    venta: de("venta", "fecha_fin"),
    alquiler: de("alquiler", "fecha_fin"),
    boleto: de("venta", "fecha_boleto"),
  };
}
