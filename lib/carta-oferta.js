/* La OFERTA DE COMPRA de RE/MAX, como datos.

   El texto sale palabra por palabra del modelo que entrego el usuario. No se mejora ni se
   reescribe por gusto: es un documento que obliga y la redaccion es de su oficina. Los
   unicos cambios son los que el pidio o los que arreglan una contradiccion del modelo, y
   estan todos anotados abajo.

   LO IMPORTANTE DE ESTE ARCHIVO: las palabras que enganchan una casilla con la frase
   viajan pegadas a la casilla, en `antes`. Por eso quitar una casilla se lleva tambien su
   enganche y la frase se cierra sola, sin agujeros ni comas sueltas. Ese es el tercer
   estado que pidio el usuario, y todo el diseño de la plantilla existe para hacerlo
   posible. */

import { enLetras } from "./numero-a-letras.js";

/* Los diecinueve, para que el departamento se elija de una lista y no se tipee mal. */
export const DEPARTAMENTOS = ["Artigas", "Canelones", "Cerro Largo", "Colonia", "Durazno",
  "Flores", "Florida", "Lavalleja", "Maldonado", "Montevideo", "Paysandú", "Río Negro",
  "Rivera", "Rocha", "Salto", "San José", "Soriano", "Tacuarembó", "Treinta y Tres"];

export const CAMPOS = [
  { clave: "nombre", etiqueta: "Nombre", tipo: "texto", quien: "comprador", quitable: false, rayita: 28 },
  { clave: "cedula", etiqueta: "Documento de identidad", tipo: "texto", quien: "comprador", quitable: false, rayita: 16 },
  { clave: "telefono", etiqueta: "Teléfono", tipo: "texto", quien: "comprador", quitable: true, rayita: 14 },
  { clave: "correo", etiqueta: "Correo electrónico", tipo: "texto", quien: "comprador", quitable: true, rayita: 20 },

  { clave: "padron", etiqueta: "Padrón", tipo: "texto", quien: "usuario", quitable: true, rayita: 10 },
  { clave: "calle", etiqueta: "Calle y número", tipo: "texto", quien: "usuario", quitable: false, rayita: 26,
    pista: "La frase ya dice \"en la calle\": escribí solo el nombre — 6 esquina 5, no calle 6 esquina 5" },
  { clave: "barrio", etiqueta: "Barrio o balneario", tipo: "texto", quien: "usuario", quitable: true, rayita: 18,
    pista: "Centro, Pinar Sur, Maroñas…" },
  { clave: "departamento", etiqueta: "Departamento", tipo: "texto", quien: "usuario", quitable: true, rayita: 16, opciones: DEPARTAMENTOS },

  { clave: "precio", etiqueta: "Precio ofrecido (U$S)", tipo: "monto", quien: "usuario", quitable: false, rayita: 24 },
  { clave: "dias_reserva", etiqueta: "Días hábiles para la reserva", tipo: "entero", quien: "usuario", quitable: false, rayita: 6, porDefecto: 15 },
  { clave: "dias_validez", etiqueta: "Días hábiles que vale la oferta", tipo: "entero", quien: "usuario", quitable: false, rayita: 6, porDefecto: 5 },
  { clave: "fecha_oferta", etiqueta: "Fecha de la oferta", tipo: "fecha", quien: "usuario", quitable: false, rayita: 12 },

  { clave: "propietario_nombre", etiqueta: "Nombre del propietario", tipo: "texto", quien: "propietario", quitable: false, rayita: 30 },
  { clave: "propietario_cedula", etiqueta: "Documento del propietario", tipo: "texto", quien: "propietario", quitable: false, rayita: 22 },
  { clave: "propietario_domicilio", etiqueta: "Domicilio del propietario", tipo: "texto", quien: "propietario", quitable: true, rayita: 20 },
  { clave: "fecha_aceptacion", etiqueta: "Fecha de la aceptación", tipo: "fecha", quien: "propietario", quitable: false, rayita: 12 },
];

export const POR_CLAVE = Object.fromEntries(CAMPOS.map((c) => [c.clave, c]));

const t = (texto) => ({ texto });

export const PLANTILLA = [
  { tipo: "titulo", piezas: [t("OFERTA DE COMPRA")] },

  { tipo: "parrafo", piezas: [
    { campo: "nombre", antes: "Nombre: " },
    { campo: "cedula", antes: " Doc. Identidad " },
    { campo: "telefono", antes: " Teléfono " },
    { campo: "correo", antes: " Correo electrónico " },
    t(" en su carácter de OFERENTE, expresa que:"),
  ] },

  /* La direccion va como se dice en Uruguay: calle, barrio o balneario, departamento.
     El modelo decia "de la ciudad de ___", que no sirve para Canelones — el usuario
     escribio a mano "calle 6 interseccion 5, Pinar Sur" en una carta real, porque el
     balneario es lo que ubica. */
  { tipo: "parrafo", piezas: [
    t("PRIMERO: OBJETO. La parte OFERENTE ofrece comprar para sí o para el tercero que "
      + "indique, libre de ocupantes, hipotecas, embargos y demás gravámenes y con todos "
      + "los impuestos, tasas, servicios y demás obligaciones correspondientes al inmueble "
      + "de referencia totalmente pagos al día de la firma del otorgamiento proyectará, "
      + "reservando en este acto la adquisición de la propiedad y posesión al PROPIETARIO "
      + "del inmueble empadronado"),
    { campo: "padron", antes: " con el número " },
    { campo: "calle", antes: " ubicado en la calle " },
    { campo: "barrio", antes: ", " },
    { campo: "departamento", antes: ", " },
    t(", en la República Oriental del Uruguay. De acuerdo a las siguientes condiciones y "
      + "declarando que los fondos con los adquirirá el inmueble de referencia son de "
      + "origen lícito manifestando no estar comprendido en las previsiones de la ley "
      + "19.574, sus decretos reglamentarios y demás normativa vigente:"),
  ] },

  { tipo: "parrafo", piezas: [
    t("SEGUNDO: PRECIO. El precio ofrecido por la compraventa proyectada asciende a la "
      + "suma de"),
    { campo: "precio", antes: " " },
    t(" dólares estadounidenses que se pagará con el otorgamiento de la compraventa "
      + "proyectada y entrega del Inmueble."),
  ] },

  { tipo: "parrafo", piezas: [
    t("TERCERO: RESERVA. Una vez aceptada la presente oferta por el PROPIETARIO, las "
      + "partes otorgarán un contrato preliminar (en adelante, la “Reserva”), con las "
      + "cláusulas de estilo para este tipo de operaciones, dentro de los"),
    { campo: "dias_reserva", antes: " " },
    t(" días hábiles siguientes a contar de la aceptación por parte del primero."),
  ] },

  { tipo: "parrafo", piezas: [
    t("CUARTO: INTERMEDIACIÓN. La parte OFERENTE y el PROPIETARIO asumen, cada uno por su "
      + "parte, el pago a los agentes asociado de “RE/MAX” la suma pactada previamente "
      + "sobre el precio de venta por concepto de honorarios de intermediación, la que "
      + "deberá ser abonada al momento de la firma de la compraventa proyectada."),
  ] },

  /* El modelo decia "por un plazo de cinco (____) dias habiles", con la palabra fija y el
     numero en la rayita: poner 10 daba "cinco (10)". Ahora las dos salen del mismo dato. */
  { tipo: "parrafo", piezas: [
    t("QUINTO: ACEPTACIÓN. La presente OFERTA se mantendrá válida y vigente por un plazo de"),
    { campo: "dias_validez", antes: " " },
    t(" días hábiles a contar de hoy. De no recibir la parte OFERENTE la confirmación de "
      + "su aceptación por el PROPIETARIO dentro de dicho plazo, la presente oferta "
      + "caducará automáticamente y de pleno derecho."),
  ] },

  { tipo: "parrafo", piezas: [
    t("SEXTO: Para todos los efectos legales las partes constituyen domicilios especiales "
      + "en: a) el AUTORIZANTE en el enunciado la comparecencia, y b) los agentes asociado "
      + "RE/MAX, acordando la validez del telegrama colacionado para todas las "
      + "comunicaciones, y firmando las partes el presente con su firma habitual en dos "
      + "ejemplares de igual tenor en Montevideo el"),
    { campo: "fecha_oferta", antes: " " },
    t("."),
  ] },

  /* La plata la recibe RE/MAX, no el usuario — pero RE/MAX es una empresa y no firma
     nunca: firma una persona por ella. Si el usuario firma a secas queda como si la plata
     fuera suya, y si se deja el renglon para RE/MAX no lo firma nadie. Firma el,
     aclarando en representacion de quien. */
  { tipo: "firmas", firmas: [
    { clave: "oferente", pie: "OFERENTE" },
    { clave: "depositario", pie: "DEPOSITARIO", nota: "En representación de RE/MAX", ponerNombre: true },
  ] },

  { tipo: "salto-de-hoja" },

  { tipo: "titulo", piezas: [t("ACEPTACIÓN")] },

  { tipo: "parrafo", piezas: [
    t("El/los suscrito/os"),
    { campo: "propietario_nombre", antes: " " },
    t(", titular/es del/de los Documentos de identidad número/s"),
    { campo: "propietario_cedula", antes: " " },
    { campo: "propietario_domicilio", antes: " con domicilio a estos efectos en " },
    t(" en calidad de PROPIETARIO/S del “Inmueble” mencionado con anterioridad, "
      + "acepto/amos la OFERTA de contratar que antecede, obligándome/nos en los términos "
      + "y condiciones de la misma y suscribiendo el presente en Montevideo el"),
    { campo: "fecha_aceptacion", antes: " " },
    t("."),
  ] },

  { tipo: "firmas", firmas: [
    { clave: "propietario", pie: "PROPIETARIO/S" },
  ] },
];

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto",
  "septiembre", "octubre", "noviembre", "diciembre"];

const miles = (n) => Math.round(n).toLocaleString("es-UY");

/* Como se escribe el valor de cada casilla adentro de la frase. Los montos y los plazos
   salen en letra Y en numero desde el mismo dato: es lo que evita que la carta se
   contradiga a si misma. */
function comoSeEscribe(clave, valor) {
  const campo = POR_CLAVE[clave];
  if (campo.tipo === "monto") {
    const n = Number(valor);
    if (!Number.isFinite(n) || n <= 0) return "";
    return `${enLetras(Math.round(n))} (U$S ${miles(n)})`;
  }
  if (campo.tipo === "entero") {
    const n = Number(valor);
    if (!Number.isInteger(n) || n <= 0) return "";
    return `${enLetras(n)} (${n})`;
  }
  if (campo.tipo === "fecha") {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(valor));
    if (!m) return "";
    return `día ${Number(m[3])} de ${MESES[Number(m[2]) - 1]} de ${m[1]}`;
  }
  return String(valor ?? "").trim();
}

/* Deja la frase como la escribiria una persona.

   Al quitar una casilla se van sus palabras de enganche, y en las costuras quedan
   espacios de mas o una coma que arranca el renglon. Se limpia sobre las PARTES y no
   sobre el texto entero, porque cada parte tiene que seguir sabiendo si es texto, valor
   o rayita: de eso depende como se pinta despues, en la pantalla y en el PDF. */
function limpiar(partes) {
  const salida = [];
  for (const parte of partes) {
    let texto = parte.texto.replace(/\s{2,}/g, " ");
    const anterior = salida[salida.length - 1];
    if (anterior) {
      if (/\s$/.test(anterior.texto) && /^\s/.test(texto)) texto = texto.replace(/^\s+/, "");
      if (/^\s*[,.;:]/.test(texto)) anterior.texto = anterior.texto.replace(/\s+$/, "");
    }
    if (texto) salida.push({ ...parte, texto });
  }
  if (salida.length) {
    salida[0].texto = salida[0].texto.replace(/^\s+/, "");
    const ultima = salida[salida.length - 1];
    ultima.texto = ultima.texto.replace(/\s+$/, "");
  }
  return salida.filter((p) => p.texto);
}

/* Resuelve la plantilla contra los valores cargados.

   `quitadas` son las casillas que el usuario decidio que no aparezcan. Lo que NO esta
   quitado y no tiene valor sale como rayita, para completar a mano o en la pantalla. */
export function armar(valores, quitadas = [], opciones = {}) {
  const fuera = new Set(quitadas);
  const firmadas = new Set(opciones.firmadas || []);
  const agente = opciones.agente || "";

  return PLANTILLA.map((bloque) => {
    if (bloque.tipo === "firmas") {
      return {
        tipo: "firmas",
        firmas: bloque.firmas.map((f) => ({
          ...f,
          firmada: firmadas.has(f.clave),
          nombre: f.ponerNombre ? agente : "",
        })),
      };
    }
    if (bloque.tipo === "salto-de-hoja") return { tipo: "salto-de-hoja" };

    const partes = [];
    for (const pieza of bloque.piezas) {
      if (pieza.texto !== undefined) {
        partes.push({ texto: pieza.texto, clase: "texto" });
        continue;
      }
      if (fuera.has(pieza.campo)) continue;

      const escrito = comoSeEscribe(pieza.campo, valores[pieza.campo]);
      if (pieza.antes) partes.push({ texto: pieza.antes, clase: "texto" });
      partes.push(escrito
        ? { texto: escrito, clase: "valor", campo: pieza.campo }
        : { texto: "_".repeat(POR_CLAVE[pieza.campo].rayita), clase: "rayita", campo: pieza.campo });
    }
    return { tipo: bloque.tipo, partes: limpiar(partes) };
  });
}

/* El texto plano de un documento armado, que es como se lee de verdad. Lo usan los
   tests, la vista previa y el PDF. */
export function comoTexto(bloques) {
  return bloques
    .filter((b) => b.partes)
    .map((b) => b.partes.map((p) => p.texto).join(""))
    .join("\n\n");
}
