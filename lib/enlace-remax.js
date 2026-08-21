/* EL LINK DE UNA PUBLICACION DE RE/MAX.

   Juan: "agregale que pueda directamente poner el link de la propiedad para que le haga
   seguimiento y no tengo que buscar el match".

   Tiene razon y es mejor camino: buscar la propiedad por la direccion es adivinar —el colega
   la escribe como quiere, RE/MAX redondea la altura— y despues hay que confirmarla a mano
   preguntandole a el. Con el link no hay nada que adivinar: ES esa.

   Un link de RE/MAX se ve asi:

       https://www.remax.com.uy/listings/venta-apto-1-dormitorio-la-blanqueda

   Lo ultimo es el SLUG, y con el se le puede pedir esa propiedad a la API sin saber siquiera
   de que agente es. Se acepta pegado como venga: con https o sin, con www o sin, con lo que
   Whatsapp le agregue atras, y hasta el slug pelado si lo copio de la barra.

   OJO CON EL SLUG: sale del TITULO de la publicacion, asi que si el colega le cambia el
   titulo, cambia. Por eso al encontrarla se guarda tambien su numero interno, que no cambia
   nunca (ver robot/referidas.py). */

/* Lo que va antes del slug. Se acepta cualquier dominio de RE/MAX porque el link puede venir
   de la app, de la web o compartido, y todos llevan al mismo lado. */
const DE_REMAX = /^(?:https?:\/\/)?(?:[\w-]+\.)*remax\.com\.[a-z]{2}\/(?:listings|propiedad|inmueble)\/(.+)$/i;

/* Un slug de RE/MAX: minusculas, numeros y guiones. Nada mas. */
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function slugDelEnlace(texto) {
  const limpio = String(texto || "").trim();
  if (!limpio) return null;

  const conDominio = limpio.match(DE_REMAX);
  /* Sin dominio puede ser el slug pelado —copiado de la barra— pero NO cualquier cosa: un
     link de otro portal o una frase suelta tienen que devolver null, no un slug inventado. */
  let cola = conDominio ? conDominio[1] : limpio;

  // Lo que venga despues: ?utm_source=..., #fotos, la barra del final.
  cola = cola.split(/[?#]/)[0].replace(/\/+$/, "").trim();
  // Un link con mas tramos ("/listings/algo/fotos"): el slug es el primero.
  cola = cola.split("/")[0].toLowerCase();

  return SLUG.test(cola) && cola.includes("-") ? cola : null;
}

export const enlaceDelSlug = (slug) =>
  (slug ? `https://www.remax.com.uy/listings/${slug}` : null);
