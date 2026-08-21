/* Leer el aviso de consumo que manda el banco por mensaje de texto.

   NO se leen los mensajes del teléfono: eso ninguna página web puede hacerlo, y está bien
   que sea así — por SMS llegan los códigos de un solo uso del banco, y quien los lee entra
   a la cuenta. Acá sólo se lee EL mensaje que el usuario comparte con la app a propósito.

   El formato del BBVA es fijo, y viene partido en varias líneas por el ancho de la pantalla:

     Alerta TDD BBVA Tarjeta: 4934
     Importe: PES 1343.03 Comercio:
     033DLO*PedidosYa Bar Tv VIS3
     Tipo: Compra Fecha: 20/08/2026
     22:05:42.

   Por eso lo primero que se hace es juntar todo en un solo renglón: los saltos de línea caen
   en cualquier lado y no significan nada. */

/* El comercio viene con la basura de la red de pagos pegada adelante y atrás:

     033DLO*PedidosYa PropinaVIS3   ->  PedidosYa Propina
     033SERVICENTRO DE LA VICVIS3   ->  Servicentro de la Vic

   `033` es el código del adquirente y `VIS3` la marca de Visa. `DLO*` es DLocal, la
   pasarela que cobra por PedidosYa y compañía. Nada de eso le dice nada a nadie. */
const BASURA_ADELANTE = /^\d{2,4}\s*(dlo|dl|mp|ml|pdp|ebanx)\s*\*+\s*|^\d{2,4}\s*/i;
const BASURA_ATRAS = /\s*(vis\d?|mc\d?|mastercard|visa|amex)\.?\s*$/i;

/* Las palabras que van en mayúscula aunque el resto se pase a minúscula. */
const SIGLAS = new Set(["tv", "ute", "ose", "bps", "iva", "sa", "srl"]);

/* "SERVICENTRO DE LA VIC" gritado en mayúsculas es como lo manda el banco, no como lo lee
   una persona. Se pasa a minúsculas y se capitaliza, salteando las palabritas de unión. */
const MINUSCULAS = new Set(["de", "del", "la", "las", "el", "los", "y", "en", "a"]);

export function comercioLegible(crudo) {
  const limpio = String(crudo || "")
    .replace(BASURA_ADELANTE, "")
    .replace(BASURA_ATRAS, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!limpio) return "";

  /* Si ya viene con mayúsculas y minúsculas mezcladas —"PedidosYa Bar Tv"— está escrito por
     alguien y no hay que tocarlo. Sólo se arregla lo que viene TODO EN MAYÚSCULAS. */
  if (limpio !== limpio.toUpperCase()) return limpio;

  return limpio
    .toLowerCase()
    .split(" ")
    .map((palabra, i) => {
      if (SIGLAS.has(palabra)) return palabra.toUpperCase();
      if (i > 0 && MINUSCULAS.has(palabra)) return palabra;
      return palabra.charAt(0).toUpperCase() + palabra.slice(1);
    })
    .join(" ");
}

/* PES son pesos y DOL dólares. El banco usa esas tres letras, no el símbolo. */
const MONEDAS = { PES: "UYU", UYU: "UYU", UYP: "UYU", DOL: "USD", USD: "USD", US: "USD" };

const aISO = (fecha) => {
  const [d, m, a] = String(fecha).split(/[/\-]/);
  if (!d || !m || !a) return null;
  const anio = a.length === 2 ? `20${a}` : a;
  return `${anio}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
};

/* Un aviso que NO es una compra: una devolución, un retiro, una contracara. Se distinguen
   porque el tipo lo dice, y hay que tratarlos distinto — una devolución entra plata, no
   sale, y anotarla como gasto deja el saldo el doble de mal. */
const TIPOS_QUE_DEVUELVEN = /devoluci|reverso|anulaci|contracargo/i;

export function leerAviso(texto) {
  /* Todo en un solo renglón: los saltos caen donde el celular corte la pantalla. */
  const linea = String(texto || "").replace(/\s+/g, " ").trim();
  if (!linea) return null;

  const importe = /importe:?\s*([A-Za-z]{2,3})?\s*\$?\s*([\d.,]+)/i.exec(linea);
  if (!importe) return null;

  /* El banco escribe 1343.03 con punto decimal y sin separador de miles. Igual se contempla
     el caso al revés —1.343,03— porque el mismo banco lo escribe así en otros avisos. */
  const crudoMonto = importe[2];
  const monto = crudoMonto.includes(",")
    ? Number(crudoMonto.replace(/\./g, "").replace(",", "."))
    : Number(crudoMonto);
  if (!Number.isFinite(monto) || monto <= 0) return null;

  const comercio = /comercio:?\s*(.+?)\s*(?:tipo:|fecha:|$)/i.exec(linea);
  const tipo = /tipo:?\s*([A-Za-zÁÉÍÓÚáéíóúñÑ]+)/i.exec(linea);
  const fecha = /fecha:?\s*(\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4})/i.exec(linea);
  const hora = /(\d{1,2}:\d{2}(?::\d{2})?)/.exec(linea);
  const tarjeta = /tarjeta:?\s*(\d{3,4})/i.exec(linea);

  return {
    monto,
    moneda: MONEDAS[(importe[1] || "").toUpperCase()] || "UYU",
    comercio: comercioLegible(comercio ? comercio[1] : ""),
    comercio_crudo: comercio ? comercio[1].trim() : "",
    tipo: tipo ? tipo[1] : "",
    /* Una devolución no es un gasto: es plata que vuelve. */
    devuelve: TIPOS_QUE_DEVUELVEN.test(tipo ? tipo[1] : ""),
    fecha: fecha ? aISO(fecha[1]) : null,
    hora: hora ? hora[1] : null,
    tarjeta: tarjeta ? tarjeta[1] : null,
  };
}

/* Un mensaje puede traer varios avisos pegados —cuando se comparten varios juntos— y cada
   uno arranca con "Alerta". Si no hay ninguna marca, se intenta leer todo como uno solo. */
export function leerAvisos(texto) {
  const crudo = String(texto || "");
  const partes = crudo.split(/(?=Alerta\s)/i).filter((p) => p.trim());
  const lista = (partes.length > 1 ? partes : [crudo]).map(leerAviso).filter(Boolean);

  /* El mismo aviso compartido dos veces no tiene que entrar dos veces. Se reconoce por
     importe, comercio y hora: el banco no manda dos compras idénticas en el mismo segundo. */
  const vistos = new Set();
  return lista.filter((a) => {
    const llave = `${a.fecha}|${a.hora}|${a.monto}|${a.comercio_crudo}`;
    if (vistos.has(llave)) return false;
    vistos.add(llave);
    return true;
  });
}

/* ---------- Qué categoría ponerle ---------- */

/* Lo que se sabe de entrada. La lista es corta a propósito: adivinar de más es peor que no
   adivinar — un gasto en la categoría equivocada ensucia las cuentas sin que se note.

   Lo que de verdad hace que esto sirva es que APRENDE: la categoría que el usuario elige
   para un comercio queda guardada, y la próxima compra en ese lugar ya viene puesta. */
const SE_SABEN = [
  [/pedidosya|rappi|uber\s*eats|delivery|resto|bar\b|cafe|panaderia|super|devoto|tienda\s*ingl/i, "Comida"],
  [/servicentro|ancap|petrobras|axion|shell|estacion|uber|cabify|movil|nafta|combustible/i, "Transporte"],
  [/farmacia|mutualista|casmu|medica|salud|optica/i, "Salud"],
  [/ute\b|ose\b|antel|montevideo\s*gas|alquiler/i, "Casa"],
];

export function categoriaSugerida(comercio, aprendidas = {}) {
  const nombre = String(comercio || "").trim();
  if (!nombre) return null;
  /* Lo aprendido gana siempre: si el usuario dijo que ese lugar es otra cosa, es otra cosa. */
  const sabida = aprendidas[nombre.toLowerCase()];
  if (sabida) return sabida;
  for (const [patron, categoria] of SE_SABEN) {
    if (patron.test(nombre)) return categoria;
  }
  return null;
}

export function aprender(aprendidas, comercio, categoria) {
  const nombre = String(comercio || "").trim().toLowerCase();
  if (!nombre || !categoria) return aprendidas;
  return { ...aprendidas, [nombre]: categoria };
}
