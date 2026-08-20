/* Lo que se puede HACER con una carta oferta, sin importar desde qué pantalla.

   Vive aparte porque lo usan dos lugares: la pantalla de la carta abierta, y la ventanita
   que se abre al tocar una del tablero o del historial. Juan lo pidió así: una carta tiene
   que dejarse bajar, editar, volver a mandar y borrar esté donde esté.

   Acá no hay estado de pantalla: se recibe la carta, se devuelve la carta cambiada. Quien
   llama decide cuándo guardarla y cuándo redibujar. */

import { armar } from "../lib/carta-oferta.js";
import { aEnlaceQueEntre } from "../lib/carta-enlace.js";
import { mandarArchivo, bajarArchivo } from "../lib/compartir.js";
import { armarPDF, nombreDelArchivo } from "../lib/carta-pdf.js";
import { cargarMembrete } from "../lib/membrete.js";
import { nuevoId, anotarMandada } from "../lib/carta-transito.js";

/* El PDF de una carta. Con `enlaceParaFirmar` trae adentro el botón "Firmar en el celular";
   sin él sale limpio, que es lo que se quiere para imprimir o archivar. */
async function pdfDe(carta, agente, enlaceParaFirmar = "", turno = "comprador") {
  const bloques = armar(carta.valores, carta.quitadas, {
    agente, firmadas: Object.keys(carta.firmas || {}),
  });
  return armarPDF(bloques, carta.firmas || {}, await cargarMembrete(),
    enlaceParaFirmar, turno).aBlob();
}

/* Mandarle la carta a una de las partes. Devuelve la carta ya anotada como mandada, o
   `null` si no se pudo — ahí el que llama avisa en pantalla. */
export async function mandarCartaA(carta, turno, { agente = "", telefono = "" } = {},
  cuando = null) {
  const base = new URL("firmar.html", window.location.href).href;

  /* TU firma NO viaja en el enlace, y es lo que lo mantiene corto: sola pesa el 80%
     —1.761 caracteres contra 419 sin ella— y un enlace gigante en WhatsApp queda feo y da
     desconfianza. Tu teléfono la tiene guardada, y como firmar.html vive en el mismo
     dominio que la app, cuando te devuelven la carta tu propio celular la vuelve a poner. */
  const firmas = { ...(carta.firmas || {}) };
  delete firmas.depositario;

  /* Desde que sale del teléfono, la carta tiene número propio: es lo que hace que la vuelta
     de cada parte caiga en SU carta y no en la que esté abierta. */
  const conNumero = { ...carta, id: carta.id || nuevoId() };

  const enlace = await aEnlaceQueEntre(base, {
    valores: conNumero.valores,
    quitadas: conNumero.quitadas,
    turno,
    agente,
    firmas,
    id: conNumero.id,
    telefono,
  });

  /* Se manda el PDF y no el enlace pelado: en WhatsApp un archivo se ve prolijo y un enlace
     de doscientos caracteres se ve como un manotazo. El enlace va ADENTRO del PDF. */
  const como = await mandarArchivo(
    await pdfDe(conNumero, agente, enlace, turno),
    nombreDelArchivo(conNumero.valores),
    "Te paso la oferta de compra. El PDF va aparte.",
  );
  if (como === "bloqueado") return null;

  return anotarMandada(conNumero, turno, cuando);
}

/* Bajar el PDF de una carta. Sin enlace adentro: éste es para imprimir o archivar, y un
   botón "Firmar en el celular" impreso en un papel no sirve para nada. */
export async function bajarCarta(carta, { agente = "" } = {}) {
  return bajarArchivo(await pdfDe(carta, agente), nombreDelArchivo(carta.valores));
}

/* Mandar la carta YA COMPLETA a las partes.

   Es un solo boton y no uno por parte: el documento final es el MISMO para los dos —lleva
   las dos firmas—, asi que no hay nada que elegir. Se abre la bandeja del sistema y ahi se
   eligen los destinatarios, incluso los dos de una.

   Va SIN el boton "Firmar en el celular" adentro: ya esta firmada, y un boton para firmar
   en un documento cerrado solo confunde. */
export async function mandarCartaCompleta(carta, { agente = "" } = {}) {
  const como = await mandarArchivo(
    await pdfDe(carta, agente),
    nombreDelArchivo(carta.valores),
    "Te paso la oferta de compra firmada por todas las partes.",
  );
  return como !== "bloqueado";
}
