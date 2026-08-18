/* Claro u oscuro, elegido a mano y recordado.

   Sin elegir nada, la app sigue al teléfono — que es lo que hacía hasta ahora y está bien
   como punto de partida. En cuanto se toca el botón, manda la elección: queda escrita en
   el aparato y sobrevive a cerrar la app.

   Se guarda en el teléfono y no en GitHub a propósito. Es preferencia de pantalla, no
   dato del negocio: mandarla al repo llenaría el historial de commits que no dicen nada,
   y además es razonable que la compu y el celular tengan cada uno el suyo. */

const CLAVE = "como-venimos:tema";

export const CLARO = "claro";
export const OSCURO = "oscuro";

const deposito = () => (typeof localStorage !== "undefined" ? localStorage : null);

/* Lo que el sistema pide, para arrancar en algún lado la primera vez. */
export function delSistema(consulta) {
  const preguntar = consulta
    || (typeof matchMedia !== "undefined" ? matchMedia : null);
  if (!preguntar) return CLARO;
  try {
    return preguntar("(prefers-color-scheme: dark)").matches ? OSCURO : CLARO;
  } catch {
    return CLARO;
  }
}

/* null quiere decir "todavía no eligió nada": ahí manda el sistema. */
export function leer(almacen) {
  const caja = almacen === undefined ? deposito() : almacen;
  if (!caja) return null;
  const guardado = caja.getItem(CLAVE);
  return guardado === CLARO || guardado === OSCURO ? guardado : null;
}

export function guardar(tema, almacen) {
  const caja = almacen === undefined ? deposito() : almacen;
  const limpio = tema === OSCURO ? OSCURO : CLARO;
  if (caja) {
    try {
      caja.setItem(CLAVE, limpio);
    } catch {
      // Sin lugar para guardar, la app tiene que seguir andando igual.
    }
  }
  return limpio;
}

export const opuesto = (tema) => (tema === OSCURO ? CLARO : OSCURO);

/* El que está en uso ahora mismo: el elegido, o el del sistema si no eligió. */
export function vigente(almacen, consulta) {
  return leer(almacen) || delSistema(consulta);
}

/* Lo escribe en el documento y actualiza el color de la barra del navegador.

   Sin tocar el `theme-color`, en el celular la barra de arriba queda del color viejo y la
   pantalla se ve partida al medio. */
export function aplicar(tema, documento) {
  const doc = documento || (typeof document !== "undefined" ? document : null);
  if (!doc) return tema;
  doc.documentElement.setAttribute("data-tema", tema);
  const color = tema === OSCURO ? "#0b0f1a" : "#ffffff";
  for (const etiqueta of doc.querySelectorAll('meta[name="theme-color"]')) {
    etiqueta.removeAttribute("media");
    etiqueta.setAttribute("content", color);
  }
  return tema;
}
