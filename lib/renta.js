/* La calculadora de renta (§10).

   Reemplaza la del Excel, que tenia un tipo de cambio de 40 clavado adentro de la formula
   y no contemplaba ni los gastos de compra ni la comision de alquiler.

   Da DOS numeros, y esa es toda la gracia de la pantalla:

     BRUTA  el alquiler por doce sobre el precio. Cero descuentos, cero supuestos. Es la
            que se dice en la calle y la que el cliente ya escucho en otro lado.
     REAL   lo que queda de verdad, despues de meses vacios, impuestos, comision,
            refaccion, gastos fijos y el capital que se fue en la compra.

   La distancia entre las dos es el argumento de venta.

   Funciones puras: entran numeros, salen numeros. La pantalla no calcula nada. */

const MESES_DEL_ANIO = 12;

export const DEFAULTS = {
  meses_alquilados: 11,
  refaccion_meses: 1,          // un mes de alquiler por año
  refaccion_anual: null,       // si se carga a mano, manda sobre refaccion_meses
  plazo_anios: 0,              // 0 = no lo tengo en cuenta
  irpf_pct: 0.105,
  gastos_compra_pct: 0,        // 0 = no lo tengo en cuenta
  comision_meses: 1,
  contribucion_anual: 0,
  primaria_anual: 0,
  admin_pct: 0,
};

const numero = (x, porDefecto = 0) =>
  x === null || x === undefined || x === "" || Number.isNaN(Number(x)) ? porDefecto : Number(x);

const dividir = (a, b) => (b ? a / b : null);

/* Sin plazo de contrato la comision no se puede prorratear: no se sabe cada cuantos años
   se vuelve a pagar. Antes el plazo tenia un piso de 0,01 años, asi que un plazo en cero
   multiplicaba la comision por cien y volaba la cuenta por el aire. Ahora un plazo en cero
   quiere decir "no lo tengo en cuenta" y la comision simplemente no entra. */
export const hayPlazo = (entradas) => numero((entradas || {}).plazo_anios, 0) > 0;

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
  const plazo = numero(e.plazo_anios, 0);
  const irpf = numero(e.irpf_pct, 0);
  const admin = numero(e.admin_pct, 0);
  const comisionMeses = plazo > 0 ? numero(e.comision_meses, 0) : 0;
  const refaccionFija = e.refaccion_anual !== null && e.refaccion_anual !== undefined && e.refaccion_anual !== "";

  // Por cada dolar de alquiler mensual, esto es lo que queda limpio en el año.
  const porAlquiler =
    meses - (plazo > 0 ? comisionMeses / plazo : 0) - meses * admin - meses * irpf
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

  /* La BRUTA no descuenta nada, ni siquiera el mes vacio: doce meses sobre el precio. Es
     a proposito — el mes vacio ya es una consideracion, y el numero de la calle no la
     tiene. Si la bruta ya viniera con algo descontado, la comparacion con la real
     perderia sentido. */
  const alquilerAnualBruto = alquiler * MESES_DEL_ANIO;
  const rentaCobradaAnual = alquiler * c.meses;
  const capitalInvertido = precio * (1 + numero(e.gastos_compra_pct, 0));

  const costoComision = c.plazo > 0 ? (alquiler * c.comisionMeses) / c.plazo : 0;
  const costoAdmin = rentaCobradaAnual * c.admin;
  const costoRefaccion = c.refaccionFija
    ? numero(e.refaccion_anual, 0)
    : alquiler * numero(e.refaccion_meses, 0);
  const costosFijos = numero(e.contribucion_anual, 0) + numero(e.primaria_anual, 0);
  const impuesto = rentaCobradaAnual * c.irpf;
  const mesesVacios = alquilerAnualBruto - rentaCobradaAnual;

  const rentaNetaAnual =
    rentaCobradaAnual - costoComision - costoAdmin - costoRefaccion - costosFijos - impuesto;

  return {
    alquiler_usado: alquiler,
    falta_cotizacion,
    // Los dos numeros de la pantalla.
    renta_bruta_anual: alquilerAnualBruto,
    renta_bruta_pct: dividir(alquilerAnualBruto, precio),
    renta_neta_anual: rentaNetaAnual,
    renta_real_pct: dividir(rentaNetaAnual, capitalInvertido),
    // El detalle de por que una no es la otra.
    renta_cobrada_anual: rentaCobradaAnual,
    costo_meses_vacios: mesesVacios,
    capital_invertido: capitalInvertido,
    gastos_de_compra: capitalInvertido - precio,
    costo_comision: costoComision,
    costo_admin: costoAdmin,
    costo_refaccion: costoRefaccion,
    costos_fijos: costosFijos,
    impuesto,
    bolsillo_por_mes: rentaNetaAnual / 12,
    anios_para_recuperar: rentaNetaAnual > 0 ? capitalInvertido / rentaNetaAnual : null,
    // Cuanto se lleva todo lo que la renta de la calle no cuenta.
    perdida_por_costos: alquilerAnualBruto - rentaNetaAnual,
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
