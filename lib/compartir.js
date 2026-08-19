/* Mandar y bajar cosas, sin que el usuario tenga que decir desde dónde está.

   Hay TRES lugares distintos donde puede estar abierta la página, y en cada uno funciona
   una cosa distinta. Esto costó dos vueltas de arreglos, así que queda escrito:

   1. Computadora. No hay bandeja de compartir del sistema: se abre WhatsApp Web.

   2. Celular, navegador de verdad (Chrome, Safari). Anda `navigator.share`, que abre la
      bandeja del sistema. Es lo mejor: el usuario elige a quién y por dónde.

   3. Celular, adentro del navegador que WhatsApp trae incorporado. Acá `navigator.share`
      NO anda y las descargas están bloqueadas: se toca el botón y no pasa nada. Es el
      caso que dejó a Juan trabado. Lo único que sí funciona es navegar a `wa.me`, porque
      eso devuelve a WhatsApp, que es la app que está mostrando la página.

   La regla que sale de ahí: adentro de otra app se usa `wa.me`; afuera, la bandeja.
   Y cuando algo no se puede hacer, se DEVUELVE ESO — el que llama tiene que poder avisar
   en pantalla en vez de dejar un botón que no reacciona. */

import { esNavegadorDeOtraApp } from "./navegador.js";

const puedeCompartir = () =>
  typeof navigator !== "undefined" && typeof navigator.share === "function";

const puedeCompartirArchivos = (archivo) =>
  puedeCompartir() && typeof navigator.canShare === "function"
  && navigator.canShare({ files: [archivo] });

export function comoWhatsApp(texto, telefono = "") {
  const soloDigitos = String(telefono || "").replace(/\D/g, "");
  return `https://wa.me/${soloDigitos}?text=${encodeURIComponent(texto)}`;
}

/* Se deja el nombre viejo andando: lo usan las pantallas que no mandan a nadie en particular. */
export const comoWhatsAppWeb = (texto) => comoWhatsApp(texto, "");

/* Mandar un texto (con un enlace adentro).

   `telefono` es el del destinatario: con eso WhatsApp abre la conversación con esa persona
   ya elegida, y el cliente no tiene que buscar a Juan en su agenda. */
export async function mandarTexto(texto, { telefono = "" } = {}) {
  if (esNavegadorDeOtraApp()) {
    window.location.href = comoWhatsApp(texto, telefono);
    return "whatsapp";
  }
  if (puedeCompartir()) {
    try {
      await navigator.share({ text: texto });
      return "compartido";
    } catch (error) {
      if (error && error.name === "AbortError") return "cancelado";
    }
  }
  window.open(comoWhatsApp(texto, telefono), "_blank", "noopener");
  return "whatsapp";
}

/* Bajar un archivo.

   El enlace TIENE que estar en el documento antes de tocarlo: un `<a>` suelto en memoria
   no dispara la descarga en varios navegadores de celular, y ahí el botón no hacía nada.
   Y en el teléfono se ofrece antes el menú de compartir, que incluye "Guardar en Archivos"
   y además deja mandarlo — bajar a la carpeta de descargas de un celular es un pozo.

   Devuelve "bloqueado" cuando está adentro del navegador de otra app: ahí la descarga no
   va a pasar y hay que decírselo al usuario, no dejarlo tocando un botón muerto. */
export async function bajarArchivo(blob, nombre) {
  if (esNavegadorDeOtraApp()) return "bloqueado";

  const archivo = new File([blob], nombre, { type: blob.type || "application/octet-stream" });
  if (puedeCompartirArchivos(archivo)) {
    try {
      await navigator.share({ files: [archivo] });
      return "compartido";
    } catch (error) {
      if (error && error.name === "AbortError") return "cancelado";
      /* Si compartir falla por cualquier otra razon, se baja igual. */
    }
  }

  const url = URL.createObjectURL(blob);
  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = nombre;
  enlace.style.display = "none";
  document.body.append(enlace);
  enlace.click();
  enlace.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return "bajado";
}

/* Mandar un archivo por donde el usuario quiera. En el teléfono abre la bandeja del
   sistema; en una computadora, que no tiene bandeja, lo baja y abre WhatsApp Web con el
   texto, para que igual pueda mandar algo. */
export async function mandarArchivo(blob, nombre, texto = "", { telefono = "" } = {}) {
  if (esNavegadorDeOtraApp()) return "bloqueado";

  const archivo = new File([blob], nombre, { type: blob.type || "application/pdf" });
  if (puedeCompartirArchivos(archivo)) {
    try {
      await navigator.share({ files: [archivo] });
      return "compartido";
    } catch (error) {
      if (error && error.name === "AbortError") return "cancelado";
    }
  }
  await bajarArchivo(blob, nombre);
  if (texto) window.open(comoWhatsApp(texto, telefono), "_blank", "noopener");
  return "bajado";
}
