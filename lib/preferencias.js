/* Lo que el usuario elige MIRAR: años, tipo de gráfica e indicadores del tablero.

   Esto NO va a GitHub y no pasa por la barra de guardado. Es preferencia de pantalla, no
   dato del negocio: si fuera al repo, tocar un año dispararía "cambios sin subir" y le
   llenaría el historial de commits que no dicen nada. Vive en el teléfono. Si un día
   quiere que lo siga entre dispositivos, se muda a mis_datos.json y listo. */

const CLAVE = "como-venimos:tablero";

export const POR_DEFECTO = {
  anios: null,              // null = el año en curso; [] = todos
  graficoMes: "barras",     // barras | linea | acumulado
  graficoAnual: "barras",   // barras | linea
  graficoReparto: "barras", // barras | torta
  /* El ORDEN de esta lista es el orden en que se ven en la pantalla. No hace falta un
     campo aparte para eso: mover una tarjeta es mover su clave de lugar acá. */
  indicadores: ["venta_alquiler", "origenes", "barrios", "meses", "dependencia"],
};

/* Los tipos que tienen sentido para cada gráfica. No hay un menu universal a proposito:
   una torta de doce meses es ilegible y no se ofrece. */
export const TIPOS = {
  graficoMes: [
    { clave: "barras", nombre: "Barras" },
    { clave: "linea", nombre: "Línea" },
    { clave: "acumulado", nombre: "Acumulado" },
  ],
  graficoAnual: [
    { clave: "barras", nombre: "Barras" },
    { clave: "linea", nombre: "Línea" },
  ],
  graficoReparto: [
    { clave: "barras", nombre: "Barras" },
    { clave: "torta", nombre: "Torta" },
  ],
};

/* El catalogo de lo que se puede mirar. `porDefecto` marca los cinco que vienen puestos:
   los que hacen tomar decisiones. El resto esta para cuando haya curiosidad. */
export const INDICADORES = [
  { clave: "venta_alquiler", nombre: "Venta vs alquiler",
    pista: "cuánto te deja cada una", porDefecto: true },
  { clave: "origenes", nombre: "De dónde vino la plata",
    pista: "por canal de captación", porDefecto: true },
  { clave: "barrios", nombre: "Barrios",
    pista: "dónde repetís y dónde te pagan", porDefecto: true },
  { clave: "meses", nombre: "Mejor y peor mes",
    pista: "tu estacionalidad", porDefecto: true },
  { clave: "dependencia", nombre: "De cuánto dependés",
    pista: "qué parte del año la trajeron 3 negocios", porDefecto: true },
  { clave: "cartera_canal", nombre: "Cartera viva por canal",
    pista: "de dónde va a venir lo que viene" },
  { clave: "puntas", nombre: "Puntas y tickets",
    pista: "tu volumen real de trabajo" },
  { clave: "plazos", nombre: "Cuánto tardás en cerrar",
    pista: "de captación a firma" },
];
/* "Tu categoría" salió de acá: vive en Hoy, junto a la facturación del año. Es un dato
   que se mira todos los días para decidir si conviene subir de escalón, no un indicador
   de análisis que se prende cuando hay curiosidad. */

const CLAVES = new Set(INDICADORES.map((i) => i.clave));

/* Todo lo que entra se sanea: una preferencia guardada de una version vieja no puede
   dejar el tablero en blanco ni pedir una grafica que ya no existe. */
export function sanear(crudo) {
  const dato = crudo && typeof crudo === "object" ? crudo : {};
  const tipoValido = (campo) =>
    TIPOS[campo].some((t) => t.clave === dato[campo]) ? dato[campo] : POR_DEFECTO[campo];

  const pedidos = Array.isArray(dato.indicadores)
    ? dato.indicadores.filter((c) => CLAVES.has(c))
    : null;

  return {
    anios: Array.isArray(dato.anios) ? dato.anios.filter((a) => /^\d{4}$/.test(a)) : null,
    graficoMes: tipoValido("graficoMes"),
    graficoAnual: tipoValido("graficoAnual"),
    graficoReparto: tipoValido("graficoReparto"),
    // Una lista vacia es una eleccion legitima: "no me muestres ninguno".
    indicadores: pedidos || [...POR_DEFECTO.indicadores],
  };
}

export function leer(almacen) {
  const deposito = almacen || (typeof localStorage !== "undefined" ? localStorage : null);
  if (!deposito) return sanear(null);
  try {
    return sanear(JSON.parse(deposito.getItem(CLAVE) || "{}"));
  } catch {
    return sanear(null);
  }
}

export function guardar(preferencias, almacen) {
  const deposito = almacen || (typeof localStorage !== "undefined" ? localStorage : null);
  const limpio = sanear(preferencias);
  if (deposito) {
    try {
      deposito.setItem(CLAVE, JSON.stringify(limpio));
    } catch {
      // Sin lugar para guardar la app tiene que seguir andando igual.
    }
  }
  return limpio;
}

/* Sube o baja un indicador en la lista. Devuelve una lista nueva: mutar la que vino haria
   que el redibujado dependa del orden en que se llamen las cosas. */
export function mover(indicadores, clave, salto) {
  const lista = [...(indicadores || [])];
  const desde = lista.indexOf(clave);
  if (desde === -1) return lista;
  const hasta = Math.max(0, Math.min(lista.length - 1, desde + salto));
  if (hasta === desde) return lista;
  lista.splice(desde, 1);
  lista.splice(hasta, 0, clave);
  return lista;
}

/* Todos prendidos, en el orden del catalogo. */
export const todos = () => INDICADORES.map((i) => i.clave);
