/* Cuánto cuesta cerrar una operación.

   Es la primera pregunta de cualquier cliente —"¿y a mí cuánto me sale?"— y hasta ahora se
   contestaba a mano, con la calculadora del teléfono, adelante del cliente.

   Cada gasto nace en la moneda en que se paga y ahí se queda:

     ITP                2% del VALOR CATASTRAL, en pesos, y lo paga CADA parte el suyo
     escribano          3% del precio, en dólares, del lado del COMPRADOR
     IRPF               del lado del VENDEDOR, en dólares, con dos formas de calcularlo
     cédula catastral   un monto en pesos
     comisión           de cada parte, en % del precio o en un monto fijo

   El ITP no sale del precio de venta sino del valor catastral, que es otro número y mucho
   más bajo. Confundirlos es el error que hace que la cuenta dé cualquier cosa.

   DOS COSAS QUE NO SE PUEDEN CALCULAR, y por eso no se calculan:

   - Los honorarios del escribano DEL VENDEDOR. Son menores que los del comprador pero no
     hay un número: se acuerdan. Poner uno inventado sería peor que no poner nada, porque el
     cliente lo tomaría por bueno.
   - Los gastos sueltos de la escritura (certificados, timbres, inscripción). El escribano
     los sabe; acá se avisa que existen.

   Funciones puras: entran números, salen números. La pantalla no calcula nada. */

export const POR_DEFECTO = {
  /* Cada parte paga su 2%, siempre sobre el valor catastral. */
  itp: 0.02,
  /* Del comprador. El del vendedor no se puede saber. */
  escribano: 0.03,
  /* En pesos. */
  cedula: 5500,
  irpf_ganancia: 0.12,
  irpf_ficto: 0.018,
  /* Lo que se le cobra a cada parte. Se puede pasar a monto fijo desde la pantalla. */
  comision: 0.03,
};

/* Las dos formas de calcular el IRPF del vendedor. Se elige una: no se suman ni se
   promedian, son dos regímenes distintos y el vendedor entra en uno. */
export const FORMAS_DE_IRPF = [
  { clave: "ganancia", nombre: "12% de la ganancia", pista: "hace falta a cuánto la compró" },
  { clave: "ficto", nombre: "1,8% del precio", pista: "sin mirar a cuánto la compró" },
];

const numero = (x, siNo = 0) => {
  const n = Number(x);
  return Number.isFinite(n) && n > 0 ? n : siNo;
};

const tasa = (x, siNo) => {
  const n = Number(x);
  return Number.isFinite(n) && n >= 0 ? n : siNo;
};

/* Si el campo tiene algo escrito. Un cero escrito no es lo mismo que un campo vacío. */
const dado = (x) => x !== null && x !== undefined && x !== "" && Number.isFinite(Number(x));

/* Un porcentaje dicho como lo diria una persona. Sin esto, 0,018 × 100 da
   1,7999999999999998 y eso salia impreso en la pantalla del cliente. */
const enPorciento = (f) => `${String(Number((f * 100).toFixed(4))).replace(".", ",")}%`;

/* Un gasto que nace en PESOS. Se guarda en pesos y se anota cuánto es en dólares, porque el
   precio de la operación está en dólares y los dos números tienen que poder sumarse. */
const enPesos = (clave, nombre, detalle, uyu, dolar) => ({
  clave, nombre, detalle, uyu,
  usd: dolar ? uyu / dolar : null,
  nace: "UYU",
});

const enDolares = (clave, nombre, detalle, usd) => ({
  clave, nombre, detalle, usd, uyu: null, nace: "USD",
});

/* El IRPF del vendedor, por el camino que se haya elegido.

   Por la ganancia: 12% de lo que subió desde que la compró. Si la vende por menos de lo que
   pagó no hay ganancia y no hay impuesto — nunca un número negativo, que sería un impuesto
   que le devuelven.

   Por el ficto: 1,8% del precio, sin preguntar nada más. */
export function irpfDelVendedor(precio, compra, forma, tasas = {}) {
  const venta = numero(precio);
  const pctGanancia = tasa(tasas.irpf_ganancia, POR_DEFECTO.irpf_ganancia);
  const pctFicto = tasa(tasas.irpf_ficto, POR_DEFECTO.irpf_ficto);

  if (forma === "ganancia") {
    const pagado = numero(compra);
    const ganancia = Math.max(0, venta - pagado);
    return {
      monto: ganancia * pctGanancia,
      pct: pctGanancia,
      ganancia,
      /* Sin el precio de compra la cuenta daría el 12% del precio entero, que es como
         cobrarle impuesto a plata que nunca ganó. Se avisa en vez de mostrarlo. */
      falta: !dado(compra),
      detalle: `${enPorciento(pctGanancia)} de la ganancia`,
    };
  }

  return {
    monto: venta * pctFicto,
    pct: pctFicto,
    ganancia: null,
    falta: false,
    detalle: `${enPorciento(pctFicto)} del precio`,
  };
}

/* La comisión de una punta: o un porcentaje del precio, o un monto fijo en dólares.

   Va ADENTRO de la cuenta y no aparte, porque es el gasto más grande de los dos lados y
   dejarlo afuera hacía que el "te queda" pareciera final cuando no lo era. Los porcentajes
   con IVA y descuentos siguen viviendo en `lib/comisiones.js`: acá entra el número redondo
   que se le cobra a cada uno, que es lo que el cliente necesita ver en esta cuenta. */
export function comisionDeLaPunta(precio, cuanto, tipo, siNo = POR_DEFECTO.comision) {
  const valor = tasa(cuanto, siNo);
  if (tipo === "monto") return { monto: valor, detalle: "" };
  return { monto: numero(precio) * valor, detalle: `${enPorciento(valor)} del precio` };
}

export function calcularCierre(entradas = {}, tasas = {}) {
  const precio = numero(entradas.precio);
  const catastral = numero(entradas.catastral);
  const dolar = numero(entradas.dolar);
  const forma = entradas.irpf === "ficto" ? "ficto" : "ganancia";

  const pctItp = tasa(tasas.itp, POR_DEFECTO.itp);
  const pctEscribano = tasa(tasas.escribano, POR_DEFECTO.escribano);
  const cedula = tasa(tasas.cedula, POR_DEFECTO.cedula);

  const itp = catastral * pctItp;
  const irpf = irpfDelVendedor(precio, entradas.compra, forma, tasas);

  /* Un solo tipo para las dos puntas —o las dos en porcentaje, o las dos en monto— porque
     mezclarlas es un caso que no pasa y agregaba un control más a la pantalla. */
  const laComision = entradas.comision || {};
  const tipoComision = laComision.tipo === "monto" ? "monto" : "pct";
  const comisionDe = (lado) => comisionDeLaPunta(
    precio, laComision[lado], tipoComision, tasas.comision ?? POR_DEFECTO.comision);

  /* El ITP aparece de los DOS lados: no es que se pague una vez y se reparta, cada parte
     paga el suyo sobre el mismo valor catastral. */
  const laItp = () => enPesos("itp", "ITP",
    `${(pctItp * 100).toFixed(0)}% del valor catastral`, itp, dolar);

  const comisionComprador = comisionDe("comprador");
  const comisionVendedor = comisionDe("vendedor");

  const comprador = [
    laItp(),
    enDolares("escribano", "Honorarios del escribano",
      `${(pctEscribano * 100).toFixed(0)}% del precio`, precio * pctEscribano),
    enDolares("comision", "Comisión inmobiliaria",
      comisionComprador.detalle, comisionComprador.monto),
  ].filter((g) => g.uyu || g.usd);

  /* La fila del IRPF esta SIEMPRE, aunque falte el dato: asi conserva su lugar entre el ITP
     y la cedula, y el renglon muestra un guion en vez de desaparecer. Un gasto que se
     esfuma es un gasto que el cliente no sabe que existe. */
  const elIrpf = {
    ...enDolares("irpf", "IRPF", irpf.detalle, irpf.falta ? null : irpf.monto),
    falta: irpf.falta,
  };

  const vendedor = [
    laItp(),
    elIrpf,
    enDolares("comision", "Comisión inmobiliaria",
      comisionVendedor.detalle, comisionVendedor.monto),
    enPesos("cedula", "Cédula catastral", "", cedula, dolar),
  ].filter((g) => g.uyu || g.usd || g.falta);

  /* Si no hay cotización, los gastos en pesos no se pueden sumar con los que están en
     dólares. Antes que mostrar un total que le falta un pedazo, no se muestra ninguno. */
  const faltaDolar = !dolar;
  const sumar = (gastos) => (faltaDolar ? null : gastos.reduce((t, g) => t + (g.usd || 0), 0));

  const totalComprador = sumar(comprador);
  const totalVendedor = sumar(vendedor);

  return {
    precio,
    dolar,
    faltaDolar,
    forma,
    irpf,
    itp,
    tipoComision,
    hayDatos: precio > 0 || catastral > 0,
    comprador: {
      gastos: comprador,
      total: totalComprador,
      /* Lo que de verdad tiene que juntar: el precio más los gastos. */
      pone: totalComprador === null ? null : precio + totalComprador,
    },
    vendedor: {
      gastos: vendedor,
      total: totalVendedor,
      queda: totalVendedor === null ? null : precio - totalVendedor,
    },
  };
}

/* ---------- Lo que se le manda al cliente ---------- */

const usd = (n) => `USD ${Math.round(n || 0).toLocaleString("es-UY")}`;
const uyu = (n) => `$ ${Math.round(n || 0).toLocaleString("es-UY")}`;

/* Un gasto se dice en la moneda en que se paga, y si nació en pesos va con el equivalente
   al lado. El cliente que va a firmar paga pesos por el ITP: decírselo sólo en dólares lo
   obliga a hacer la cuenta él. */
const renglon = (g) => {
  const nombre = `· ${g.nombre}${g.detalle && !g.falta ? ` (${g.detalle})` : ""}`;
  if (g.falta) return `${nombre}: falta saber a cuánto la compraste`;
  if (g.nace === "UYU") return `${nombre}: ${uyu(g.uyu)}${g.usd ? ` — ${usd(g.usd)}` : ""}`;
  return `${nombre}: ${usd(g.usd)}`;
};

/* El aviso que va SIEMPRE, en los dos mensajes.

   Una escritura tiene gastos sueltos —certificados, timbres, inscripción— que dependen del
   caso y que sólo el escribano puede juntar. Sin esta línea, el número de arriba se lee como
   la cuenta final y después aparece plata que el cliente no esperaba. */
const OTROS_GASTOS = "Puede haber otros gastos de escritura que no se pueden calcular de "
  + "antemano; el escribano te los va a poder detallar.";

/* Y esto va SÓLO en el del vendedor. Sus honorarios de escribano no tienen un porcentaje:
   se acuerdan. Callarlo haría que el "te queda" de arriba parezca limpio cuando todavía
   falta ese descuento. */
const ESCRIBANO_DEL_VENDEDOR = "Los honorarios del escribano se acuerdan con él, pero son "
  + "menores a lo que cobra un escribano de la parte compradora.";

/* A cuánto se tomó el dólar, para que el número se pueda auditar tres meses después.

   Se arma acá y no con `comoSeDice` de `lib/cambio.js` porque esa frase la comparten la
   calculadora de renta y la ficha del cliente: cambiarla les movería el piso a las dos. */
const tipoDeCambio = (dolar) => (dolar
  ? `Se usó este tipo de cambio: U$S ${Number(dolar.toFixed(2)).toLocaleString("es-UY")}`
  : null);

const conTitulo = (encabezado, titulo) => (titulo ? [encabezado, titulo, ""] : [encabezado, ""]);

export function textoParaElVendedor(r, { titulo } = {}) {
  const lineas = conTitulo("*Qué te queda de la venta*", titulo);
  lineas.push(`Precio de venta: ${usd(r.precio)}`);
  lineas.push("");
  lineas.push("Gastos:");
  lineas.push(...r.vendedor.gastos.map(renglon));
  lineas.push("");
  lineas.push(`*Te quedan: ${usd(r.vendedor.queda)}*`);
  lineas.push("");
  lineas.push(ESCRIBANO_DEL_VENDEDOR);
  lineas.push(OTROS_GASTOS);
  const cambio = tipoDeCambio(r.dolar);
  if (cambio) lineas.push(cambio);
  return lineas.join("\n");
}

export function textoParaElComprador(r, { titulo } = {}) {
  const lineas = conTitulo("*Qué tenés que poner además del precio*", titulo);
  lineas.push(`Precio: ${usd(r.precio)}`);
  lineas.push("");
  lineas.push("Gastos:");
  lineas.push(...r.comprador.gastos.map(renglon));
  lineas.push("");
  lineas.push(`*En total ponés: ${usd(r.comprador.pone)}*`);
  lineas.push("");
  lineas.push(OTROS_GASTOS);
  const cambio = tipoDeCambio(r.dolar);
  if (cambio) lineas.push(cambio);
  return lineas.join("\n");
}
