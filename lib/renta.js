/* La calculadora de renta (§10).

   Reemplaza la del Excel, que tenia un tipo de cambio de 40 clavado adentro de la formula
   y no contemplaba ni los gastos de compra ni la comision de alquiler. Esos dos son
   justamente los que separan la renta que parece de la renta que es.

   Funciones puras: entran numeros, salen numeros. La pantalla no calcula nada. */

export const DEFAULTS = {
  meses_alquilados: 11,
  refaccion_meses: 1,          // un mes de alquiler por año
  refaccion_anual: null,       // si se carga a mano, manda sobre refaccion_meses
  plazo_anios: 2,
  irpf_pct: 0.105,
  gastos_compra_pct: 0.07,
  comision_meses: 1,
  contribucion_anual: 0,
  primaria_anual: 0,
  admin_pct: 0,
};

const numero = (x, porDefecto = 0) =>
  x === null || x === undefined || x === "" || Number.isNaN(Number(x)) ? porDefecto : Number(x);

const dividir = (a, b) => (b ? a / b : null);

/* El alquiler puede estar en pesos y el precio en dolares. Todo se lleva a la moneda del
   precio antes de calcular; si falta la cotizacion, se avisa en vez de inventar una. */
export function alquilerEnMonedaDelPrecio(entradas) {
  const alquiler = numero(entradas.alquiler_mensual, 0);
  if (entradas.moneda_alquiler !== "UYU" || entradas.moneda_precio === "UYU") {
    return { alquiler, falta_cotizacion: false };
  }
  const cambio = numero(entradas.tipo_cambio, 0);
  if (!cambio) return { alquiler: 0, falta_cotizacion: true };
  return { alquiler: alquiler / cambio, falta_cotizacion: false };
}

/* Cuanto se lleva cada peso de alquiler y cuanto se paga si o si.

   Separar los costos que dependen del alquiler de los que no es lo que despues permite
   despejar el alquiler necesario para una renta objetivo sin tantear. */
export function coeficientes(entradas) {
  const e = { ...DEFAULTS, ...entradas };
  const meses = numero(e.meses_alquilados, DEFAULTS.meses_alquilados);
  const plazo = Math.max(0.01, numero(e.plazo_anios, DEFAULTS.plazo_anios));
  const irpf = numero(e.irpf_pct, 0);
  const admin = numero(e.admin_pct, 0);
  const comisionMeses = numero(e.comision_meses, 0);
  const refaccionFija = e.refaccion_anual !== null && e.refaccion_anual !== undefined && e.refaccion_anual !== "";

  // Por cada dolar de alquiler mensual, esto es lo que queda limpio en el año.
  const porAlquiler =
    meses - comisionMeses / plazo - meses * admin - meses * irpf
    - (refaccionFija ? 0 : numero(e.refaccion_meses, 0));

  const fijos =
    numero(e.contribucion_anual, 0)
    + numero(e.primaria_anual, 0)
    + (refaccionFija ? numero(e.refaccion_anual, 0) : 0);

  return { porAlquiler, fijos, meses, plazo, irpf, admin, comisionMeses, refaccionFija };
}

export function calcular(entradas) {
  const e = { ...DEFAULTS, ...entradas };
  const precio = numero(e.precio, 0);
  const { alquiler, falta_cotizacion } = alquilerEnMonedaDelPrecio(e);
  const c = coeficientes(e);

  const rentaBrutaAnual = alquiler * c.meses;
  const capitalInvertido = precio * (1 + numero(e.gastos_compra_pct, 0));

  const costoComision = (alquiler * c.comisionMeses) / c.plazo;
  const costoAdmin = rentaBrutaAnual * c.admin;
  const costoRefaccion = c.refaccionFija
    ? numero(e.refaccion_anual, 0)
    : alquiler * numero(e.refaccion_meses, 0);
  const costosFijos = numero(e.contribucion_anual, 0) + numero(e.primaria_anual, 0);
  const impuesto = rentaBrutaAnual * c.irpf;

  const rentaNetaAnual =
    rentaBrutaAnual - costoComision - costoAdmin - costoRefaccion - costosFijos - impuesto;

  return {
    alquiler_usado: alquiler,
    falta_cotizacion,
    renta_bruta_anual: rentaBrutaAnual,
    capital_invertido: capitalInvertido,
    costo_comision: costoComision,
    costo_admin: costoAdmin,
    costo_refaccion: costoRefaccion,
    costos_fijos: costosFijos,
    impuesto: impuesto,
    renta_neta_anual: rentaNetaAnual,
    renta_bruta_pct: dividir(rentaBrutaAnual, precio),
    renta_real_pct: dividir(rentaNetaAnual, capitalInvertido),
    bolsillo_por_mes: rentaNetaAnual / 12,
    anios_para_recuperar: rentaNetaAnual > 0 ? capitalInvertido / rentaNetaAnual : null,
    // Cuanto se lleva todo lo que el Excel no contaba.
    perdida_por_costos: rentaBrutaAnual - rentaNetaAnual,
  };
}

/* §10.4 — la moneda se deduce de la relacion alquiler/precio, no de la cantidad de digitos.
   Con digitos, un alquiler de 1.200 USD sobre una casa de 200.000 se leia como pesos. */
export function detectarMoneda(alquilerMensual, precio) {
  const a = numero(alquilerMensual, 0);
  const p = numero(precio, 0);
  if (!a || !p) return "sin_datos";
  const ratio = a / p;
  if (ratio >= 0.003 && ratio <= 0.012) return "misma";
  if (ratio >= 0.1) return "uyu_sobre_usd";
  return "dudosa";
}

/* Cuanto habria que cobrar de alquiler para llegar a una renta real objetivo. */
export function alquilerNecesario(entradas, objetivoPct) {
  const e = { ...DEFAULTS, ...entradas };
  const precio = numero(e.precio, 0);
  const capital = precio * (1 + numero(e.gastos_compra_pct, 0));
  const c = coeficientes(e);
  if (c.porAlquiler <= 0 || !capital) return null;
  return (objetivoPct * capital + c.fijos) / c.porAlquiler;
}

/* Cuanto es lo maximo que se puede pagar por la propiedad para que la renta cierre. */
export function precioMaximo(entradas, objetivoPct) {
  const e = { ...DEFAULTS, ...entradas };
  const gastos = numero(e.gastos_compra_pct, 0);
  const neta = calcular({ ...e, precio: 0 }).renta_neta_anual;
  if (neta <= 0 || !objetivoPct) return null;
  return neta / (objetivoPct * (1 + gastos));
}
