/* Lo que la carta oferta guarda, y donde.

   NADA de esto va al repositorio, que es publico: una carta lleva cedulas, telefonos y
   precios, y la firma del usuario es su firma de puno y letra. Vive todo en el telefono,
   igual que las cuentas bancarias (§3.3 del diseño general).

   Tres cosas, con vidas distintas:

   - La FIRMA del usuario: se carga una vez y se reusa en cada carta. Es lo mas valioso
     que hay aca adentro.
   - El BORRADOR: la carta que se esta llenando ahora. Existe solo para que cerrar la app
     no borre media hora de trabajo. Uno solo, no un historial.
   - Los PADRONES ya tipeados, por propiedad. El padron no se puede averiguar solo (§12),
     asi que al menos no se tipea dos veces sobre la misma propiedad. */

const FIRMA = "como-venimos:carta-firma";
const BORRADOR = "como-venimos:carta-borrador";
const PADRONES = "como-venimos:carta-padrones";

/* Todo lo que sale del telefono se valida antes de usarlo. Una escritura a medias, una
   version vieja o cualquier cosa rara deja basura, y basura con forma inesperada rompia la
   pantalla ENTERA: un `null` suelto en el historial y la carta oferta no dibujaba. Lo
   guardado nunca puede tumbar la app. */
const esObjeto = (x) => Boolean(x) && typeof x === "object" && !Array.isArray(x);
const comoLista = (x) => (Array.isArray(x) ? x.filter((v) => typeof v === "string") : []);
const comoMapa = (x) => (esObjeto(x) ? x : {});

const deposito = (almacen) =>
  almacen || (typeof localStorage !== "undefined" ? localStorage : null);

function leerJSON(clave, almacen) {
  const donde = deposito(almacen);
  if (!donde) return null;
  try {
    const crudo = donde.getItem(clave);
    return crudo ? JSON.parse(crudo) : null;
  } catch {
    return null;
  }
}

function guardarJSON(clave, valor, almacen) {
  const donde = deposito(almacen);
  if (!donde) return;
  try {
    if (valor === null) donde.removeItem(clave);
    else donde.setItem(clave, JSON.stringify(valor));
  } catch {
    /* Sin lugar para guardar, la app tiene que seguir andando igual. */
  }
}

/* Los bytes de una firma se guardan como lista de numeros y no en base64: aca el tamaño
   no aprieta —es el telefono, no un enlace— y una lista se lee de un vistazo cuando algo
   anda mal. */
const aLista = (bytes) => (bytes ? [...bytes] : null);
const aBytes = (lista) => (Array.isArray(lista) ? Uint8Array.from(lista) : null);

export function leerFirmaPropia(almacen) {
  const guardado = leerJSON(FIRMA, almacen);
  if (!esObjeto(guardado) || !Array.isArray(guardado.bytes)) return null;
  return { bytes: aBytes(guardado.bytes), cuando: guardado.cuando || null };
}

export function guardarFirmaPropia(bytes, cuando, almacen) {
  guardarJSON(FIRMA, bytes ? { bytes: aLista(bytes), cuando: cuando || null } : null, almacen);
}

export function olvidarFirmaPropia(almacen) {
  guardarJSON(FIRMA, null, almacen);
}

export function leerBorrador(almacen) {
  const guardado = leerJSON(BORRADOR, almacen);
  if (!esObjeto(guardado)) return null;
  const firmas = {};
  for (const [clave, lista] of Object.entries(comoMapa(guardado.firmas))) {
    const bytes = aBytes(lista);
    if (bytes) firmas[clave] = bytes;
  }
  return {
    nombre: typeof guardado.nombre === "string" ? guardado.nombre : "",
    valores: comoMapa(guardado.valores),
    quitadas: comoLista(guardado.quitadas),
    firmas,
    cuando: typeof guardado.cuando === "string" ? guardado.cuando : null,
  };
}

export function guardarBorrador(estado, cuando, almacen) {
  const firmas = {};
  for (const [clave, bytes] of Object.entries(estado.firmas || {})) {
    if (bytes && bytes.length) firmas[clave] = aLista(bytes);
  }
  guardarJSON(BORRADOR, {
    nombre: estado.nombre || "",
    valores: estado.valores || {},
    quitadas: estado.quitadas || [],
    firmas,
    cuando: cuando || null,
  }, almacen);
}

export function borrarBorrador(almacen) {
  guardarJSON(BORRADOR, null, almacen);
}

export function leerPadron(entityId, almacen) {
  if (!entityId) return null;
  const guardado = comoMapa(leerJSON(PADRONES, almacen))[entityId];
  return typeof guardado === "string" ? guardado : null;
}

export function guardarPadron(entityId, padron, almacen) {
  if (!entityId) return;
  const todos = comoMapa(leerJSON(PADRONES, almacen));
  const limpio = String(padron || "").trim();
  if (limpio) todos[entityId] = limpio;
  else delete todos[entityId];
  guardarJSON(PADRONES, todos, almacen);
}

/* ---------- El historial de cartas ----------

   Al principio no habia historial a proposito: el estado viaja en el enlace y WhatsApp
   hace de seguimiento. El usuario lo pidio despues de usarlo, que es cuando se sabe.

   Vive en el telefono como todo lo demas. Se guardan las ultimas VEINTE: es un cajon
   para volver a mirar algo, no un archivo. */

const HISTORIAL = "como-venimos:carta-historial";
const CUANTAS = 20;

const aListas = (firmas = {}) => {
  const salida = {};
  for (const [clave, bytes] of Object.entries(firmas)) {
    if (bytes && bytes.length) salida[clave] = [...bytes];
  }
  return salida;
};

const aBytesTodas = (firmas) => {
  const salida = {};
  for (const [clave, lista] of Object.entries(comoMapa(firmas))) {
    const bytes = aBytes(lista);
    if (bytes) salida[clave] = bytes;
  }
  return salida;
};

/* Como se llama una carta en la lista.

   Manda el nombre que le puso el usuario al guardarla; si no le puso ninguno, la
   direccion. Dos cartas sobre la misma propiedad —una para cada comprador— se distinguen
   solo por el nombre, y ahi la direccion no alcanza. */
export function comoSeLlamaLaCarta(carta) {
  const nombre = String((carta || {}).nombre || "").trim();
  if (nombre) return nombre;
  return String(((carta || {}).valores || {}).calle || "").trim() || "Carta sin nombre";
}

export function leerHistorial(almacen) {
  const guardado = leerJSON(HISTORIAL, almacen);
  if (!Array.isArray(guardado)) return [];
  return guardado.filter(esObjeto).map((c) => ({
    id: typeof c.id === "string" ? c.id : String(c.id ?? ""),
    nombre: typeof c.nombre === "string" ? c.nombre : "",
    cuando: typeof c.cuando === "string" ? c.cuando : null,
    valores: comoMapa(c.valores),
    quitadas: comoLista(c.quitadas),
    firmas: aBytesTodas(c.firmas),
  }));
}

/* Guarda una carta en el cajon. Si ya estaba (mismo id) se pisa: guardar dos veces la
   misma carta a medio llenar llenaria la lista de copias. */
export function guardarEnHistorial(carta, cuando, almacen) {
  /* El id sale de la fecha y de la direccion. Guardar dos veces la misma carta del mismo
     dia la pisa en vez de dejar dos copias a medio llenar. */
  const id = carta.id || `${cuando || "sin-fecha"} ${comoSeLlamaLaCarta(carta)}`;
  const crudo = leerJSON(HISTORIAL, almacen);
  const lista = Array.isArray(crudo) ? crudo.filter((c) => c.id !== id) : [];
  lista.unshift({
    id,
    nombre: carta.nombre || "",
    cuando: cuando || null,
    valores: carta.valores || {},
    quitadas: carta.quitadas || [],
    firmas: aListas(carta.firmas),
  });
  guardarJSON(HISTORIAL, lista.slice(0, CUANTAS), almacen);
  return id;
}

export function borrarDelHistorial(id, almacen) {
  const crudo = leerJSON(HISTORIAL, almacen);
  if (!Array.isArray(crudo)) return;
  guardarJSON(HISTORIAL, crudo.filter((c) => c.id !== id), almacen);
}
