/* Hablar con la API de GitHub para guardar los cambios del usuario en el repo.

   Por que hace falta un token: una pagina estatica no puede escribir en un repositorio
   por si sola. El usuario genera un token una sola vez, limitado a ESTE repo, y queda
   guardado en su telefono. Se puede anular desde GitHub en un clic. (§3.4) */

export const REPO = "juanandresotero/como-venimos";
export const RAMA = "main";

const CLAVE_TOKEN = "como-venimos:token";

/* btoa() solo entiende bytes, y nuestros datos tienen acentos y hasta emojis.
   Hay que pasar por UTF-8 a mano o "Maroñas" se rompe. */
export function aBase64(texto) {
  const bytes = new TextEncoder().encode(texto);
  let binario = "";
  for (const b of bytes) binario += String.fromCharCode(b);
  return btoa(binario);
}

export function deBase64(base64) {
  const binario = atob(base64.replace(/\s/g, ""));
  const bytes = Uint8Array.from(binario, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function urlContenido(ruta) {
  return `https://api.github.com/repos/${REPO}/contents/${ruta}`;
}

export function guardarToken(token) {
  localStorage.setItem(CLAVE_TOKEN, token.trim());
}

export function leerToken() {
  try {
    return localStorage.getItem(CLAVE_TOKEN) || "";
  } catch {
    return "";
  }
}

export function borrarToken() {
  localStorage.removeItem(CLAVE_TOKEN);
}

const cabeceras = (token) => ({
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
});

function explicar(estado, cuerpo) {
  if (estado === 401 || estado === 403) {
    return "El token no sirve o no tiene permiso. Revisalo en Ajustes.";
  }
  if (estado === 409 || estado === 422) {
    return "Hubo un conflicto: el archivo cambió en GitHub mientras editabas.";
  }
  return `GitHub respondió ${estado}: ${(cuerpo && cuerpo.message) || "error desconocido"}`;
}

export async function leerArchivo(ruta, token) {
  const respuesta = await fetch(`${urlContenido(ruta)}?ref=${RAMA}`, {
    headers: cabeceras(token),
    cache: "no-cache",
  });
  if (respuesta.status === 404) return { datos: null, sha: null };
  const cuerpo = await respuesta.json();
  if (!respuesta.ok) throw new Error(explicar(respuesta.status, cuerpo));
  return { datos: JSON.parse(deBase64(cuerpo.content)), sha: cuerpo.sha };
}

export async function escribirArchivo(ruta, datos, sha, mensaje, token) {
  const cuerpoPedido = {
    message: mensaje,
    content: aBase64(JSON.stringify(datos, null, 1) + "\n"),
    branch: RAMA,
  };
  // Sin sha, GitHub entiende "crear archivo nuevo". Con sha, "actualizar este".
  if (sha) cuerpoPedido.sha = sha;

  const respuesta = await fetch(urlContenido(ruta), {
    method: "PUT",
    headers: { ...cabeceras(token), "Content-Type": "application/json" },
    body: JSON.stringify(cuerpoPedido),
  });
  const cuerpo = await respuesta.json();
  if (!respuesta.ok) throw new Error(explicar(respuesta.status, cuerpo));
  return { sha: cuerpo.content.sha };
}

export async function probarToken(token) {
  try {
    const respuesta = await fetch(`https://api.github.com/repos/${REPO}`, {
      headers: cabeceras(token),
    });
    const cuerpo = await respuesta.json();
    if (!respuesta.ok) return { ok: false, mensaje: explicar(respuesta.status, cuerpo) };
    if (!cuerpo.permissions || !cuerpo.permissions.push) {
      return {
        ok: false,
        mensaje: "El token entra al repo pero no puede escribir. Al crearlo hay que darle permiso de Contents: Read and write.",
      };
    }
    return { ok: true, mensaje: `Listo, conectado a ${cuerpo.full_name}` };
  } catch (error) {
    return { ok: false, mensaje: `No se pudo conectar: ${error.message}` };
  }
}
