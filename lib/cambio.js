/* El tipo de cambio del dolar.

   El Excel tenia un 40 clavado adentro de la formula de renta: cada calculo desde
   entonces daba mal sin avisar. Aca la cotizacion se busca, se guarda con su fecha, y si
   no hay señal se usa la ultima con el cartel de cuando es. Y siempre se puede escribir
   a mano, que es la unica forma de no depender de un servicio de afuera. */

const FUENTE = "https://open.er-api.com/v6/latest/USD";

export async function traerCotizacion(traer = globalThis.fetch) {
  try {
    const respuesta = await traer(FUENTE, { cache: "no-cache" });
    if (!respuesta.ok) return null;
    const datos = await respuesta.json();
    const valor = datos && datos.rates && datos.rates.UYU;
    if (!valor || !Number.isFinite(valor) || valor <= 0) return null;
    return { usd_uyu: valor, fecha: (datos.time_last_update_utc || "").slice(5, 16) };
  } catch {
    return null;
  }
}

/* Que cotizacion usar y de donde salio, para poder decirlo en pantalla y en la ficha. */
export function cotizacionVigente(ajustes, fresca) {
  if (fresca) return { valor: fresca.usd_uyu, origen: "de hoy", fecha: fresca.fecha, buscada: true };
  const guardada = (ajustes || {}).tipo_cambio || {};
  if (guardada.usd_uyu) {
    return { valor: guardada.usd_uyu, origen: "la última guardada", fecha: guardada.fecha, buscada: false };
  }
  return { valor: null, origen: "sin cotización", fecha: null, buscada: false };
}

/* Si lo guardado ya no sirve para hoy. La cotizacion se busca sola al abrir la
   calculadora: el usuario no tiene que acordarse de apretar nada, y menos con un cliente
   adelante. Se guarda el dia en que se busco, no la fecha que devuelve el servicio: esa
   viene en ingles y con formato propio, y lo unico que importa aca es "ya la busque hoy". */
export function estaVencida(ajustes, hoy) {
  const guardada = (ajustes || {}).tipo_cambio || {};
  if (!guardada.usd_uyu) return true;
  return guardada.buscada_el !== hoy;
}

/* Como se dice la cotizacion usada en la ficha del cliente. Que quede escrito a cuanto se
   tomo el dolar es lo que hace que el numero se pueda auditar tres meses despues. */
export function comoSeDice(cotizacion) {
  if (!cotizacion || !cotizacion.valor) return null;
  const valor = Math.round(cotizacion.valor * 100) / 100;
  return `Dólar a $ ${valor.toLocaleString("es-UY")}`;
}
