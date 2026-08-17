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

/* Que cotizacion usar y de donde salio, para poder decirlo en pantalla. */
export function cotizacionVigente(ajustes, fresca) {
  if (fresca) return { valor: fresca.usd_uyu, origen: "de hoy", fecha: fresca.fecha };
  const guardada = (ajustes || {}).tipo_cambio || {};
  if (guardada.usd_uyu) {
    return { valor: guardada.usd_uyu, origen: "la última guardada", fecha: guardada.fecha };
  }
  return { valor: null, origen: "sin cotización", fecha: null };
}
