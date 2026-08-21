/* LOS NEGOCIOS QUE NACEN SOLOS.

   Regla de Juan, dicha por él en dos frases:

     "el negocio se crea cuando pasa a negociacion pero entra en cartera cuando la ve
      publicada"
     "negociacion o reservada dependiendo si es alquiler o venta claramente"

   O sea: la propiedad entra a Cartera el día que se publica —eso ya lo hacía el robot— y el
   NEGOCIO, que es la plata, nace el día que esa propiedad empieza a valer algo:

     - una VENTA, cuando pasa a negociación
     - un ALQUILER, cuando queda reservada, porque un alquiler no pasa por negociación:
       va de publicado a reservado y se va del portal

   Hasta ahora el negocio había que cargarlo a mano desde "+ Nuevo" aunque la app tuviera
   todos los datos delante. Era pedirle que copiara lo que el robot ya había visto.

   Lo que se copia sale ENTERO de la cartera: dirección, barrio, precio, moneda, de dónde
   salió y cuándo se publicó. Lo único que después hay que confirmar a mano es si fue una
   punta o dos, y a qué precio se está cerrando de verdad — los dos datos que el portal no
   dice y de los que depende la mitad de la plata. */

import { plantillaNegocio, revisar, CAIDO } from "./motor.js";

/* Cuándo nace cada uno. Un alquiler que está en negociación no dispara nada: ese estado no
   existe en un alquiler y si aparece es ruido del portal. */
const NACE_EN = {
  venta: new Set(["en_negociacion", "reservada"]),
  alquiler: new Set(["reservada"]),
};

const operacionDe = (p) => (p.operacion === "alquiler" ? "alquiler" : "venta");

/* El día que arrancó la plata: la negociación en una venta, la reserva en un alquiler. Sirve
   para dos cosas — se copia al negocio, y decide si un negocio ya cerrado sobre esa misma
   propiedad corresponde a esta vuelta o a la anterior. */
function cuandoArranco(propiedad) {
  return operacionDe(propiedad) === "alquiler"
    ? propiedad.fecha_reservada || propiedad.fecha_negociacion || null
    : propiedad.fecha_negociacion || propiedad.fecha_reservada || null;
}

/* Si esa propiedad ya tiene su negocio.

   Un negocio ABIERTO o CAIDO manda siempre: crear otro sería duplicarlo, y "caído" es una
   respuesta —se cayó— no un hueco por llenar.

   Uno CERRADO no bloquea, pero sólo si terminó ANTES de que arrancara esta vuelta. Un
   apartamento se alquila todos los años: el alquiler del año pasado está cerrado y cobrado, y
   el de este año es un negocio nuevo. Sin esa comparación de fechas, la app no volvería a
   crear ninguno nunca más sobre una propiedad que ya dio plata una vez. */
function yaTieneNegocio(negocios, propiedad) {
  const arranco = cuandoArranco(propiedad);
  return (negocios || []).some((n) => {
    if (n.entity_id_cartera !== propiedad.entity_id) return false;
    if (n.estado !== "cerrado") return true;
    // Cerrado sin fecha: no se puede comparar, así que se respeta y no se crea nada.
    if (!n.fecha_fin || !arranco) return true;
    return n.fecha_fin >= arranco;
  });
}

/* Los negocios que la app tendría que haber creado sola y todavía no existen.

   Devuelve negocios nuevos SIN tocar nada: quien llama decide si los agrega. Así se puede
   probar la regla sin montar media app alrededor. */
export function negociosQueFaltan(cartera, negocios, ajustes, hoy) {
  const nuevos = [];
  const usados = new Set((negocios || []).map((n) => n.id));
  let numero = 1;
  const proximoId = () => {
    while (usados.has(`manual-${numero}`)) numero += 1;
    usados.add(`manual-${numero}`);
    return `manual-${numero}`;
  };

  for (const propiedad of Object.values(cartera || {})) {
    if (!propiedad.activa) continue;
    /* Si el usuario borro el negocio que la app le estreno, no se le crea otro. Sin esto,
       borrarlo no serviria de nada: volveria a nacer al abrir la app manana. */
    if (propiedad.sin_negocio) continue;
    const operacion = operacionDe(propiedad);
    if (!NACE_EN[operacion].has(propiedad.estado)) continue;
    if (yaTieneNegocio([...(negocios || []), ...nuevos], propiedad)) continue;

    nuevos.push(revisar({
      id: proximoId(),
      ...plantillaNegocio(operacion, ajustes, hoy),
      entity_id_cartera: propiedad.entity_id,
      direccion: propiedad.direccion || "",
      barrio: propiedad.barrio || "",
      tipo_propiedad: propiedad.tipo || null,
      /* La moneda sale del portal, no del tipo de operación: si RE/MAX dice que ese alquiler
         está en dólares, está en dólares. */
      moneda: propiedad.moneda === "UYU" ? "UYU" : "USD",
      /* El precio negociado manda sobre el publicado: una oferta aceptada casi nunca es por
         el precio de la vidriera. */
      precio_operacion: propiedad.precio_negociacion || propiedad.precio || null,
      /* Cuándo se publicó lo sabe el robot: es la fecha de captación que ya tiene anotada. */
      fecha_inicio: propiedad.fecha_captacion_real || null,
      fecha_negociacion: propiedad.fecha_negociacion || null,
      fecha_boleto: propiedad.fecha_reservada || null,
      origen_captacion: propiedad.origen_captacion || null,
      /* Para poder decirlo en pantalla: este negocio no lo cargó él. */
      nacio_solo: true,
    }, ajustes, hoy, cartera));
  }
  return nuevos;
}

/* Un negocio caído no vuelve a nacer solo: ver `yaTieneNegocio`. Se exporta para que la regla
   se lea desde afuera sin tener que abrir este archivo. */
export const NO_REVIVEN = CAIDO;
