/* El ID de cliente de Google, para poder subir al Drive.

   VIVE EN EL TELEFONO Y NO EN EL CODIGO. No es un secreto —el ID de cliente de cualquier app
   web viaja a la vista en su HTML— pero es el numero del proyecto de Google de Juan, y este
   repositorio es publico. Que no este escrito en el codigo tambien deja cambiarlo sin tocar
   una linea el dia que arme otro proyecto.

   LO QUE NUNCA VA A ESTAR ACA es el "client secret" ni el refresh token. Con el flujo del
   navegador no hacen falta, y un refresh token adentro de una pagina publica seria la llave
   del Drive a la vista de cualquiera. */

const CLAVE = "como-venimos:google-cliente";

const deposito = (almacen) =>
  almacen || (typeof localStorage !== "undefined" ? localStorage : null);

export function leer(almacen) {
  const d = deposito(almacen);
  return d ? String(d.getItem(CLAVE) || "") : "";
}

export function guardar(id, almacen) {
  const d = deposito(almacen);
  if (!d) return "";
  const limpio = String(id || "").trim();
  if (limpio) d.setItem(CLAVE, limpio);
  else d.removeItem(CLAVE);
  return limpio;
}

/* Un ID de cliente de Google se ve asi: 798533575115-abc123.apps.googleusercontent.com.
   Chequearlo antes evita el error mas comun: pegar el "secret" en vez del ID. */
export const pareceValido = (id) =>
  /^\d+-[a-z0-9]+\.apps\.googleusercontent\.com$/i.test(String(id || "").trim());
