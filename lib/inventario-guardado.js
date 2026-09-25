/* Los inventarios, guardados en el telefono.

   NADA DE ESTO VA AL REPOSITORIO, que es publico. Un inventario lleva la direccion de la
   casa de un cliente y el estado de cada cosa que hay adentro. Vive en el telefono, igual que
   la firma y las cuentas bancarias (§3.3 del diseño general).

   Van al respaldo, eso si: lib/respaldo.js se lleva todo lo que empieza con "como-venimos:"
   salvo la firma, el token y las cuentas. Un inventario que se pierde al cambiar de telefono
   es media hora de trabajo perdida y un documento firmado que ya no se puede comparar.

   SE GUARDA SOLO, en cada cambio. Un inventario se hace parado en el medio de un
   apartamento, con el telefono en una mano: no hay ningun momento razonable para pedirle a
   alguien que se acuerde de apretar "guardar". */

const CLAVE = "como-venimos:inventarios";

const deposito = (almacen) =>
  almacen || (typeof localStorage !== "undefined" ? localStorage : null);

/* Todo lo que sale del telefono se valida antes de usarlo: una escritura a medias o una
   version vieja dejan basura, y basura con forma inesperada rompe la pantalla entera. */
const esObjeto = (x) => Boolean(x) && typeof x === "object" && !Array.isArray(x);

function sanearItem(x) {
  if (!esObjeto(x)) return null;
  return {
    id: String(x.id || ""),
    nombre: String(x.nombre || ""),
    estado: String(x.estado || "bien"),
    detalle: String(x.detalle || ""),
    cantidad: Number(x.cantidad) > 0 ? Number(x.cantidad) : 1,
  };
}

function sanearAmbiente(x) {
  if (!esObjeto(x)) return null;
  return {
    id: String(x.id || ""),
    tipo: String(x.tipo || "vacio"),
    nombre: String(x.nombre || ""),
    items: (Array.isArray(x.items) ? x.items : []).map(sanearItem).filter(Boolean),
  };
}

export function sanear(x) {
  if (!esObjeto(x)) return null;
  return {
    id: String(x.id || ""),
    fecha: String(x.fecha || ""),
    direccion: String(x.direccion || ""),
    unidad: String(x.unidad || ""),
    barrio: String(x.barrio || ""),
    edificio: String(x.edificio || ""),
    link_fotos: String(x.link_fotos || ""),
    observaciones: String(x.observaciones || ""),
    firmas_arrendador: Number(x.firmas_arrendador) > 0 ? Number(x.firmas_arrendador) : 1,
    firmas_arrendatario: Number(x.firmas_arrendatario) > 0 ? Number(x.firmas_arrendatario) : 1,
    clausulas: (Array.isArray(x.clausulas) ? x.clausulas : []).map((c) => String(c || "")),
    /* EL DIA QUE SE BORRO, si se borro. Vacio quiere decir que esta en uso — que es lo que
       trae cualquier inventario hecho antes de que existiera la papelera. */
    papelera: String(x.papelera || ""),
    ambientes: (Array.isArray(x.ambientes) ? x.ambientes : [])
      .map(sanearAmbiente).filter(Boolean),
  };
}

/* Los mas nuevos primero: el que estas usando es el de hoy. */
export function leer(almacen) {
  const d = deposito(almacen);
  if (!d) return [];
  try {
    const crudo = JSON.parse(d.getItem(CLAVE) || "[]");
    return (Array.isArray(crudo) ? crudo : []).map(sanear).filter(Boolean);
  } catch {
    return [];
  }
}

/* LOS QUE ESTAN EN USO, y los que estan en la papelera. Se separan aca y no en la pantalla
   porque `guardar` reescribe la lista COMPLETA: si la pantalla filtrara y le pasara su lista
   filtrada, el primer inventario que se guardara despues de borrar otro se llevaria al borrado
   con el. */
export const lista = (almacen) => leer(almacen).filter((x) => !x.papelera);
export const papelera = (almacen) => leer(almacen).filter((x) => x.papelera);

export function guardar(inventario, almacen) {
  const limpio = sanear(inventario);
  if (!limpio || !limpio.id) return leer(almacen);
  const lista = leer(almacen).filter((x) => x.id !== limpio.id);
  const nueva = [limpio, ...lista];
  const d = deposito(almacen);
  if (d) d.setItem(CLAVE, JSON.stringify(nueva));
  return nueva;
}

/* BORRAR NO BORRA: manda a la papelera.

   Juan lo pidió antes que cualquier otra cosa: "no se puede borrar el inventario que está
   hecho porque es de un cliente y no lo puedo volver a hacer... asegurémonos que no se
   pierda". Un inventario firmado no se puede rehacer, y el botón de borrarlo está a un toque
   del de subirlo al Drive. Queda guardado, fuera de la lista, hasta que él diga que no lo
   quiere más. Las fotos NO se tocan al mandarlo a la papelera, justamente para poder volver. */
export function borrar(id, cuando, almacen) {
  const nueva = leer(almacen).map(
    (x) => (x.id === id ? { ...x, papelera: String(cuando || "si") } : x));
  const d = deposito(almacen);
  if (d) d.setItem(CLAVE, JSON.stringify(nueva));
  return nueva;
}

export function recuperar(id, almacen) {
  const nueva = leer(almacen).map((x) => (x.id === id ? { ...x, papelera: "" } : x));
  const d = deposito(almacen);
  if (d) d.setItem(CLAVE, JSON.stringify(nueva));
  return nueva;
}

/* Este si lo borra para siempre, y se pregunta dos veces antes de llegar aca. */
export function borrarDeVerdad(id, almacen) {
  const nueva = leer(almacen).filter((x) => x.id !== id);
  const d = deposito(almacen);
  if (d) d.setItem(CLAVE, JSON.stringify(nueva));
  return nueva;
}

export const buscar = (id, almacen) => leer(almacen).find((x) => x.id === id) || null;
