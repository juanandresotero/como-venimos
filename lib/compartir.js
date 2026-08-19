/* Mandar y bajar cosas, sin que el usuario tenga que decir desde dónde está.

   Esto costó TRES vueltas de arreglos. Lo que se aprendió, para no volver a pisarlo:

   El problema no es "el navegador de WhatsApp". El problema es que adentro de cualquier
   navegador metido en otra aplicación, el sistema bloquea todo lo que la página intenta
   hacer SOLA: `navigator.share`, `window.open()`, y un `<a>.click()` disparado por código.
   No tira error: no pasa nada. El botón queda muerto y el usuario cree que la app se rompió.

   Lo que NO se bloquea nunca es un enlace de verdad que toca una persona. De ahí sale la
   regla que ordena todo esto:

     Lo que tiene que salir de la página va en el `href` de un `<a>`, no en un `onclick`.

   Y dos cosas más que se aprendieron a los golpes:

   - `wa.me` es una PÁGINA WEB. Adentro del navegador de WhatsApp se queda ahí mismo y
     muestra "Continuar al chat", que no lleva a ningún lado. Para salir hay que usar
     `whatsapp://`, que no es una página sino una orden para el sistema operativo.

   - Siempre tiene que haber una salida que no dependa de nada: copiar el texto y pegarlo
     a mano. Fea, pero imposible de bloquear.

   Las funciones que quedan abajo (`mandarTexto`, `bajarArchivo`, `mandarArchivo`) sirven
   para la app del agente, que corre en su propio navegador y ahí sí puede todo. Para la
   página que recibe el cliente se usan `paraMandar` y `copiarTexto`. */

import { esNavegadorDeOtraApp, esCelular } from "./navegador.js";

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

/* La direccion que abre la APLICACION de WhatsApp, no su pagina web.

   `wa.me` es una pagina: adentro del navegador que WhatsApp trae incorporado se queda ahi
   mismo y muestra "Continuar al chat", que no lleva a ningun lado. `whatsapp://` no es una
   pagina: es una orden para el sistema, y saca al usuario de esa ventanita y lo deja en la
   conversacion. Es lo unico que cruza esa pared. */
export function comoAppDeWhatsApp(texto, telefono = "") {
  const mensaje = encodeURIComponent(texto);
  const soloDigitos = String(telefono || "").replace(/\D/g, "");
  return soloDigitos
    ? `whatsapp://send?phone=${soloDigitos}&text=${mensaje}`
    : `whatsapp://send?text=${mensaje}`;
}

/* Lo que hay que poner en el `href` de un enlace para mandar algo por WhatsApp.

   Va en un enlace de verdad y NO en `window.open()` ni en un `click()` disparado por
   codigo: eso es lo que los navegadores metidos adentro de otra app bloquean sin avisar,
   y por eso el boton no hacia nada. Un enlace que toca una persona no se bloquea nunca. */
export const paraMandar = (texto, telefono = "") =>
  (esCelular() ? comoAppDeWhatsApp : comoWhatsApp)(texto, telefono);

/* Copiar al portapapeles, con el camino viejo de respaldo.

   `navigator.clipboard` no existe en todos los navegadores metidos adentro de otra app;
   el textarea con `execCommand` es de hace veinte años y funciona en todos. Es la salida
   que no puede fallar: si nada mas anduvo, el enlace igual se puede pegar a mano. */
export async function copiarTexto(texto) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(texto);
      return true;
    }
  } catch { /* se sigue por el camino viejo */ }

  const caja = document.createElement("textarea");
  caja.value = texto;
  caja.setAttribute("readonly", "");
  caja.style.position = "fixed";
  caja.style.top = "0";
  caja.style.opacity = "0";
  document.body.append(caja);
  caja.select();
  caja.setSelectionRange(0, texto.length);   // iPhone necesita esto
  let listo = false;
  try { listo = document.execCommand("copy"); } catch { listo = false; }
  caja.remove();
  return listo;
}

/* Mandar un texto (con un enlace adentro).

   `telefono` es el del destinatario: con eso WhatsApp abre la conversación con esa persona
   ya elegida, y el cliente no tiene que buscar a Juan en su agenda. */
export async function mandarTexto(texto, { telefono = "" } = {}) {
  /* Adentro de otra app se navega DERECHO a la direccion que abre WhatsApp: `navigator.share`
     no anda ahi y `window.open` esta bloqueado. Y va por `whatsapp://` y no por `wa.me`,
     porque `wa.me` es una pagina y se queda en la misma ventanita. */
  if (esNavegadorDeOtraApp()) {
    window.location.href = paraMandar(texto, telefono);
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
