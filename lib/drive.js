/* SUBIR LAS FOTOS DE UN INVENTARIO AL DRIVE.

   Juan sube los inventarios a mano: crea una carpeta con la direccion adentro de INVENTARIOS,
   adentro una subcarpeta por ambiente con sus fotos, y al final el PDF terminado. Esto hace
   exactamente eso, con una diferencia: las carpetas quedan todas con el mismo nombre. Hoy
   tiene "Humaita 2750", "Humaita 2750 - 2025" y "Leyenda patria 2914 /1001 - Fecha 1/6/2025",
   que son tres formas distintas de escribir lo mismo.

   POR QUE ESTE CAMINO Y NO OTRO. En el bot de debida diligencia esto se resolvio con OAuth 2.0
   y un refresh token, corriendo en un servidor. Aca no hay servidor: la app es una pagina
   estatica en GitHub Pages. Asi que se usa el flujo del NAVEGADOR (Google Identity Services),
   que da un permiso que dura una hora y no necesita ningun secreto guardado.

   ESO ES A PROPOSITO Y ES LO IMPORTANTE: un refresh token adentro de este repositorio —que es
   publico— seria la llave del Drive de Juan a la vista de cualquiera. El permiso de una hora
   se pide cuando hace falta y se va solo.

   EL PERMISO QUE SE PIDE ES EL MAS CHICO QUE EXISTE: `drive.file` deja ver y tocar SOLO los
   archivos que esta app crea. No puede leer el resto de su Drive, ni los contratos, ni las
   carpetas de otros clientes. */

/* El permiso. `drive.file` es el unico que Google considera NO sensible: no pide verificacion
   ni pantalla de "esta app no esta verificada". */
export const PERMISO = "https://www.googleapis.com/auth/drive.file";

const CARPETA = "application/vnd.google-apps.folder";
const API = "https://www.googleapis.com/drive/v3";
const SUBIDA = "https://www.googleapis.com/upload/drive/v3/files";

/* ---------- El permiso ---------- */

let permiso = null;   // { token, vence }

export const hayPermiso = () => Boolean(permiso && permiso.vence > Date.now());
export const olvidarPermiso = () => { permiso = null; };

/* Pide el permiso a Google. Abre la ventanita de "elegí tu cuenta" la primera vez.

   `clienteId` sale de Ajustes, no del codigo: es el numero del proyecto de Google de Juan y no
   tiene por que vivir en un repositorio publico, aunque no sea un secreto. */
export function pedirPermiso(clienteId, { forzar = false } = {}) {
  return new Promise((listo, falla) => {
    if (!clienteId) { falla(new Error("falta el ID de cliente de Google")); return; }
    if (!forzar && hayPermiso()) { listo(permiso.token); return; }
    const google = globalThis.google;
    if (!google || !google.accounts || !google.accounts.oauth2) {
      falla(new Error("no cargó la librería de Google"));
      return;
    }
    google.accounts.oauth2.initTokenClient({
      client_id: clienteId,
      scope: PERMISO,
      callback: (respuesta) => {
        if (!respuesta || !respuesta.access_token) {
          falla(new Error(respuesta && respuesta.error ? respuesta.error : "no dio el permiso"));
          return;
        }
        /* Google da el permiso por una hora. Se guarda con un minuto de descuento para que no
           venza justo en el medio de una subida de cien fotos. */
        permiso = {
          token: respuesta.access_token,
          vence: Date.now() + (Number(respuesta.expires_in || 3600) - 60) * 1000,
        };
        listo(permiso.token);
      },
    }).requestAccessToken({ prompt: hayPermiso() ? "" : "consent" });
  });
}

/* La libreria de Google se baja cuando hace falta, no al abrir la app: son 80 KB que no le
   sirven de nada a alguien que nunca va a tocar el Drive. */
export function cargarGoogle() {
  if (globalThis.google && globalThis.google.accounts) return Promise.resolve(true);
  return new Promise((listo, falla) => {
    const guion = document.createElement("script");
    guion.src = "https://accounts.google.com/gsi/client";
    guion.async = true;
    guion.onload = () => listo(true);
    guion.onerror = () => falla(new Error("no se pudo bajar la librería de Google"));
    document.head.append(guion);
  });
}

/* ---------- Hablar con el Drive ---------- */

async function pedir(token, url, opciones = {}) {
  const respuesta = await fetch(url, {
    ...opciones,
    headers: { Authorization: `Bearer ${token}`, ...(opciones.headers || {}) },
  });
  if (!respuesta.ok) {
    const texto = await respuesta.text().catch(() => "");
    throw new Error(`Drive contestó ${respuesta.status}${texto ? `: ${texto.slice(0, 120)}` : ""}`);
  }
  return respuesta.json();
}

const escapado = (nombre) => String(nombre).replace(/'/g, "\\'");

/* Busca una carpeta por nombre adentro de otra. Devuelve el id o null.

   OJO CON `trashed=false`: sin eso, una carpeta que se mando a la papelera sigue apareciendo y
   las fotos van a parar a la basura sin que nadie se entere. */
export async function buscarCarpeta(token, nombre, dentroDe) {
  const consulta = [
    `name='${escapado(nombre)}'`,
    `mimeType='${CARPETA}'`,
    "trashed=false",
    dentroDe ? `'${escapado(dentroDe)}' in parents` : null,
  ].filter(Boolean).join(" and ");
  const url = `${API}/files?q=${encodeURIComponent(consulta)}&fields=files(id,name)&pageSize=1`;
  const datos = await pedir(token, url);
  return (datos.files || [])[0] ? datos.files[0].id : null;
}

export async function crearCarpeta(token, nombre, dentroDe) {
  const cuerpo = { name: nombre, mimeType: CARPETA };
  if (dentroDe) cuerpo.parents = [dentroDe];
  const datos = await pedir(token, `${API}/files?fields=id`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cuerpo),
  });
  return datos.id;
}

/* La carpeta, exista o no. Es lo que deja correr esto dos veces sin duplicar nada. */
export async function laCarpeta(token, nombre, dentroDe) {
  return (await buscarCarpeta(token, nombre, dentroDe))
    || crearCarpeta(token, nombre, dentroDe);
}

/* Sube un archivo. `bytes` es lo que ya tenemos achicado, sin volver a tocarlo. */
export async function subirArchivo(token, { nombre, bytes, tipo = "image/jpeg", dentroDe }) {
  const limite = "-----comovenimos-----";
  const cabecera = JSON.stringify({ name: nombre, parents: dentroDe ? [dentroDe] : undefined });
  const partes = new Blob([
    `--${limite}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${cabecera}\r\n`,
    `--${limite}\r\nContent-Type: ${tipo}\r\n\r\n`,
    bytes,
    `\r\n--${limite}--\r\n`,
  ]);
  const datos = await pedir(token, `${SUBIDA}?uploadType=multipart&fields=id,webViewLink`, {
    method: "POST",
    headers: { "Content-Type": `multipart/related; boundary=${limite}` },
    body: partes,
  });
  return datos;
}

/* Deja la carpeta abierta para cualquiera que tenga el link. Es lo que Juan ya hace a mano:
   el link va adentro del inventario, y el inquilino tiene que poder abrirlo sin pedir permiso.

   NO ES UN DESCUIDO, ES EL PUNTO 6 DE SUS CLAUSULAS: "tendrá acceso todas las personas que
   pueda encontrar este enlace". */
export async function abrirALosQueTenganElLink(token, carpeta) {
  await pedir(token, `${API}/files/${carpeta}/permissions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role: "reader", type: "anyone" }),
  });
  return `https://drive.google.com/drive/folders/${carpeta}`;
}

/* ---------- Cómo se llaman las carpetas ---------- */

/* SIEMPRE IGUAL. Hoy en su Drive conviven "Humaita 2750", "Humaita 2750 - 2025" y "Leyenda
   patria 2914 /1001 - Fecha 1/6/2025": tres formas de escribir lo mismo, y ninguna se ordena
   con la otra. La fecha adelante en formato año-mes-día las ordena solas y no se repiten
   cuando la misma propiedad se alquila dos veces. */
export function comoSeLlamaLaCarpeta(inventario) {
  const inv = inventario || {};
  const donde = [inv.direccion, inv.unidad ? `apto ${inv.unidad}` : ""]
    .filter(Boolean).join(" ").trim() || "Sin dirección";
  const cuando = (inv.fecha || "").trim();
  const nombre = cuando ? `${cuando} · ${donde}` : donde;
  /* La barra y los dos puntos rompen los nombres de carpeta en Windows cuando se bajan. */
  return nombre.replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").trim();
}

/* ---------- Subir un inventario entero ---------- */

/* Arma en el Drive lo mismo que Juan arma a mano:

     INVENTARIOS / <fecha · dirección> / <Ambiente> / <las fotos>
                                       / <el inventario en PDF>

   `avisar(hechas, total, que)` se llama en cada paso: subir cien fotos tarda, y una pantalla
   quieta parece colgada.

   LO QUE YA ESTABA SUBIDO NO SE VUELVE A SUBIR. Si se corta el internet a la mitad, se toca
   de nuevo y sigue de donde quedo — no empieza de cero ni deja cien fotos repetidas. */
export async function subirInventario(token, inventario, fotos, {
  raiz = "INVENTARIOS", pdf = null, avisar = () => {}, yaSubida = () => false, anotar = () => {},
} = {}) {
  const carpetaRaiz = await laCarpeta(token, raiz, null);
  const carpeta = await laCarpeta(token, comoSeLlamaLaCarpeta(inventario), carpetaRaiz);

  const pendientes = (fotos || []).filter((f) => f && f.drive && !yaSubida(f));
  const total = pendientes.length + (pdf ? 1 : 0);
  let hechas = 0;

  const porAmbiente = new Map();
  for (const foto of pendientes) {
    if (!porAmbiente.has(foto.ambiente)) porAmbiente.set(foto.ambiente, []);
    porAmbiente.get(foto.ambiente).push(foto);
  }

  for (const [ambiente, suyas] of porAmbiente) {
    const subcarpeta = await laCarpeta(token, ambiente || "Ambiente", carpeta);
    for (const foto of suyas) {
      const nombre = `${ambiente || "Ambiente"} - ${String(foto.orden).padStart(2, "0")}.jpg`;
      const subido = await subirArchivo(token, {
        nombre, bytes: foto.drive.bytes, dentroDe: subcarpeta,
      });
      await anotar(foto, subido.id);
      hechas += 1;
      avisar(hechas, total, ambiente);
    }
  }

  if (pdf) {
    await subirArchivo(token, {
      nombre: pdf.nombre, bytes: pdf.bytes, tipo: "application/pdf", dentroDe: carpeta,
    });
    hechas += 1;
    avisar(hechas, total, "el PDF");
  }

  const link = await abrirALosQueTenganElLink(token, carpeta);
  return { carpeta, link, subidas: hechas };
}
