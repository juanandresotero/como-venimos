/* Mandar y bajar cosas, sin que el usuario tenga que decir desde dónde está.

   El problema que resuelve, en concreto: `wa.me/?text=...` funciona lindo en una
   computadora, pero en el celular abre `api.whatsapp.com` — una página web que dice
   "Compartir en Whatsapp / Abrir aplicación" y de la que no se sale. El cliente queda
   trabado ahí y no puede devolver la carta.

   La forma correcta en el telefono es el menu de compartir del sistema
   (`navigator.share`): se abre la bandeja, elige WhatsApp y listo. Y no hace falta
   preguntarle si esta en celular o en computadora — se pregunta al navegador. */

const puedeCompartir = () =>
  typeof navigator !== "undefined" && typeof navigator.share === "function";

const puedeCompartirArchivos = (archivo) =>
  puedeCompartir() && typeof navigator.canShare === "function"
  && navigator.canShare({ files: [archivo] });

export const comoWhatsAppWeb = (texto) =>
  `https://wa.me/?text=${encodeURIComponent(texto)}`;

/* Bajar un archivo.

   El enlace TIENE que estar en el documento antes de tocarlo: un `<a>` suelto en memoria
   no dispara la descarga en varios navegadores de celular, y ahi el boton no hacia nada.
   Y en el telefono se ofrece antes el menu de compartir, que incluye "Guardar en Archivos"
   y ademas deja mandarlo — bajar a la carpeta de descargas de un celular es un pozo. */
export async function bajarArchivo(blob, nombre) {
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

/* Mandar un archivo por donde el usuario quiera. En el telefono abre la bandeja del
   sistema; en una computadora, que no tiene bandeja, lo baja y abre WhatsApp Web con el
   texto, para que igual pueda mandar algo. */
export async function mandarArchivo(blob, nombre, texto = "") {
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
  if (texto) window.open(comoWhatsAppWeb(texto), "_blank", "noopener");
  return "bajado";
}

/* Mandar un texto (con un enlace adentro). En el telefono, la bandeja del sistema; en
   computadora, WhatsApp Web. */
export async function mandarTexto(texto) {
  if (puedeCompartir()) {
    try {
      await navigator.share({ text: texto });
      return "compartido";
    } catch (error) {
      if (error && error.name === "AbortError") return "cancelado";
    }
  }
  window.open(comoWhatsAppWeb(texto), "_blank", "noopener");
  return "web";
}
