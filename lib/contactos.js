/* Los contactos de un negocio y el boton de WhatsApp (§7.6).

   Ningun navegador puede leer los contactos de WhatsApp: no existe esa API. Lo que si
   existe en Chrome para Android es la Contact Picker, que abre la agenda del telefono y
   devuelve nombre y telefono ya cargados. Como los contactos de WhatsApp son los de la
   agenda, el resultado practico es el mismo.

   En iOS y en la computadora el picker no existe: ahi se carga a mano y el boton de
   WhatsApp funciona igual. */

/* Solo los CLIENTES llevan telefono y boton de WhatsApp: son los que despues hay que
   volver a contactar, y con el tiempo arman la base de relaciones.

   Quien refirio y a quien se le refirio salieron de aca: son gente de la casa y se eligen
   de una lista corta en la ficha, sin telefono, porque es informacion interna. */
export const ROLES = [
  ["cliente_vendedor", "El dueño que vende"],
  ["cliente_comprador", "El comprador o inquilino"],
  /* En una propiedad REFERIDA el cliente es tuyo aunque el negocio lo haga otro: es el que
     te llamo a vos. Guardar su contacto es lo que te deja seguir el negocio sin depender de
     que el colega te cuente. */
  ["cliente_referido", "El cliente que referiste"],
];

const PAIS = "598";

/* Deja el numero como lo quiere wa.me: solo digitos, con codigo de pais.

   En Uruguay los celulares se escriben 09X XXX XXX pero internacionalmente van sin el
   cero: 598 9X XXX XXX. Ese cero de mas es el error clasico que deja el link muerto. */
export function normalizarTelefono(crudo) {
  const digitos = String(crudo ?? "").replace(/\D/g, "");
  if (!digitos) return null;

  if (digitos.startsWith(PAIS) && digitos.length >= 11) return digitos;
  // 09X XXX XXX -> se saca el cero y se antepone el pais
  if (digitos.startsWith("0") && digitos.length === 9) return PAIS + digitos.slice(1);
  // 9X XXX XXX, ya sin el cero
  if (digitos.startsWith("9") && digitos.length === 8) return PAIS + digitos;
  // Fijo de Montevideo: 2XXX XXXX
  if (digitos.startsWith("2") && digitos.length === 8) return PAIS + digitos;
  // Cualquier otra cosa se manda tal cual: puede ser un numero de afuera.
  return digitos.length >= 8 ? digitos : null;
}

export function enlaceWhatsapp(telefono, mensaje) {
  const numero = normalizarTelefono(telefono);
  if (!numero) return null;
  const texto = mensaje ? `?text=${encodeURIComponent(mensaje)}` : "";
  return `https://wa.me/${numero}${texto}`;
}

export function hayPicker(navegador = globalThis.navigator) {
  return Boolean(navegador && navegador.contacts && navegador.contacts.select);
}

/* Abre la agenda del telefono. Devuelve {nombre, telefono} o null si se cancelo. */
export async function elegirContacto(navegador = globalThis.navigator) {
  if (!hayPicker(navegador)) return null;
  try {
    const elegidos = await navegador.contacts.select(["name", "tel"], { multiple: false });
    if (!elegidos || !elegidos.length) return null;
    const c = elegidos[0];
    return {
      nombre: (c.name && c.name[0]) || "",
      telefono: (c.tel && c.tel[0]) || "",
    };
  } catch {
    return null;   // el usuario cancelo, o el navegador dijo que no
  }
}
