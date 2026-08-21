/* La cara PERSONAL: la plata de Juan, no la del negocio.

   VIVE EN EL TELÉFONO Y NUNCA VA AL REPO. El repositorio de esta app es público. Que se vea
   cuánto factura una inmobiliaria no le sirve a nadie; que se vea cuánta plata tiene una
   persona en la cuenta, qué gasta y cuándo, sí — es la lista de la compra para robarle. Se
   guarda igual que las cuentas bancarias y la firma: en `localStorage`, y listo.

   El costo de esa decisión es que si borra los datos del navegador o cambia de teléfono, se
   pierde todo. Por eso existe `aTexto`/`desdeTexto`: bajarse una copia y volver a cargarla.

   DOS MONEDAS, SIEMPRE SEPARADAS. En Uruguay se cobra en dólares y se vive en pesos, y son
   dos cajas distintas. Juntarlas en un solo número obliga a inventar un tipo de cambio todos
   los días y a que el saldo cambie solo cuando el dólar se mueve, sin que nadie haya gastado
   nada. Para pasar de una a otra está `cambios`, que es lo que de verdad pasa: se venden
   dólares y entran pesos.

   Funciones puras: entra el estado guardado, salen números. */

const CLAVE = "como-venimos:personal";

export const MONEDAS = ["UYU", "USD"];

/* Las categorías de un gasto suelto. Cortas y pocas: en el momento de cargar un gasto en la
   calle, elegir entre veinte es no cargarlo. */
export const CATEGORIAS = [
  "Comida", "Casa", "Transporte", "Salidas", "Salud", "Ropa", "Otros",
];

export const VACIO = {
  /* Desde cuándo cuenta. Los cobros anteriores a esta fecha NO entran: la plata vieja ya se
     gastó, y sumarla haría aparecer un saldo que no existe. */
  arranque: { fecha: null, uyu: 0, usd: 0 },
  fijos: [],
  variables: [],
  entradas: [],
  cambios: [],
  /* Cuánto se le descuenta a la ganancia de un negocio antes de entrar acá. Arranca en CERO
     porque Juan lo pidió así: la ganancia entra sola y entera. Queda el campo porque lo que
     la app llama ganancia es ANTES de impuestos, y lo que cae al banco es menos. */
  impuestos_pct: 0,
  /* Qué categoría le corresponde a cada comercio del banco. Se llena solo: la que se elige
     al anotar un aviso queda guardada, y la próxima compra en ese lugar ya viene puesta. */
  aprendidas: {},
};

const numero = (x) => {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
};

const monedaDe = (x) => (x === "USD" ? "USD" : "UYU");

export const mesDe = (iso) => String(iso || "").slice(0, 7);

/* Un id que no se repite sin depender del reloj ni del azar: el mayor que haya + 1. */
export function proximoId(lista) {
  const mayor = (lista || []).reduce((n, x) => Math.max(n, Number(x.id) || 0), 0);
  return mayor + 1;
}

/* ---------- Guardar y leer ---------- */

export function leer(deposito = globalThis.localStorage) {
  try {
    const crudo = deposito && deposito.getItem(CLAVE);
    if (!crudo) return { ...VACIO };
    return sanear(JSON.parse(crudo));
  } catch {
    return { ...VACIO };
  }
}

/* Contesta si de verdad quedó guardado. Un navegador en modo privado, o con el disco lleno,
   tira al escribir — y la pantalla tiene que poder avisar en vez de dar por hecho que sí. */
export function guardar(datos, deposito = globalThis.localStorage) {
  if (!deposito) return false;
  try {
    deposito.setItem(CLAVE, JSON.stringify(sanear(datos)));
    return true;
  } catch {
    return false;
  }
}

/* Lo guardado puede venir de una versión vieja o de un archivo tocado a mano. Todo lo que
   falte se completa; nada de acá adentro puede tirar abajo la app. */
export function sanear(datos) {
  const d = datos && typeof datos === "object" ? datos : {};
  const lista = (x) => (Array.isArray(x) ? x : []);
  const arranque = d.arranque && typeof d.arranque === "object" ? d.arranque : {};
  return {
    arranque: {
      fecha: arranque.fecha || null,
      uyu: numero(arranque.uyu),
      usd: numero(arranque.usd),
    },
    fijos: lista(d.fijos),
    variables: lista(d.variables),
    entradas: lista(d.entradas),
    cambios: lista(d.cambios),
    impuestos_pct: numero(d.impuestos_pct),
    aprendidas: d.aprendidas && typeof d.aprendidas === "object" && !Array.isArray(d.aprendidas)
      ? d.aprendidas
      : {},
  };
}

/* La copia de respaldo. Es texto plano y adentro está TODO: cuánto tiene y en qué gasta.
   Quien lo baje tiene que saber que ese archivo no se manda por mail ni queda en una carpeta
   compartida — la pantalla se lo dice al ofrecerlo. */
export const aTexto = (datos) => JSON.stringify(sanear(datos), null, 1);

export function desdeTexto(texto) {
  try {
    const leido = JSON.parse(texto);
    if (!leido || typeof leido !== "object" || Array.isArray(leido)) return null;
    return sanear(leido);
  } catch {
    return null;
  }
}

/* ---------- Lo que entra de los negocios ---------- */

/* Un negocio cobrado le pone plata en el bolsillo, y eso pasa a la cara personal SOLO.

   El corte por fecha es lo que hace que la cuenta arranque de cero: los 9.672 que Juan ya
   había ganado en 2026 no cuentan porque ya se los gastó. Sin esta fecha, el día que
   corrigiera un negocio viejo se le metería plata fantasma. */
export function cobrosDeNegocios(negocios, desde, impuestosPct = 0) {
  const corte = desde || "9999-12-31";
  const quita = Math.min(1, Math.max(0, numero(impuestosPct)));
  return (negocios || [])
    .filter((n) => n.estado === "cerrado" && n.fecha_fin && n.fecha_fin >= corte && n.ganancia)
    .map((n) => ({
      id: n.id,
      fecha: n.fecha_fin,
      direccion: n.direccion || "",
      /* Siempre en dólares: la ganancia de un negocio se calcula en dólares en toda la app. */
      monto: numero(n.ganancia) * (1 - quita),
      bruto: numero(n.ganancia),
    }));
}

/* ---------- Los gastos fijos ---------- */

/* Cuántos pagos se promedian para estimar uno que cambia todos los meses. Tres es el mínimo
   que aguanta una factura rara sin dejar de seguir a la realidad: con uno solo, un mes de
   aire acondicionado prendido deja la estimación arriba todo el año. */
export const PAGOS_QUE_SE_PROMEDIAN = 3;

/* Hay gastos que se pagan SÍ O SÍ todos los meses pero por un monto distinto cada vez: UTE,
   OSE, Antel, BPS. No son variables —no se puede elegir no pagarlos— pero tampoco tienen un
   número fijo.

   Para esos, el monto de la ficha es sólo una referencia inicial y lo que manda es el
   promedio de lo que se viene pagando. Así "falta pagar este mes" se acerca a la verdad en
   vez de repetir para siempre el número que se cargó el primer día. */
export function montoEstimado(fijo) {
  const puesto = numero(fijo.monto);
  if (!fijo.varia) return { monto: puesto, aproximado: false, sobre: 0 };

  const pagados = Object.entries(fijo.pagos || {})
    .sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, PAGOS_QUE_SE_PROMEDIAN)
    .map(([, pago]) => numero(pago.monto))
    .filter((m) => m > 0);

  if (!pagados.length) return { monto: puesto, aproximado: true, sobre: 0 };
  const suma = pagados.reduce((t, m) => t + m, 0);
  return { monto: suma / pagados.length, aproximado: true, sobre: pagados.length };
}

/* Un fijo se paga una vez por mes, y CADA PAGO GUARDA SU MONTO.

   Si el historial se calculara con el monto de hoy, subir el alquiler reescribiría todos los
   meses anteriores y las gráficas del año pasado cambiarían solas. */
export const pagoDelMes = (fijo, mes) => ((fijo || {}).pagos || {})[mes] || null;

export const estaPago = (fijo, mes) => Boolean(pagoDelMes(fijo, mes));

/* Un pago marcado como YA HECHO antes de empezar a contar.

   Pasa una sola vez, al cargar la app: los gastos de este mes ya estaban pagados cuando se
   puso el saldo inicial, así que ese saldo YA los tiene descontados. Volver a restarlos sería
   cobrárselos dos veces.

   Cuenta igual como gasto del mes —la plata salió de verdad, y las gráficas y el ritmo tienen
   que verla— pero no toca el saldo. */
export const yaEstabaPago = (pago) => Boolean(pago && pago.previo);

/* Los fijos que este mes todavía no se pagaron, con lo que van a costar.

   Los que cambian de monto entran con su estimación, marcados como aproximados: es la única
   forma de que "me queda" sirva para algo antes de que lleguen las facturas. */
export function faltaPagar(personal, mes) {
  return (personal.fijos || [])
    .filter((f) => f.activo !== false && !estaPago(f, mes))
    .map((f) => {
      const estimado = montoEstimado(f);
      return {
        ...f,
        monto: estimado.monto,
        aproximado: estimado.aproximado,
        moneda: monedaDe(f.moneda),
      };
    });
}

/* ---------- Los saldos ---------- */

const vacio = () => ({ UYU: 0, USD: 0 });

const sumar = (caja, moneda, monto) => {
  caja[monedaDe(moneda)] += numero(monto);
  return caja;
};

/* Lo que hay en la cuenta HOY: lo que entró menos lo que ya se pagó.

   Un gasto variable descuenta al cargarlo, porque cargarlo es contar algo que ya se compró.
   Un gasto fijo descuenta al marcarlo pagado, porque hasta entonces la plata sigue estando.
   De esa diferencia sale el "si pago todo me queda", que es la pregunta de la pantalla. */
export function saldos(personal, negocios, hasta) {
  const d = sanear(personal);
  const tope = hasta || "9999-12-31";
  const caja = vacio();
  sumar(caja, "UYU", d.arranque.uyu);
  sumar(caja, "USD", d.arranque.usd);

  for (const c of cobrosDeNegocios(negocios, d.arranque.fecha, d.impuestos_pct)) {
    if (c.fecha <= tope) sumar(caja, "USD", c.monto);
  }
  for (const e of d.entradas) {
    if ((e.fecha || "") <= tope) sumar(caja, e.moneda, e.monto);
  }
  for (const c of d.cambios) {
    if ((c.fecha || "") > tope) continue;
    sumar(caja, c.de, -numero(c.monto_de));
    sumar(caja, c.a, numero(c.monto_a));
  }
  for (const v of d.variables) {
    if ((v.fecha || "") <= tope) sumar(caja, v.moneda, -numero(v.monto));
  }
  for (const f of d.fijos) {
    for (const [mes, pago] of Object.entries(f.pagos || {})) {
      if (yaEstabaPago(pago)) continue;
      if (mes <= mesDe(tope)) sumar(caja, pago.moneda || f.moneda, -numero(pago.monto));
    }
  }
  return caja;
}

/* ---------- El cambio de moneda, deducido ---------- */

/* Nadie paga en pesos con plata que no tiene. Si después de un gasto la caja de pesos queda
   en rojo y hay dólares, lo que pasó en la vida real es que se cambiaron dólares — y al
   revés. En vez de pedir que se anote a mano, se deduce.

   Se devuelve el cambio que hace falta para que ninguna caja quede negativa, o `null` si no
   hay nada que hacer (o si las DOS están en rojo, que no lo arregla ningún cambio).

   OJO: la cotización es la que tiene la app ese día, NO la del BBVA. El BCU la publica pero
   no deja leerla desde una página como esta, y el BBVA directamente no contesta. Por eso el
   cambio que sale de acá queda guardado, visible en la lista y se puede corregir o borrar:
   es una deducción, no una verdad. */
export function cambioQueHaceFalta(caja, dolar) {
  const cotizacion = numero(dolar);
  if (!cotizacion || cotizacion <= 0) return null;
  if (caja.UYU >= 0 && caja.USD >= 0) return null;
  if (caja.UYU < 0 && caja.USD < 0) return null;

  if (caja.UYU < 0) {
    const faltan = -caja.UYU;
    const salen = faltan / cotizacion;
    /* Si no alcanzan los dólares se cambia lo que hay: el resto queda en rojo, que es la
       verdad — no hay de dónde sacarlo. */
    const usados = Math.min(salen, caja.USD);
    if (usados <= 0) return null;
    return { de: "USD", monto_de: usados, a: "UYU", monto_a: usados * cotizacion, dolar: cotizacion };
  }

  const faltan = -caja.USD;
  const salen = faltan * cotizacion;
  const usados = Math.min(salen, caja.UYU);
  if (usados <= 0) return null;
  return { de: "UYU", monto_de: usados, a: "USD", monto_a: usados / cotizacion, dolar: cotizacion };
}

/* Deja el estado con el cambio ya anotado, si hacía falta. Devuelve el estado nuevo y el
   cambio que se agregó, para poder decirlo en pantalla. */
export function conElCambioDeducido(personal, negocios, hoy, dolar) {
  const caja = saldos(personal, negocios, hoy);
  const hace = cambioQueHaceFalta(caja, dolar);
  if (!hace) return { datos: personal, cambio: null };
  const cambio = {
    id: proximoId(personal.cambios), fecha: hoy, automatico: true, ...hace,
  };
  return { datos: { ...personal, cambios: [...personal.cambios, cambio] }, cambio };
}

/* ---------- El mes ---------- */

/* Todo lo que se gastó en un mes, de las dos formas, para las gráficas y el ritmo. */
export function gastadoEnElMes(personal, mes) {
  const d = sanear(personal);
  const caja = vacio();
  for (const v of d.variables) {
    if (mesDe(v.fecha) === mes) sumar(caja, v.moneda, numero(v.monto));
  }
  for (const f of d.fijos) {
    const pago = pagoDelMes(f, mes);
    if (pago) sumar(caja, pago.moneda || f.moneda, numero(pago.monto));
  }
  return caja;
}

/* Lo mismo pero sólo hasta un día, para poder comparar contra el mes pasado A ESTA MISMA
   ALTURA. Comparar el día 8 contra un mes entero no dice nada. */
export function gastadoHastaElDia(personal, mes, dia) {
  const d = sanear(personal);
  const caja = vacio();
  for (const v of d.variables) {
    if (mesDe(v.fecha) === mes && Number(String(v.fecha).slice(8, 10)) <= dia) {
      sumar(caja, v.moneda, numero(v.monto));
    }
  }
  for (const f of d.fijos) {
    const pago = pagoDelMes(f, mes);
    if (pago && Number(String(pago.fecha || "").slice(8, 10) || 99) <= dia) {
      sumar(caja, pago.moneda || f.moneda, numero(pago.monto));
    }
  }
  return caja;
}

export const mesAnterior = (mes) => {
  const [a, m] = String(mes).split("-").map(Number);
  return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, "0")}`;
};

export const diasDelMes = (mes) => {
  const [a, m] = String(mes).split("-").map(Number);
  return new Date(Date.UTC(a, m, 0)).getUTCDate();
};

/* ---------- El resumen, que es lo que se mira ---------- */

/* Los tres números de arriba y los dos de abajo, en las dos monedas.

   `porDia` es el que de verdad frena la mano en el momento de gastar: lo que queda dividido
   los días que faltan del mes. Los fijos que faltan pagar ya están descontados, así que no
   promete plata que tiene dueño. */
export function resumen(personal, negocios, hoy) {
  const d = sanear(personal);
  const mes = mesDe(hoy);
  const dia = Number(String(hoy).slice(8, 10));
  const tengo = saldos(d, negocios, hoy);

  const pendientes = faltaPagar(d, mes);
  const falta = vacio();
  for (const f of pendientes) sumar(falta, f.moneda, f.monto);

  const queda = vacio();
  const porDia = vacio();
  const diasQueFaltan = Math.max(1, diasDelMes(mes) - dia + 1);
  for (const m of MONEDAS) {
    queda[m] = tengo[m] - falta[m];
    porDia[m] = queda[m] / diasQueFaltan;
  }

  const esteMes = gastadoHastaElDia(d, mes, dia);
  const anterior = gastadoHastaElDia(d, mesAnterior(mes), dia);

  return {
    mes,
    tengo,
    falta,
    queda,
    porDia,
    diasQueFaltan,
    pendientes,
    /* Contra el mes pasado a esta misma altura. `null` cuando no hay con qué comparar: un
       "subiste 100%" contra un mes sin datos es una mentira con forma de número. */
    ritmo: Object.fromEntries(MONEDAS.map((m) => [m, {
      ahora: esteMes[m],
      antes: anterior[m],
      cambio: anterior[m] ? (esteMes[m] - anterior[m]) / anterior[m] : null,
    }])),
    /* Si no hay nada cargado, la pantalla muestra por dónde empezar en vez de ceros. */
    arrancado: Boolean(d.arranque.fecha),
    hayMovimiento: d.variables.length > 0 || d.fijos.length > 0,
  };
}

/* ---------- Mes a mes, para las gráficas ---------- */

/* Los últimos `cuantos` meses terminados en el actual. Se devuelven TODOS, incluso los
   vacíos: un mes sin gastos es información, y saltearlo deforma la gráfica. */
export function mesAMes(personal, hoy, cuantos = 6) {
  const meses = [];
  let mes = mesDe(hoy);
  for (let i = 0; i < cuantos; i += 1) {
    meses.unshift(mes);
    mes = mesAnterior(mes);
  }
  return meses.map((m) => ({ mes: m, gastado: gastadoEnElMes(personal, m) }));
}

/* Cuánto va a terminar gastando este mes, si sigue al ritmo de lo que va.

   Regla de tres sobre los días transcurridos. Es tosca a propósito: los primeros días de un
   mes cualquier proyección es ruido, así que antes del día 5 no se muestra. */
export const DIA_DESDE_EL_QUE_SE_PROYECTA = 5;

export function proyeccionDelMes(personal, hoy) {
  const mes = mesDe(hoy);
  const dia = Number(String(hoy).slice(8, 10));
  if (dia < DIA_DESDE_EL_QUE_SE_PROYECTA) return null;
  const vaGastando = gastadoHastaElDia(personal, mes, dia);
  const total = diasDelMes(mes);
  const salida = vacio();
  for (const m of MONEDAS) salida[m] = (vaGastando[m] / dia) * total;
  return { mes, dia, proyectado: salida, vaGastando };
}
