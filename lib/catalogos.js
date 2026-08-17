/* Las listas cerradas del negocio: quién puede estar de cada lado y cómo llegó la plata.

   Están acá y no desparramadas por las pantallas porque son la misma lista en cuatro
   lugares distintos, y porque de una de ellas sale la regla de comisión. */

export const YO = "Juan Andrés Otero";

/* Quién puede estar de cada lado de un negocio. Es info interna: no lleva teléfono.
   Los clientes (comprador y vendedor) van aparte, esos sí con WhatsApp. */
export const AGENTES = [
  YO,
  "Martin Sedes",
  "Team",
  "Ofi Único",
  "Otra Oficina",
];

/* En estos tres, "quién" es una oficina o un grupo: se puede anotar al lado el nombre
   de la persona concreta. En los dos primeros no hace falta, ya son una persona. */
export const AGENTES_QUE_LLEVAN_NOMBRE = new Set(["Team", "Ofi Único", "Otra Oficina"]);

/* Cómo llegó el negocio. Es una sola pregunta con diez respuestas, y de la respuesta
   sale sola la regla de comisión: no hay que cargar las dos cosas. */
export const ORIGENES = [
  "B.d.r.",
  "Ref. Team",
  "Ref. Martin",
  "Ref. Único",
  "Ref. Remax",
  "Ref. Cliente",
  "Cliente antiguo",
  "Dueño Vende",
  "Redes sociales Orgánico",
  "Redes sociales Campaña",
  "On mind",
];

export const EXPLICACION_ORIGEN = {
  "B.d.r.": "Base de relaciones",
};

/* "Quién te lo refirió" era la misma pregunta que "cómo llegó el negocio": si el origen
   dice "Ref. Martin", quien lo refirió fue Martín. Se eliminó ese campo.

   Lo único que el origen no dice es QUIÉN en concreto, cuando el que refiere es un grupo,
   una oficina o un cliente. Eso se pregunta al lado del origen, y solo en esos casos. */
export const ORIGENES_QUE_LLEVAN_NOMBRE = new Set([
  "Ref. Team",
  "Ref. Único",
  "Ref. Remax",
  "Ref. Cliente",
  "Referido - RE/MAX",
  "Referido - Team",
  "Referido - cliente",
]);

/* Qué origen se lleva una tajada de tu comisión.

   El vocabulario viejo del Excel está incluido a propósito: si no estuviera, al revisar
   un negocio importado su régimen cambiaría solo y le cambiaría la plata. */
export const ORIGEN_A_REGIMEN = {
  "Ref. Martin": "ref_martin",
  "Ref. Team": "ref_otro_colega",
  "Ref. Único": "ref_otro_colega",
  "Ref. Remax": "ref_otro_colega",
  // Como lo dejó el import del Excel:
  "Referido - Martín": "ref_martin",
  "Referido - RE/MAX": "ref_otro_colega",
  "Referido - Team": "ref_otro_colega",
};

/* "Ref. Cliente" NO está en la tabla de arriba a propósito: un cliente que te recomienda
   no se lleva ninguna tajada, así que cobrás tu comisión entera.

   El importador lo había clasificado como referido de colega y estaba equivocado. Se ve
   en sus propios números: en los dos negocios que tenía así, la ganancia fue el 45% pleno
   de la comisión (360 sobre 800), y no el 45% del 75% que dejaría un colega. */

/* La regla de comisión ya no se carga a mano: sale de cómo llegó el negocio más las dos
   marcas que pueden ir encima (§9 del pedido del 2026-08-17).

   Son excluyentes entre sí: un negocio no puede ser al mismo tiempo una suplencia y uno
   que referiste. La pantalla las ofrece como una sola elección de tres. */
export function regimenDe(negocio) {
  if (negocio.es_suplencia) return "suplencia";
  if (negocio.yo_referi) return "yo_referi";
  return ORIGEN_A_REGIMEN[negocio.origen_captacion] || "captacion_mia";
}

/* Hubo un campo "Quién te lo refirió" que era la misma pregunta que "cómo llegó el
   negocio", pero que NO movía la plata: la mueve el origen. Se eliminó, y lo que se haya
   cargado ahí se pasa al origen, que es donde sirve. */
const REFERIDOR_A_ORIGEN = {
  "Martin Sedes": "Ref. Martin",
  Team: "Ref. Team",
  "Ofi Único": "Ref. Único",
  "Otra Oficina": "Ref. Remax",
};

export const origenSegunReferidor = (referidor) => REFERIDOR_A_ORIGEN[referidor] || null;

export const esOrigenDeReferido = (origen) =>
  Boolean(origen) && (origen in ORIGEN_A_REGIMEN || ORIGENES_QUE_LLEVAN_NOMBRE.has(origen));

export const MARCAS = [
  ["", "Ninguna de las dos"],
  ["es_suplencia", "Es una suplencia — cubriste una visita"],
  ["yo_referi", "Yo la referí — se la pasaste a otro"],
];

export const marcaActual = (n) =>
  n.es_suplencia ? "es_suplencia" : n.yo_referi ? "yo_referi" : "";

/* Una propiedad que está en tu cartera la estás trabajando vos: no puede ser una
   suplencia ni un negocio que referiste. Esas dos marcas no se ofrecen ahí. */
export const admiteMarcas = (n) => !n.entity_id_cartera;

export const TIPOS_NEGOCIO = [
  ["venta", "Venta"],
  ["alquiler", "Alquiler"],
  ["renovacion_alquiler", "Renovación de alquiler"],
];
