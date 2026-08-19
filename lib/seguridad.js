/* Qué tan seguro es cada paso del camino, medido con lo que de verdad pasó.

   Los tres números de `probabilidades_cierre` (reservada 0,9 · en negociación 0,6 ·
   publicada 0,25) son una estimación a mano: quieren decir "de cada 10 propiedades que
   llegan acá, tantas terminan cerrando". Uno es 100% seguro y cero es 100% inseguro.

   La idea es que dejen de ser una estimación. Cada vez que una propiedad se va de la
   cartera, el robot anota en qué estado estaba y cómo terminó: si se vendió o alquiló,
   cerró; si se cayó o la retiraron, no. Con esos casos se calcula la proporción real.

   Mientras no haya suficientes, se siguen usando los números cargados. Con dos o tres
   casos la proporción salta de 0% a 100% con una sola propiedad, y un número así es peor
   que el estimado: parece medido y es azar. */

/* Cuántas propiedades tienen que haberse ido de un estado para creerle a la medición.

   Con menos, cada caso mueve el número más de veinte puntos. No es un umbral científico
   — es el punto donde el número empieza a decir algo en vez de rebotar. */
export const MINIMO_PARA_MEDIR = 5;

const CERRO = new Set(["vendida", "alquilada"]);
const NO_CERRO = new Set(["caida", "retirada"]);

/* En plural y a secas. Antes decian "Reservada / firmo la reserva": el nombre del estado
   de UNA propiedad, con su explicacion al lado. Pero la tarjeta no habla de una propiedad
   sino de todas las que pasaron por ese estado, y la explicacion sobraba. */
export const ESTADOS = [
  { clave: "reservada", nombre: "Reservas" },
  { clave: "en_negociacion", nombre: "Negociaciones" },
  { clave: "publicada", nombre: "Publicadas" },
];

/* Cómo terminó una propiedad que ya no está en la cartera.

   Manda lo que el usuario confirmó; si no confirmó nada, lo que propuso el robot. Y si no
   hay ninguno de los dos, el caso no se cuenta: no se puede medir con una incógnita. */
export function comoTermino(propiedad) {
  const desenlace = propiedad.desenlace_confirmado || propiedad.desenlace_propuesto;
  if (CERRO.has(desenlace)) return "cerro";
  if (NO_CERRO.has(desenlace)) return "no_cerro";
  return "sin_saber";
}

/* La proporción real, estado por estado. */
export function medir(cartera, ajustes) {
  const configuradas = (ajustes || {}).probabilidades_cierre || {};
  const cuenta = {};
  for (const e of ESTADOS) cuenta[e.clave] = { cerraron: 0, cayeron: 0, sinSaber: 0 };

  for (const propiedad of Object.values(cartera || {})) {
    // Solo las que YA se fueron: mientras siga viva no se sabe cómo termina.
    if (propiedad.activa) continue;
    const estado = propiedad.estado_al_desaparecer;
    if (!cuenta[estado]) continue;

    const final = comoTermino(propiedad);
    if (final === "cerro") cuenta[estado].cerraron += 1;
    else if (final === "no_cerro") cuenta[estado].cayeron += 1;
    else cuenta[estado].sinSaber += 1;
  }

  return ESTADOS.map((e) => {
    const c = cuenta[e.clave];
    const casos = c.cerraron + c.cayeron;
    const medido = casos ? c.cerraron / casos : null;
    const alcanza = casos >= MINIMO_PARA_MEDIR;
    return {
      ...e,
      configurado: configuradas[e.clave] ?? null,
      medido,
      casos,
      cerraron: c.cerraron,
      cayeron: c.cayeron,
      sin_saber: c.sinSaber,
      alcanza,
      // El que hay que usar hoy: el medido si ya dice algo, el cargado si no.
      usar: alcanza ? medido : (configuradas[e.clave] ?? null),
      faltan: Math.max(0, MINIMO_PARA_MEDIR - casos),
    };
  });
}

/* Si con lo medido conviene cambiar el número cargado, y cuánto.

   Se avisa solo cuando la diferencia es grande — diez puntos o más. Por debajo de eso,
   cambiarlo es perseguir ruido. */
export const DIFERENCIA_QUE_IMPORTA = 0.10;

export function vale_la_pena_ajustar(fila) {
  if (!fila.alcanza || fila.configurado === null || fila.medido === null) return false;
  return Math.abs(fila.medido - fila.configurado) >= DIFERENCIA_QUE_IMPORTA;
}
