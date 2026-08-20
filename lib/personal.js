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

/* Un fijo se paga una vez por mes, y CADA PAGO GUARDA SU MONTO.

   Si el historial se calculara con el monto de hoy, subir el alquiler reescribiría todos los
   meses anteriores y las gráficas del año pasado cambiarían solas. */
export const pagoDelMes = (fijo, mes) => ((fijo || {}).pagos || {})[mes] || null;

export const estaPago = (fijo, mes) => Boolean(pagoDelMes(fijo, mes));

/* Los fijos que este mes todavía no se pagaron, con lo que van a costar. */
export function faltaPagar(personal, mes) {
  return (personal.fijos || [])
    .filter((f) => f.activo !== false && !estaPago(f, mes))
    .map((f) => ({ ...f, monto: numero(f.monto), moneda: monedaDe(f.moneda) }));
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
      if (mes <= mesDe(tope)) sumar(caja, pago.moneda || f.moneda, -numero(pago.monto));
    }
  }
  return caja;
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
