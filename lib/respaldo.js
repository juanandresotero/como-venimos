/* La copia de seguridad de todo lo que vive SÓLO en el teléfono.

   Los datos del negocio —cartera, negocios, ajustes, cálculos— viven en el repo y se
   respaldan solos: si se borra la app y se vuelve a instalar, se bajan de nuevo. Lo que se
   perdería para siempre es lo otro, lo que nunca sale del aparato:

     la firma                 no está en ningún otro lado
     el historial de cartas   idem
     las cuentas bancarias    no van al repo a propósito: es público
     los gastos personales    idem
     los padrones consultados

   Todo eso se junta en un archivo, y de ese archivo se vuelve.

   LA LLAVE DE GITHUB NO ENTRA. Es una llave, no un dato: un archivo de respaldo termina en
   Descargas, en un mail o en una carpeta compartida, y ahí una llave es una puerta abierta.
   Se vuelve a pegar a mano en Ajustes, que lleva un minuto. */

const PREFIJO = "como-venimos:";

/* Lo que NUNCA se copia. */
const AFUERA = new Set([`${PREFIJO}token`]);

/* Qué es cada cosa, para poder decirlo en pantalla en vez de mostrar nombres internos. */
export const QUE_ES = {
  "como-venimos:carta-firma": "Tu firma",
  "como-venimos:carta-historial": "Historial de cartas oferta",
  "como-venimos:carta-borrador": "La carta oferta a medio hacer",
  "como-venimos:carta-padrones": "Padrones consultados",
  "como-venimos:cuentas": "Cuentas bancarias",
  "como-venimos:personal": "Gastos y saldos personales",
  "como-venimos:tablero": "Preferencias de pantalla",
  "como-venimos:tema": "Modo claro u oscuro",
};

export const VERSION = 1;

const almacen = (deposito) => deposito || globalThis.localStorage;

/* Las claves de la app que hay adentro del teléfono, sin las que no se copian. */
export function clavesGuardadas(deposito) {
  const caja = almacen(deposito);
  if (!caja) return [];
  const claves = [];
  for (let i = 0; i < caja.length; i += 1) {
    const clave = caja.key(i);
    if (clave && clave.startsWith(PREFIJO) && !AFUERA.has(clave)) claves.push(clave);
  }
  return claves.sort();
}

/* Qué hay para copiar, dicho en criollo: sirve para mostrar la lista antes de bajar nada. */
export function queHayGuardado(deposito) {
  return clavesGuardadas(deposito).map((clave) => ({
    clave,
    nombre: QUE_ES[clave] || clave.replace(PREFIJO, ""),
    /* El tamaño da una idea de si de verdad hay algo adentro o es una cáscara vacía. */
    bytes: (almacen(deposito).getItem(clave) || "").length,
  }));
}

export function aTexto(deposito) {
  const caja = almacen(deposito);
  const datos = {};
  for (const clave of clavesGuardadas(deposito)) datos[clave] = caja.getItem(clave);
  return JSON.stringify({ version: VERSION, hecha: null, datos }, null, 1);
}

/* Volver de una copia. Devuelve qué se restauró, o `null` si el archivo no sirve.

   NO se borra lo que no viene en la copia: si el archivo es viejo y no trae la firma, la
   firma que hay se queda. Borrar de más al restaurar es la forma más fácil de convertir un
   respaldo en una pérdida. */
export function desdeTexto(texto, deposito) {
  const caja = almacen(deposito);
  if (!caja) return null;
  let leido;
  try {
    leido = JSON.parse(texto);
  } catch {
    return null;
  }
  if (!leido || typeof leido !== "object" || !leido.datos || typeof leido.datos !== "object") {
    return null;
  }

  const puestas = [];
  for (const [clave, valor] of Object.entries(leido.datos)) {
    /* Sólo lo de esta app, y nunca la llave: un archivo tocado a mano no puede meter una. */
    if (!clave.startsWith(PREFIJO) || AFUERA.has(clave)) continue;
    if (typeof valor !== "string") continue;
    try {
      caja.setItem(clave, valor);
      puestas.push(clave);
    } catch {
      /* Sin lugar para escribir se sigue con las demás: media copia es mejor que ninguna. */
    }
  }
  return puestas.length ? { claves: puestas, version: leido.version || 0 } : null;
}

/* Cómo se llama el archivo. Con la fecha adelante, para que ordenen solos en la carpeta. */
export const nombreDelArchivo = (hoy) => `como-venimos-respaldo-${hoy}.json`;
