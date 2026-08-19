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

export const PRESUPUESTO = 3000;
const VERSION = 1;
const ORDEN_FIRMAS = ["oferente", "depositario", "propietario"];

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

export async function aEnlace(base, estado) {
  const cabeza = new TextEncoder().encode(JSON.stringify({
    v: VERSION,
    valores: estado.valores || {},
    quitadas: estado.quitadas || [],
    turno: estado.turno || "comprador",
    tel: estado.telefono_agente || "",
    agente: estado.agente || "",
  }));

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
    const cabeza = JSON.parse(new TextDecoder().decode(paquete.slice(2, 2 + largo)));
    if (cabeza.v !== VERSION) return null;

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
      valores: cabeza.valores || {},
      quitadas: cabeza.quitadas || [],
      turno: cabeza.turno,
      telefono_agente: cabeza.tel || "",
      agente: cabeza.agente || "",
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
