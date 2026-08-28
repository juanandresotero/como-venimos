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

   TRES COSAS NO ENTRAN NUNCA, y las eligió Juan: la llave de GitHub, LA FIRMA y LAS CUENTAS
   BANCARIAS. Son las tres que no son un dato sino una puerta: con la llave se escribe en el
   repo, con la firma se firma en su nombre, y con la cuenta se le dice a un cliente
   "transferí acá". Un archivo de respaldo termina en Descargas, en un mail o en una carpeta
   compartida — ahí, cualquiera de las tres es una puerta abierta.

   Las tres se vuelven a cargar a mano en un minuto: la llave y la cuenta se pegan, la firma
   se saca de nuevo con una foto.

   Y NO ALCANZA CON SACAR LA FIRMA DE SU LUGAR: el historial de cartas guarda adentro las
   firmas de cada carta —la de Juan y las de sus clientes—, así que al copiarlo hay que
   quitárselas. Sacar "Tu firma" y dejar el historial habría sido no sacar nada. */

const PREFIJO = "como-venimos:";

/* Lo que NUNCA se copia. */
const AFUERA = new Set([
  `${PREFIJO}token`,
  `${PREFIJO}carta-firma`,
  `${PREFIJO}cuentas`,
]);

/* De estas se copia el contenido, pero SIN las firmas que llevan adentro. */
const SIN_FIRMAS = new Set([`${PREFIJO}carta-historial`, `${PREFIJO}carta-borrador`]);

/* Le saca las firmas a una carta o a una lista de cartas, dejando todo lo demás.

   Los datos de la carta —dirección, precio, nombres— sirven de registro y no le abren la
   puerta a nadie. Las firmas sí. Si el texto no se entiende, no se copia: mejor perder ese
   pedazo del respaldo que dejar salir una firma por las dudas. */
function sinLasFirmas(texto) {
  let leido;
  try {
    leido = JSON.parse(texto);
  } catch {
    return null;
  }
  const limpiar = (carta) => {
    if (!carta || typeof carta !== "object") return carta;
    const { firmas, ...resto } = carta;
    return resto;
  };
  const limpio = Array.isArray(leido) ? leido.map(limpiar) : limpiar(leido);
  return JSON.stringify(limpio);
}

/* Qué es cada cosa, para poder decirlo en pantalla en vez de mostrar nombres internos. */
export const QUE_ES = {
  "como-venimos:carta-historial": "Historial de cartas oferta (sin las firmas)",
  "como-venimos:carta-borrador": "La carta oferta a medio hacer",
  "como-venimos:carta-padrones": "Padrones consultados",
  "como-venimos:personal": "Gastos y saldos personales",
  "como-venimos:contacto": "Tu teléfono",
  "como-venimos:tablero": "Preferencias de pantalla",
  "como-venimos:tema": "Modo claro u oscuro",
};

/* Lo que queda afuera, dicho en criollo: la pantalla lo muestra para que se sepa qué NO
   está en la copia, y que eso es a propósito. */
/* LAS FOTOS DE LOS INVENTARIOS NO ENTRAN, y hay que decirlo. Viven en IndexedDB —el deposito
   grande del navegador— y esto solo lee localStorage. Meterlas seria un archivo de respaldo de
   cuarenta y cinco megas por inventario, que no se puede mandar por ningun lado.

   El respaldo de las fotos es el DRIVE: por eso existe el boton de subirlas. El texto del
   inventario si entra acá, asi que al cambiar de telefono vuelven las listas y los estados; las
   fotos vuelven del Drive. */
export const NO_ENTRA = [
  "La llave de GitHub",
  "Tu firma",
  "Las cuentas bancarias",
  "Las fotos de los inventarios (esas van al Drive)",
];

export const VERSION = 2;

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
  for (const clave of clavesGuardadas(deposito)) {
    const crudo = caja.getItem(clave);
    if (!SIN_FIRMAS.has(clave)) {
      datos[clave] = crudo;
      continue;
    }
    const limpio = sinLasFirmas(crudo);
    if (limpio !== null) datos[clave] = limpio;
  }
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
    /* Al volver también se limpia: un archivo tocado a mano no puede meter firmas. */
    const valorFinal = SIN_FIRMAS.has(clave) ? sinLasFirmas(valor) : valor;
    if (valorFinal === null) continue;
    try {
      caja.setItem(clave, valorFinal);
      puestas.push(clave);
    } catch {
      /* Sin lugar para escribir se sigue con las demás: media copia es mejor que ninguna. */
    }
  }
  return puestas.length ? { claves: puestas, version: leido.version || 0 } : null;
}

/* Cómo se llama el archivo. Con la fecha adelante, para que ordenen solos en la carpeta. */
export const nombreDelArchivo = (hoy) => `como-venimos-respaldo-${hoy}.json`;
