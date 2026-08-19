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
  if (!guardado || !Array.isArray(guardado.bytes)) return null;
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
  if (!guardado) return null;
  const firmas = {};
  for (const [clave, lista] of Object.entries(guardado.firmas || {})) {
    const bytes = aBytes(lista);
    if (bytes) firmas[clave] = bytes;
  }
  return {
    valores: guardado.valores || {},
    quitadas: guardado.quitadas || [],
    firmas,
    cuando: guardado.cuando || null,
  };
}

export function guardarBorrador(estado, cuando, almacen) {
  const firmas = {};
  for (const [clave, bytes] of Object.entries(estado.firmas || {})) {
    if (bytes && bytes.length) firmas[clave] = aLista(bytes);
  }
  guardarJSON(BORRADOR, {
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
  return (leerJSON(PADRONES, almacen) || {})[entityId] || null;
}

export function guardarPadron(entityId, padron, almacen) {
  if (!entityId) return;
  const todos = leerJSON(PADRONES, almacen) || {};
  const limpio = String(padron || "").trim();
  if (limpio) todos[entityId] = limpio;
  else delete todos[entityId];
  guardarJSON(PADRONES, todos, almacen);
}
