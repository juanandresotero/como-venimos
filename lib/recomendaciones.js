/* "Qué hacer para llegar al objetivo" (§8.6).

   No son consejos genericos: cada linea es una cuenta con los numeros del usuario, y solo
   aparece si su condicion se cumple. Una recomendacion que sale siempre no se lee mas. */

import { capas, ritmo, metricas, comparativaCategorias, nivelRemax } from "./salud.js";
import { estadoVisible, diasEnCartera } from "./cartera.js";

const redondear = (n) => Math.round(n);
const porcentaje = (n) => `${(n * 100).toFixed(1).replace(".", ",")}%`;
const monto = (n) => Math.round(n).toLocaleString("es-UY");

/* Cuantos negocios de un tipo harian falta para juntar lo que falta. */
function cuantosFaltan(falta, ticket, ratioFacturacion) {
  if (!ticket || !ratioFacturacion) return null;
  const porNegocio = ticket * ratioFacturacion;
  if (porNegocio <= 0) return null;
  return Math.ceil(falta / porNegocio);
}

export function recomendaciones(datos, anio, hoy, pendientes = {}) {
  const { negocios, cartera, ajustes } = datos;
  const c = capas(negocios, cartera, ajustes, anio);
  const objetivo = (ajustes.objetivo_personal || {})[anio] || 0;
  const r = ritmo(c.capa1.facturacion, objetivo, anio, hoy);
  const m = metricas(negocios, anio);
  const lista = [];

  const poner = (clave, titulo, detalle) => lista.push({ clave, titulo, detalle });

  // 1 · Cuanto falta, traducido a negocios concretos.
  if (r && r.falta > 0) {
    const ventas = cuantosFaltan(r.falta, m.ticketVenta, c.ratios.venta.fact);
    const alquileres = cuantosFaltan(r.falta, m.ticketAlquiler, c.ratios.alquiler.fact);
    const pedazos = [];
    if (ventas) pedazos.push(`${ventas} ${ventas === 1 ? "venta" : "ventas"} más`);
    if (alquileres) pedazos.push(`${alquileres} ${alquileres === 1 ? "alquiler" : "alquileres"}`);
    poner(
      "falta_para_objetivo",
      `Te faltan USD ${monto(r.falta)} para el objetivo`,
      pedazos.length
        ? `Con tu ticket mediano de venta (${monto(m.ticketVenta)}) y tu facturación media ` +
          `del ${porcentaje(c.ratios.venta.fact)}, son ${pedazos.join(". O ")}.`
        : `Todavía no hay historial suficiente del año para traducirlo a cantidad de negocios.`
    );
  }

  // 2 · Si ni cerrando todo lo que tiene llega, el problema no es cerrar: es captar.
  if (objetivo && c.total.facturacion < objetivo) {
    poner(
      "falta_volumen",
      `Con lo que tenés hoy no alcanza`,
      `Aun cerrando toda tu cartera llegás a USD ${monto(c.total.facturacion)}. ` +
      `Te faltan USD ${monto(objetivo - c.total.facturacion)} de negocio nuevo para captar.`
    );
  }

  // 3 · Publicaciones trabadas: llevan mas tiempo que lo que suele tardarte un boleto.
  const umbral = m.plazoBoleto || m.plazoVenta;
  if (umbral) {
    const trabadas = Object.values(cartera || {}).filter((p) => {
      if (!p.activa || estadoVisible(p) !== "publicada") return false;
      return (diasEnCartera(p, hoy) || 0) > umbral;
    });
    if (trabadas.length) {
      poner(
        "trabadas",
        `${trabadas.length} ${trabadas.length === 1 ? "propiedad lleva" : "propiedades llevan"} más de ${redondear(umbral)} días sin moverse`,
        `Tu mediana de inicio a boleto es de ${redondear(umbral)} días. ` +
        `Son: ${trabadas.map((p) => p.direccion || p.titulo).join(", ")}.`
      );
    }
  }

  // 4 · Cuanto cuesta la categoria en la que esta.
  const cats = comparativaCategorias(negocios, ajustes, anio, hoy);
  const actual = cats.find((x) => x.actual);
  const mejor = [...cats].sort((a, b) => b.neto - a.neto)[0];
  if (actual && mejor && mejor.categoria !== actual.categoria) {
    poner(
      "categoria",
      `Siendo ${actual.categoria} dejaste de ganar USD ${monto(mejor.neto - actual.neto)} en lo que va del año`,
      `Con ${mejor.categoria} habrías ganado USD ${monto(mejor.neto)} contra los ` +
      `USD ${monto(actual.neto)} de ahora, ya descontado el fee mensual.`
    );
  }

  // 5 · Concentracion de canales: la plata que depende de una sola fuente.
  const canal = m.origenes[0];
  if (canal && canal.porcentaje > 0.25 && canal.nombre !== "Sin dato") {
    poner(
      "concentracion",
      `El ${porcentaje(canal.porcentaje)} de tu plata viene de un solo canal`,
      `Es ${canal.nombre}. Si se corta, perdés esa porción del año.`
    );
  }

  // 6 y 7 · Lo que falta cargar. Sin eso, todas las cuentas de arriba estan incompletas.
  if (pendientes.negocios) {
    poner(
      "datos_faltantes",
      `Tenés ${pendientes.negocios} negocios con datos sin cargar`,
      `Sin eso, estas cuentas están incompletas.`
    );
  }
  if (pendientes.eventos) {
    poner(
      "novedades",
      `Tenés ${pendientes.eventos} novedades sin revisar`,
      pendientes.desde ? `La más vieja es del ${pendientes.desde}.` : `Están en la pantalla Hoy.`
    );
  }

  // 8 · El escalon de RE/MAX, que es plata de premio aparte del objetivo personal.
  const nivel = nivelRemax(c.capa1.facturacion, ajustes.niveles_remax);
  if (nivel.siguiente) {
    poner(
      "nivel_remax",
      `Para ${nivel.siguiente.nombre} te faltan USD ${monto(nivel.falta)}`,
      nivel.actual
        ? `Hoy estás en ${nivel.actual.nombre} (USD ${monto(nivel.actual.monto)}).`
        : `Todavía no llegaste al primer escalón.`
    );
  }

  return lista;
}

/* Cuenta lo que falta cargar, para las dos ultimas recomendaciones. */
export function contarPendientes(negocios, eventos) {
  const conAvisos = (negocios || []).filter(
    (n) => !n.ficha_completa && (n.avisos || []).length
  );
  const fechas = (eventos || []).map((e) => e.fecha).filter(Boolean).sort();
  return {
    negocios: conAvisos.length,
    eventos: (eventos || []).length,
    desde: fechas[0] || null,
  };
}
