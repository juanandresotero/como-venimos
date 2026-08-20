/* La calculadora de comisiones.

   Sacar el 3% de un precio lo hace cualquier calculadora. Lo que no hace ninguna es lo que
   pasa de verdad al cerrar un negocio: que a un cliente le hiciste un descuento, que
   pusiste plata de tu bolsillo para juntar dos precios que no se tocaban, o que el
   comprador dijo "pago 100.000 con tu comisión adentro" y hay que despejar cuánto es la
   oferta.

   Todo se calcula POR PUNTA, porque cada lado es un trato distinto: al comprador le podés
   hacer un descuento y al vendedor no.

   Funciones puras: entran números, salen números. La pantalla no calcula nada. */

export const LADOS = [
  { clave: "vendedora", nombre: "Vendedora", quien: "el que vende" },
  { clave: "compradora", nombre: "Compradora", quien: "el que compra" },
];

export const DESCUENTOS = [
  { clave: "nada", nombre: "Sin descuento" },
  { clave: "pct", nombre: "% de tu comisión" },
  { clave: "monto", nombre: "Monto fijo" },
];

const numero = (x, porDefecto = 0) =>
  x === null || x === undefined || x === "" || Number.isNaN(Number(x)) ? porDefecto : Number(x);

/* Una punta: lo que se cobra de ese lado, lo que se resigna y lo que queda.

   El `pct_efectivo` es el numero que le interesa al cliente: "te cobro 2,31%" se entiende,
   "te hago un 23% de descuento sobre mi 3%" no lo sigue nadie de cabeza. */
export function calcularPunta(precio, punta) {
  const base = numero(precio, 0);
  const pct = numero(punta.pct, 0);
  const bruto = base * pct;

  let descuento = 0;
  if (punta.descuentoTipo === "pct") descuento = bruto * numero(punta.descuentoValor, 0);
  if (punta.descuentoTipo === "monto") descuento = numero(punta.descuentoValor, 0);
  // No se puede resignar mas de lo que se cobra: quedaria una comision negativa.
  descuento = Math.max(0, Math.min(bruto, descuento));

  const neto = bruto - descuento;
  return {
    lado: punta.lado,
    pct,
    bruto,
    descuento,
    neto,
    pct_efectivo: base ? neto / base : 0,
    // Cuanto del descuento representa sobre lo que ibas a cobrar de ese lado.
    parte_resignada: bruto ? descuento / bruto : 0,
  };
}

/* El total: lo que factura RE/MAX y lo que te queda a vos.

   Las dos cifras SIEMPRE juntas — la facturación es la que cuenta para los escalones de
   RE/MAX y la ganancia es la que va a tu bolsillo, y confundirlas es el error que tenía
   el Excel. */
export function calcular(entradas) {
  const precio = numero(entradas.precio, 0);
  const split = numero(entradas.split, 0);
  const puntas = (entradas.puntas || []).map((p) => calcularPunta(precio, p));

  const sumar = (campo) => puntas.reduce((t, p) => t + p[campo], 0);
  const bruto = sumar("bruto");
  const neto = sumar("neto");

  return {
    puntas,
    precio,
    bruto,
    descuento: sumar("descuento"),
    neto,
    // Lo que le sale al cliente, mirado como porcentaje del precio.
    pct_bruto: precio ? bruto / precio : 0,
    pct_efectivo: precio ? neto / precio : 0,
    bolsillo: neto * split,
    bolsillo_sin_descuento: bruto * split,
    // Lo que te costó el descuento, ya descontada la parte de RE/MAX.
    costo_del_descuento: (bruto - neto) * split,
  };
}

/* "El cliente pone 100.000 y ahí adentro va tu comisión."

   Hay que despejar: si la oferta es X y la comisión es el 3% de X, entonces
   X + 0,03·X = 100.000, o sea X = 100.000 / 1,03. Da 97.087 de oferta y 2.913 de comisión.

   La cuenta fácil —sacarle el 3% a los 100.000— da 97.000 y 3.000, y está mal: ese 3.000
   sería el 3,09% de los 97.000 que se escrituran, no el 3%. Sobre 100.000 son 87 dólares
   de diferencia; sobre una casa de medio millón, 437. */
export function conComisionAdentro(total, pct) {
  const bruto = numero(total, 0);
  const porcentaje = numero(pct, 0);
  if (!bruto || porcentaje <= -1) return { total: bruto, oferta: bruto, comision: 0, pct: porcentaje };
  const oferta = bruto / (1 + porcentaje);
  return {
    total: bruto,
    oferta,
    comision: bruto - oferta,
    pct: porcentaje,
    // Lo que daría la cuenta fácil, para poder mostrar la diferencia.
    oferta_ingenua: bruto * (1 - porcentaje),
    comision_ingenua: bruto * porcentaje,
  };
}

/* Reparte entre las puntas la plata que ponés vos para juntar dos precios.

   Devuelve el monto que le toca resignar a cada una. Parejo es mitad y mitad; si va toda
   de un lado, la otra queda intacta. */
export function repartir(monto, cantidadDePuntas, como = "parejo") {
  const total = Math.max(0, numero(monto, 0));
  if (cantidadDePuntas <= 1) return [total];
  if (como === "vendedora") return [total, 0];
  if (como === "compradora") return [0, total];
  return [total / 2, total / 2];
}

/* Cuanto habria que descontar, en puntos de comision, para que el numero cierre. Sirve
   para el camino inverso: "quiero cobrarle 2,3% a este cliente, ¿que descuento es eso?" */
export function descuentoParaLlegarA(pctOriginal, pctObjetivo) {
  const de = numero(pctOriginal, 0);
  const a = numero(pctObjetivo, 0);
  if (!de) return 0;
  return Math.max(0, Math.min(1, (de - a) / de));
}

/* ---------- Quién factura cada pedazo, y el IVA ---------- */

/* Una comisión no la cobra una sola persona: se reparte, y cada uno emite su factura.

   La OFICINA se lleva siempre el 20%. De lo que queda, tu parte es tu split de RE/MAX
   (45% en RAP) y el resto va al colega. Con los números del usuario: 20 oficina, 45 él,
   35 colega — y eso es exactamente el 55% que la app ya le descontaba, ahora abierto en
   sus dos pedazos.

   Los regímenes cambian el reparto y coinciden con lo que el motor ya calculaba:

     captacion_mia    oficina 20 · vos <split> · colega el resto
     ref_martin       oficina 20 · Martín 45 · vos 35  (fijo, no escala con la categoría)
     ref_otro_colega  el referidor se lleva 25 y el 20/split/resto se aplica sobre el 75

   Por eso `ref_otro_colega` te deja 33,75% con RAP: el 45% de ese 75%. */
export const PARTE_OFICINA = 0.20;
export const IVA = 0.22;

export function repartoDeLaPunta(regimen, split) {
  const tajada = numero(split, 0);

  if (regimen === "ref_martin") {
    return [
      { clave: "yo", nombre: "Vos", parte: 0.35 },
      { clave: "colega", nombre: "Martín", parte: 0.45 },
      { clave: "oficina", nombre: "RE/MAX", parte: PARTE_OFICINA },
    ];
  }

  if (regimen === "ref_otro_colega") {
    // El referidor cobra primero; el resto se reparte igual que siempre, sobre lo que queda.
    const queda = 1 - 0.25;
    return [
      { clave: "yo", nombre: "Vos", parte: queda * tajada },
      { clave: "referidor", nombre: "Quien te lo refirió", parte: 0.25 },
      { clave: "colega", nombre: "Colega", parte: queda * (1 - PARTE_OFICINA - tajada) },
      { clave: "oficina", nombre: "RE/MAX", parte: queda * PARTE_OFICINA },
    ];
  }

  return [
    { clave: "yo", nombre: "Vos", parte: tajada },
    { clave: "colega", nombre: "Colega", parte: Math.max(0, 1 - PARTE_OFICINA - tajada) },
    { clave: "oficina", nombre: "RE/MAX", parte: PARTE_OFICINA },
  ];
}

/* Lo que le facturás a UN cliente: su comisión, quién cobra cada pedazo y cuánto IVA lleva.

   Va por punta y no por operación porque cada punta es un cliente distinto, y a cada uno
   hay que mandarle lo suyo: el vendedor no tiene por qué ver lo que paga el comprador. */
export function facturaDeLaPunta(punta, { regimen, split, conIva }) {
  const marcados = new Set(conIva || []);
  const trozos = repartoDeLaPunta(regimen, split)
    .filter((t) => t.parte > 0)
    .map((t) => {
      const monto = punta.neto * t.parte;
      const lleva = marcados.has(t.clave);
      return {
        ...t,
        monto,
        iva: lleva ? monto * IVA : 0,
        lleva_iva: lleva,
        total: monto + (lleva ? monto * IVA : 0),
      };
    });

  const iva = trozos.reduce((t, x) => t + x.iva, 0);
  const total = punta.neto + iva;
  const recargo = punta.neto ? iva / punta.neto : 0;

  /* Lo que hubiera pagado en la cuenta completa: la comisión entera MÁS el IVA entero.

     Esa es la referencia contra la que el cliente compara, y por eso el IVA va SIEMPRE al
     22%, aunque en esta operación no se le esté cobrando. El cliente entiende "3% + IVA"
     como el precio de lista; todo lo que pague por debajo de eso es descuento, y le da
     igual si se lo bajaste de la comisión, del IVA o de los dos.

     Es la parte que hace que este número no se pueda deducir del porcentaje de comisión.
     Si no se le cobra IVA a nadie, la comisión no baja ni un peso y aun así paga 3.000 en
     vez de 3.660: un 18% menos. Y si factura con IVA solo una parte, paga 3.297 — casi un
     10% de descuento sin que nadie haya tocado el 3%. */
  const comision_lista = numero(punta.bruto, punta.neto);
  const total_lista = comision_lista * (1 + IVA);

  return {
    lado: punta.lado,
    comision: punta.neto,
    pct_efectivo: punta.pct_efectivo,
    trozos,
    iva,
    total,
    // El recargo que ve el cliente sobre la comisión, para poder explicárselo.
    pct_recargo: recargo,
    comision_lista,
    total_lista,
    ahorro: total_lista - total,
    pct_descuento: total_lista ? 1 - total / total_lista : 0,
  };
}

/* Las facturas de todas las puntas, con el total de la operación. */
export function facturar(resultado, opciones) {
  const puntas = (resultado.puntas || []).map((p) => facturaDeLaPunta(p, opciones));
  return {
    puntas,
    comision: puntas.reduce((t, p) => t + p.comision, 0),
    iva: puntas.reduce((t, p) => t + p.iva, 0),
    total: puntas.reduce((t, p) => t + p.total, 0),
  };
}

/* ---------- Lo que se le manda al cliente ---------- */

const monto = (n) => `USD ${Math.round(n || 0).toLocaleString("es-UY")}`;
const porciento = (n, maximo = 3) =>
  `${String(Number(((n || 0) * 100).toFixed(maximo))).replace(".", ",")}%`;

/* Por debajo de medio punto no se nombra el descuento: redondeado da cero, y "Descuento
   aplicado: 0%" es peor que no decir nada. */
const DESCUENTO_QUE_SE_NOMBRA = 0.005;

/* El renglón del descuento, para pegar abajo del total.

   Va redondeado a un número entero, sin decimales: el cliente no lee "18,033%", lee "18%".
   Cuando el redondeo empuja para arriba —17,6 se dice como 18— va con un "casi" adelante,
   que es lo que uno diría hablando y evita prometerle un descuento más grande del que le
   estás haciendo. Al revés no hace falta: 18,4 se dice "18%" y nadie se queja de recibir un
   poco más de lo que le anunciaron. */
function renglonDelDescuento(punta) {
  if (!(punta.pct_descuento > DESCUENTO_QUE_SE_NOMBRA)) return [];
  const puntos = punta.pct_descuento * 100;
  const entero = Math.round(puntos);
  // El margen es contra la basura de decimales: 22,999999996 es 23, no "casi 23".
  const casi = puntos < entero - 1e-9 ? "casi " : "";
  return [`Descuento aplicado: ${casi}${entero}%`];
}

/* El texto para copiar y mandarle a UN cliente.

   Adentro va solo lo que le importa y lo que le corresponde saber: qué porcentaje se le
   cobra, cuánto es en plata, el IVA y el total. NADA del reparto interno — al cliente no
   le incumbe cuánto va a la oficina, cuánto al colega y cuánto a vos, y meterlo abre una
   conversación que no tiene nada que ver con lo que él está por firmar.

   El porcentaje de IVA solo se nombra cuando TODO lleva IVA. Si factura con IVA una parte
   sola, el recargo real no es el 22% y ponerlo al lado del monto se contradice con la
   cuenta: el cliente hace 2.310 × 22% en el teléfono, le da otra cosa y hay que explicarle
   el reparto, que es justamente lo que no se quiere. */
export function textoParaElCliente(punta, { precio, titulo, cuenta } = {}) {
  const todoConIva = punta.trozos.length > 0 && punta.trozos.every((t) => t.lleva_iva);

  /* NO dice de qué lado es. Muchos clientes no saben que una operación tiene dos puntas, y
     leer "parte compradora" solo abre preguntas sobre cómo funciona el negocio en el
     momento en que se está por firmar. Cada uno recibe lo suyo y nada más. */
  const lineas = ["*Comisión inmobiliaria*"];
  if (titulo) lineas.push(titulo);
  lineas.push("");
  if (precio) lineas.push(`Precio de la operación: ${monto(precio)}`);
  lineas.push(`Comisión: ${porciento(punta.pct_efectivo)}`);
  lineas.push(`Monto: ${monto(punta.comision)}`);
  if (punta.iva) {
    lineas.push(todoConIva ? `IVA (${porciento(IVA, 0)}): ${monto(punta.iva)}` : `IVA: ${monto(punta.iva)}`);
  }
  lineas.push("");
  lineas.push(`*Total a pagar: ${monto(punta.total)}*`);
  lineas.push(...renglonDelDescuento(punta));
  if ((cuenta || []).length) {
    lineas.push("");
    lineas.push(...cuenta);
  }

  /* Sin firma: el que lo manda ya esta identificado en el chat. El nombre, el telefono
     y hasta la oficina abajo del texto no agregaban nada y lo hacian mas largo. */
  return lineas.join("\n");
}

/* El MISMO detalle, pero con el reparto adentro.

   Es para cuando hay que explicarle algo a un cliente que pregunta — por que la comision
   es la que es, o adonde va la plata. No se manda por defecto: en una operacion normal,
   abrir el reparto es contestar una pregunta que nadie hizo. */
export function textoConReparto(punta, opciones = {}) {
  const { precio, titulo } = opciones;
  const lineas = ["*Comisión inmobiliaria — detalle*"];
  if (titulo) lineas.push(titulo);
  lineas.push("");
  if (precio) lineas.push(`Precio de la operación: ${monto(precio)}`);
  lineas.push(`Comisión: ${porciento(punta.pct_efectivo)} — ${monto(punta.comision)}`);
  lineas.push("");
  lineas.push("Cómo se reparte:");
  for (const t of punta.trozos) {
    const base = `· ${t.nombre}: ${porciento(t.parte)} — ${monto(t.monto)}`;
    lineas.push(t.iva ? `${base} + IVA ${monto(t.iva)} = ${monto(t.total)}` : base);
  }
  if (punta.iva) {
    lineas.push("");
    lineas.push(`IVA en total: ${monto(punta.iva)}`);
  }
  lineas.push("");
  lineas.push(`*Total a pagar: ${monto(punta.total)}*`);
  lineas.push(...renglonDelDescuento(punta));

  const cuenta = opciones.cuenta || [];
  if (cuenta.length) {
    lineas.push("");
    lineas.push(...cuenta);
  }
  return lineas.join("\n");
}
