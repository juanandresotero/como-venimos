/* El estado de la carta, empaquetado adentro de una URL.

   Todo viaja en el FRAGMENTO —lo que va despues del `#`— y eso no es un detalle de
   formato: el fragmento NO se manda al servidor. GitHub Pages nunca ve el contenido de
   la carta, no queda en ningun registro, y el dato va de un celular al otro adentro del
   mensaje de WhatsApp, que ya viaja cifrado.

   El paquete es: un JSON con las casillas, y atras las firmas en crudo. Todo junto se
   deflacta de una sola vez —los nombres de las casillas se repiten y comprimen muy
   bien— y se escribe en base64url, que no tiene ningun caracter que WhatsApp o un
   navegador tengan que escapar.

   El presupuesto de 3.000 caracteres esta medido, no estimado: ver el ultimo test de
   carta-enlace.test.mjs, que arma una carta llena con las dos firmas. */

import { CAMPOS } from "./carta-oferta.js";
import { deBytes, aBytes, achicar } from "./firma.js";

/* Lo mas largo que puede salir un enlace. Es un LIMITE QUE SE CUMPLE, no una aspiracion:
   `aEnlaceQueEntre` achica la firma hasta que entre.

   El numero es el TECHO, el caso peor: una carta llena con las DOS firmas dibujadas con el
   dedo mide 1.684 caracteres, y esas no se pueden achicar sin arruinarlas. Lo que si se
   achica son las firmas sacadas de una foto, que son dibujos de puntos y pueden pesar
   catorce mil bytes.

   Sin firma el enlace mide unos 200 caracteres. Con una firma dibujada, unos 800. Lo que se
   evita aca son los MILES: cinco pantallas de basura verde que ademas WhatsApp corta, y un
   enlace cortado es una carta que no vuelve. Le paso a Juan. */
export const PRESUPUESTO = 1800;

/* Version 2: las casillas van EN ORDEN, sin sus nombres.

   En la version 1 iban como JSON, y los nombres de las casillas ("dias_reserva",
   "departamento"…) eran casi la mitad del enlace sin aportar nada: el orden ya dice cual
   es cual. Sacarlos bajo el enlace de 228 a poco mas de 150 caracteres.

   El precio de esto es que el ORDEN DE `CAMPOS` PASA A IMPORTAR: si un dia se agrega una
   casilla en el medio, los enlaces viejos se leen corridos. Por eso esta el numero de
   version: un enlace de otra version se rechaza en vez de mostrar la carta mal. Agregar
   casillas AL FINAL es seguro; meterlas en el medio obliga a subir la version. */
const VERSION = 4;   // se agregaron el numero de carta y el telefono del agente
const ORDEN_FIRMAS = ["oferente", "depositario", "propietario"];
const TURNOS = ["comprador", "propietario"];

function aBase64Url(bytes) {
  let crudo = "";
  for (const b of bytes) crudo += String.fromCharCode(b);
  return btoa(crudo).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function deBase64Url(texto) {
  const normal = texto.replace(/-/g, "+").replace(/_/g, "/");
  const crudo = atob(normal + "=".repeat((4 - (normal.length % 4)) % 4));
  return Uint8Array.from(crudo, (c) => c.charCodeAt(0));
}

async function pasarPor(bytes, transformador) {
  const stream = new Blob([bytes]).stream().pipeThrough(transformador);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

const comprimir = (b) => pasarPor(b, new CompressionStream("deflate-raw"));
const descomprimir = (b) => pasarPor(b, new DecompressionStream("deflate-raw"));

/* Un texto como largo + contenido, con UN byte de largo.

   Ninguna casilla de la carta llega a 254 letras — la mas larga es un domicilio. El 255
   queda reservado por si alguna vez pasa: ahi el largo va en los dos bytes siguientes.
   Con dos bytes fijos se pagaban 17 bytes de mas por carta, uno por casilla, la mayoria
   para decir "esta vacia". */
function escribirTexto(bytes, texto) {
  const crudo = new TextEncoder().encode(String(texto ?? ""));
  if (crudo.length < 255) bytes.push(crudo.length);
  else bytes.push(255, crudo.length >> 8, crudo.length & 255);
  bytes.push(...crudo);
}

function leerTexto(bytes, cursor) {
  if (cursor.i >= bytes.length) return null;
  let largo = bytes[cursor.i];
  cursor.i += 1;
  if (largo === 255) {
    if (cursor.i + 2 > bytes.length) return null;
    largo = (bytes[cursor.i] << 8) | bytes[cursor.i + 1];
    cursor.i += 2;
  }
  if (cursor.i + largo > bytes.length) return null;
  const texto = new TextDecoder().decode(bytes.slice(cursor.i, cursor.i + largo));
  cursor.i += largo;
  return texto;
}

export async function aEnlace(base, estado) {
  const valores = estado.valores || {};
  const fuera = new Set(estado.quitadas || []);

  const cabezaBytes = [VERSION, Math.max(0, TURNOS.indexOf(estado.turno))];

  /* Las casillas quitadas van como un mapa de bits: un bit por casilla, en el mismo
     orden. Diecisiete casillas entran en tres bytes; en JSON eran sus nombres enteros. */
  const mapa = new Uint8Array(Math.ceil(CAMPOS.length / 8));
  CAMPOS.forEach((campo, i) => {
    if (fuera.has(campo.clave)) mapa[i >> 3] |= 128 >> (i & 7);
  });
  cabezaBytes.push(...mapa);

  for (const campo of CAMPOS) {
    const valor = valores[campo.clave];
    escribirTexto(cabezaBytes, valor === null || valor === undefined ? "" : valor);
  }
  escribirTexto(cabezaBytes, estado.agente || "");
  /* El NUMERO DE CARTA es lo que permite que la vuelta caiga en la carta correcta. Sin
     esto, dos cartas oferta al mismo tiempo se pisaban: volvia una firma y se juntaba con
     lo que estuviera abierto, no con la carta a la que pertenecia. */
  escribirTexto(cabezaBytes, estado.id || "");
  /* El telefono del agente viaja para que el cliente le devuelva la carta de UN toque, sin
     buscarlo en su agenda. Son diez digitos: al comprimir no se nota. */
  escribirTexto(cabezaBytes, estado.telefono || "");

  const cabeza = new Uint8Array(cabezaBytes);

  const trozos = [new Uint8Array([cabeza.length >> 8, cabeza.length & 255]), cabeza];
  for (const clave of ORDEN_FIRMAS) {
    const firma = (estado.firmas || {})[clave];
    if (!firma || !firma.length) continue;
    trozos.push(new Uint8Array([
      ORDEN_FIRMAS.indexOf(clave), firma.length >> 8, firma.length & 255,
    ]), firma);
  }

  const paquete = new Uint8Array(trozos.reduce((n, t) => n + t.length, 0));
  let i = 0;
  for (const trozo of trozos) {
    paquete.set(trozo, i);
    i += trozo.length;
  }

  return `${base}#${aBase64Url(await comprimir(paquete))}`;
}

export async function deEnlace(url) {
  const fragmento = String(url || "").split("#")[1];
  if (!fragmento || !/^[A-Za-z0-9_-]+$/.test(fragmento)) return null;

  let paquete;
  try {
    paquete = await descomprimir(deBase64Url(fragmento));
  } catch {
    return null;
  }
  if (paquete.length < 2) return null;

  try {
    const largo = (paquete[0] << 8) | paquete[1];
    if (largo + 2 > paquete.length) return null;
    const cabeza = paquete.slice(2, 2 + largo);
    if (cabeza[0] !== VERSION) return null;

    const cursor = { i: 2 + Math.ceil(CAMPOS.length / 8) };
    const quitadas = [];
    CAMPOS.forEach((campo, i) => {
      if (cabeza[2 + (i >> 3)] & (128 >> (i & 7))) quitadas.push(campo.clave);
    });
    const valores = {};
    for (const campo of CAMPOS) {
      const valor = leerTexto(cabeza, cursor);
      if (valor === null) return null;
      if (valor !== "") {
        valores[campo.clave] = campo.tipo === "monto" || campo.tipo === "entero"
          ? Number(valor) : valor;
      }
    }
    const agente = leerTexto(cabeza, cursor) || "";
    const id = leerTexto(cabeza, cursor) || "";
    const telefono = leerTexto(cabeza, cursor) || "";

    const firmas = {};
    let i = 2 + largo;
    while (i + 3 <= paquete.length) {
      const clave = ORDEN_FIRMAS[paquete[i]];
      const cuantos = (paquete[i + 1] << 8) | paquete[i + 2];
      if (!clave || i + 3 + cuantos > paquete.length) return null;
      firmas[clave] = paquete.slice(i + 3, i + 3 + cuantos);
      i += 3 + cuantos;
    }

    return {
      valores,
      quitadas,
      turno: TURNOS[cabeza[1]] || "comprador",
      agente,
      id,
      telefono,
      firmas,
    };
  } catch {
    return null;
  }
}

/* El mensaje con el que la carta se manda o se devuelve por WhatsApp.

   Si hay telefono, `wa.me/<numero>` abre la conversacion con esa persona ya elegida —
   asi el cliente no tiene que buscar al usuario en su agenda para devolverle la carta
   firmada. Sin telefono, WhatsApp pregunta a quien mandarsela. */
export function comoWhatsApp(enlace, { texto = "", telefono = "" } = {}) {
  const mensaje = encodeURIComponent(texto ? `${texto}\n\n${enlace}` : enlace);
  const soloDigitos = String(telefono).replace(/\D/g, "");
  return `https://wa.me/${soloDigitos}?text=${mensaje}`;
}

/* El enlace, achicando la firma hasta que entre en el presupuesto.

   La firma dibujada con el dedo son cuatrocientos bytes y nunca molesta. La sacada de una
   FOTO es un dibujo de puntos: puede pesar catorce mil bytes y hacer un enlace de miles de
   caracteres. Antes se armaba y se mandaba lo que saliera; ahora se mide y, si no entra, se
   achica la firma y se vuelve a medir.

   Se achica de a poco (un 20% cada vuelta) para perder la menor calidad posible, y se
   prueban hasta doce vueltas — mas que suficiente para bajar de catorce mil bytes a nada. */
export async function aEnlaceQueEntre(base, estado, limite = PRESUPUESTO) {
  let firmas = estado.firmas || {};
  let enlace = await aEnlace(base, { ...estado, firmas });

  for (let vuelta = 0; vuelta < 12 && enlace.length > limite; vuelta++) {
    const achicadas = {};
    let seAchicoAlguna = false;
    for (const [clave, bytes] of Object.entries(firmas)) {
      const dibujo = deBytes(bytes);
      /* Los trazos del dedo ya son chicos: no hay nada que achicar y achicarlos empeoraria
         la firma sin ganar nada. Lo que pesa son las mascaras. */
      if (!dibujo || dibujo.clase !== "mascara" || dibujo.ancho <= 40) {
        achicadas[clave] = bytes;
        continue;
      }
      achicadas[clave] = aBytes(achicar(dibujo, 0.8));
      seAchicoAlguna = true;
    }
    if (!seAchicoAlguna) break;
    firmas = achicadas;
    enlace = await aEnlace(base, { ...estado, firmas });
  }
  return enlace;
}
