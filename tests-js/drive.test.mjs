/* Subir un inventario al Drive.

   Juan lo hace a mano: una carpeta con la dirección adentro de INVENTARIOS, adentro una
   subcarpeta por ambiente con sus fotos, y al final el PDF terminado. Esto hace lo mismo. */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  comoSeLlamaLaCarpeta, fechaCorta, subirInventario, laCarpeta, PERMISO, comoSeExplica,
} from "../lib/drive.js";

/* ---------- Cómo se llaman las carpetas ---------- */

/* LA DIRECCION PRIMERO Y LA FECHA CORTA ATRAS. La dirección adelante es lo que se busca con
   el ojo en una lista de cincuenta carpetas; la fecha atrás es lo que las separa cuando la
   dirección se repite. */
test("la carpeta se llama como la propiedad, con la fecha corta atrás", () => {
  assert.equal(
    comoSeLlamaLaCarpeta({ fecha: "2026-05-30", direccion: "Leyenda Patria 2914", unidad: "1001" }),
    "Leyenda Patria 2914 apto 1001 (30.5.2026)");
  assert.equal(
    comoSeLlamaLaCarpeta({ fecha: "2025-08-07", direccion: "Gregorio Camino 828" }),
    "Gregorio Camino 828 (7.8.2025)");
});

/* SIN LA FECHA, el mismo apartamento alquilado dos veces caía en la misma carpeta y las fotos
   se mezclaban. Lo vio Juan solo. */
test("el mismo apartamento en dos fechas son dos carpetas", () => {
  assert.notEqual(
    comoSeLlamaLaCarpeta({ fecha: "2024-10-17", direccion: "Humaita 2750" }),
    comoSeLlamaLaCarpeta({ fecha: "2025-11-27", direccion: "Humaita 2750" }));
});

/* "2026-08-28" -> "28.8.2026". Sin ceros adelante: es como se escribe una fecha a mano. */
test("la fecha va corta, sin ceros adelante", () => {
  assert.equal(fechaCorta("2026-08-28"), "28.8.2026");
  assert.equal(fechaCorta("2026-01-05"), "5.1.2026");
  assert.equal(fechaCorta("2026-12-31"), "31.12.2026");
});

test("una fecha que no está no rompe el nombre", () => {
  assert.equal(fechaCorta(""), "");
  assert.equal(fechaCorta(null), "");
  assert.equal(fechaCorta("no es una fecha"), "");
  assert.equal(comoSeLlamaLaCarpeta({ direccion: "Humaita 2750" }), "Humaita 2750");
});

/* La barra y los dos puntos rompen los nombres de carpeta al bajarlos en Windows. */
test("los caracteres que rompen un nombre de carpeta se sacan", () => {
  const nombre = comoSeLlamaLaCarpeta({
    fecha: "2026-05-30", direccion: "Leyenda patria 2914 /1001", unidad: "A:B",
  });
  assert.ok(!/[\/:*?"<>|]/.test(nombre.replace(/·/g, "")));
});

test("sin dirección igual sale un nombre usable", () => {
  assert.equal(comoSeLlamaLaCarpeta({ fecha: "2026-05-30" }), "Sin dirección (30.5.2026)");
  assert.equal(comoSeLlamaLaCarpeta({}), "Sin dirección");
  assert.equal(comoSeLlamaLaCarpeta(null), "Sin dirección");
});

/* ---------- El permiso ---------- */

/* `drive.file` deja ver y tocar SOLO los archivos que esta app crea. No puede leer el resto de
   su Drive: ni los contratos, ni las carpetas de otros clientes. Es el único permiso de Drive
   que Google considera no sensible. */
test("se pide el permiso más chico que existe", () => {
  assert.equal(PERMISO, "https://www.googleapis.com/auth/drive.file");
  assert.ok(!PERMISO.endsWith("/drive"), "el permiso entero vería todo su Drive");
});

/* ---------- Subir un inventario ---------- */

/* Un Drive de mentira, para poder probar el armado sin internet ni cuenta de Google. */
function driveDeMentira() {
  const carpetas = new Map();       // nombre|padre -> id
  const archivos = [];
  const abiertas = [];
  let proximo = 0;

  const original = globalThis.fetch;
  globalThis.fetch = async (url, opciones = {}) => {
    const dir = String(url);
    const ok = (datos) => ({ ok: true, json: async () => datos, text: async () => "" });

    if (dir.includes("/files?q=")) {
      const consulta = decodeURIComponent(dir.split("q=")[1].split("&")[0]);
      const nombre = (consulta.match(/name='([^']*)'/) || [])[1];
      const padre = (consulta.match(/'([^']*)' in parents/) || [])[1] || "";
      const id = carpetas.get(`${nombre}|${padre}`);
      return ok({ files: id ? [{ id, name: nombre }] : [] });
    }
    if (dir.includes("/permissions")) {
      abiertas.push(dir.split("/files/")[1].split("/")[0]);
      return ok({ id: "p" });
    }
    if (dir.includes("/upload/")) {
      archivos.push({ cuerpo: opciones.body });
      return ok({ id: `a${archivos.length}` });
    }
    // Crear carpeta.
    const cuerpo = JSON.parse(opciones.body);
    proximo += 1;
    const id = `c${proximo}`;
    carpetas.set(`${cuerpo.name}|${(cuerpo.parents || [])[0] || ""}`, id);
    return ok({ id });
  };
  return {
    carpetas, archivos, abiertas,
    devolver: () => { globalThis.fetch = original; },
  };
}

const laFoto = (ambiente, orden) => ({
  ambiente, orden, drive: { bytes: new Uint8Array([1, 2, 3]) },
});

test("arma la misma estructura que él arma a mano", async () => {
  const falso = driveDeMentira();
  try {
    const salida = await subirInventario("tok",
      { fecha: "2025-08-07", direccion: "Gregorio Camino 828" },
      [laFoto("Baño", 1), laFoto("Baño", 2), laFoto("Dormitorio 1", 1)],
      { pdf: { nombre: "INVENTARIO.pdf", bytes: new Uint8Array([9]) } });

    const nombres = [...falso.carpetas.keys()].map((k) => k.split("|")[0]);
    assert.ok(nombres.includes("INVENTARIOS"));
    assert.ok(nombres.includes("Gregorio Camino 828 (7.8.2025)"));
    assert.ok(nombres.includes("Baño"));
    assert.ok(nombres.includes("Dormitorio 1"));
    assert.equal(falso.archivos.length, 4, "tres fotos y el PDF");
    assert.equal(salida.subidas, 4);
    assert.match(salida.link, /^https:\/\/drive\.google\.com\/drive\/folders\//);
  } finally { falso.devolver(); }
});

/* EL LINK TIENE QUE ABRIR PARA CUALQUIERA QUE LO TENGA. No es un descuido: es el punto 6 de
   sus cláusulas — "tendrá acceso todas las personas que pueda encontrar este enlace". */
test("la carpeta queda abierta para el que tenga el link", async () => {
  const falso = driveDeMentira();
  try {
    await subirInventario("tok", { fecha: "2026-01-01", direccion: "X 1" },
      [laFoto("Cocina", 1)]);
    assert.equal(falso.abiertas.length, 1);
  } finally { falso.devolver(); }
});

/* SI SE CORTA EL INTERNET A LA MITAD, se toca de nuevo y sigue de donde quedó: no empieza de
   cero ni deja cien fotos repetidas. */
test("lo que ya se subió no se vuelve a subir", async () => {
  const falso = driveDeMentira();
  try {
    const inv = { fecha: "2026-01-01", direccion: "X 1" };
    const fotos = [laFoto("Cocina", 1), laFoto("Cocina", 2), laFoto("Cocina", 3)];
    /* Primero se sube todo, para que la carpeta EXISTA. */
    await subirInventario("tok", inv, fotos);
    falso.archivos.length = 0;
    const salida = await subirInventario("tok", inv, fotos, { yaSubida: (f) => f.orden <= 2 });
    assert.equal(salida.subidas, 1, "sólo la que faltaba");
    assert.equal(falso.archivos.length, 1);
  } finally { falso.devolver(); }
});

/* SI BORRA LA CARPETA DEL DRIVE, SE SUBE TODO DE NUEVO. Adentro de una carpeta recién creada
   no hay nada, por más que la app tenga anotado que esas fotos ya subieron. Sin esto quedaba
   una carpeta vacía y un cartel diciendo "ya estaba todo subido".

   Lo encontró Juan preguntando si podía borrarla. */
test("si borrás la carpeta del Drive, se sube todo de nuevo", async () => {
  const falso = driveDeMentira();
  try {
    const inv = { fecha: "2026-01-01", direccion: "Humaita 2750" };
    const fotos = [laFoto("Cocina", 1), laFoto("Cocina", 2)];
    /* La carpeta no existe: es como si la hubiera borrado del Drive. */
    const salida = await subirInventario("tok", inv, fotos, { yaSubida: () => true });
    assert.equal(salida.desdeCero, true);
    assert.equal(salida.subidas, 2, "las dos de nuevo, aunque figuraran subidas");
  } finally { falso.devolver(); }
});

test("una carpeta que ya existe se reusa, no se duplica", async () => {
  const falso = driveDeMentira();
  try {
    const inv = { fecha: "2026-01-01", direccion: "X 1" };
    await subirInventario("tok", inv, [laFoto("Cocina", 1)]);
    const antes = falso.carpetas.size;

    await subirInventario("tok", inv, [laFoto("Cocina", 2)]);
    assert.equal(falso.carpetas.size, antes, "las tres carpetas ya estaban");
  } finally { falso.devolver(); }
});

test("laCarpeta devuelve la que hay antes de crear otra, y dice si la creó", async () => {
  const falso = driveDeMentira();
  try {
    const uno = await laCarpeta("tok", "INVENTARIOS", null);
    const dos = await laCarpeta("tok", "INVENTARIOS", null);
    assert.equal(uno.id, dos.id);
    assert.equal(uno.recienCreada, true, "la primera vez no estaba");
    assert.equal(dos.recienCreada, false, "la segunda ya estaba");
  } finally { falso.devolver(); }
});

/* Sin fotos nuevas no hay nada que subir, pero la carpeta y el link se arman igual: es lo que
   deja pegar el link en el inventario antes de sacar la primera foto. */
test("sin fotos igual deja la carpeta y el link", async () => {
  const falso = driveDeMentira();
  try {
    const salida = await subirInventario("tok", { fecha: "2026-01-01", direccion: "X 1" }, []);
    assert.equal(salida.subidas, 0);
    assert.ok(salida.link);
  } finally { falso.devolver(); }
});

/* ---------- Qué hacer cuando Google dice que no ---------- */

/* Los errores de Google vienen en inglés y con nombre de código: "idpiframe_initialization_
   failed", "403", "access_denied". A alguien que no programa eso no le dice nada, y lo único
   que puede hacer es volver a tocar el botón. Cada uno tiene UNA cosa que hacer. */

test("«no reconozco este sitio» se traduce a qué agregar y dónde", () => {
  for (const crudo of ["redirect_uri_mismatch", "Not a valid origin", "idpiframe_init_failed"]) {
    const dice = comoSeExplica(new Error(crudo));
    assert.match(dice, /Orígenes autorizados/);
    assert.match(dice, /juanandresotero\.github\.io/);
  }
});

test("si no dio el permiso, se lo dice sin vueltas", () => {
  assert.match(comoSeExplica(new Error("access_denied")), /No diste el permiso/);
  assert.match(comoSeExplica(new Error("popup_closed_by_user")), /No diste el permiso/);
});

/* RE/MAX puede bloquear las apps de terceros desde el administrador de Workspace. Sin esto,
   Juan vería un código y no sabría que el problema no es suyo. */
test("si lo bloquea el administrador, se nombra al administrador", () => {
  const dice = comoSeExplica(new Error("Request is disallowed by admin policy"));
  assert.match(dice, /administrador/);
  assert.match(dice, /Gmail personal/, "y se ofrece la salida");
});

test("pegar el secreto en vez del ID se detecta", () => {
  assert.match(comoSeExplica(new Error("invalid_client")), /apps\.googleusercontent\.com/);
});

test("falta habilitar la API se explica como tal", () => {
  assert.match(comoSeExplica(new Error("Drive contestó 403: insufficient")), /Drive API/);
});

/* Si se corta internet en el medio de cien fotos, lo importante es que sepa que puede tocar
   de nuevo sin repetir nada. */
test("un corte de internet dice que se puede seguir", () => {
  assert.match(comoSeExplica(new Error("Failed to fetch")), /sigue de donde quedó/);
});

test("un error que no conozco se muestra, no se esconde", () => {
  const dice = comoSeExplica(new Error("algo rarísimo que nunca vi"));
  assert.match(dice, /algo rarísimo/);
});

test("no se rompe con cualquier cosa", () => {
  assert.ok(comoSeExplica(null));
  assert.ok(comoSeExplica(undefined));
  assert.ok(comoSeExplica("un texto suelto"));
});

/* SI NO SE PUEDE ABRIR LA CARPETA, LA SUBIDA IGUAL VALE. Un Workspace puede tener prohibido
   compartir con "cualquiera que tenga el link". Si eso reventara, se perdería el aviso de que
   las cien fotos YA subieron — y volver a tocar el botón sería empezar de cero a los ojos de
   quien lo mira. */
test("aunque no se pueda compartir, las fotos ya están subidas", async () => {
  const falso = driveDeMentira();
  const original = globalThis.fetch;
  globalThis.fetch = async (url, opciones) => {
    if (String(url).includes("/permissions")) throw new Error("disallowed by admin policy");
    return original(url, opciones);
  };
  try {
    const salida = await subirInventario("tok", { fecha: "2026-01-01", direccion: "X 1" },
      [laFoto("Cocina", 1), laFoto("Cocina", 2)]);
    assert.equal(salida.subidas, 2, "las dos subieron igual");
    assert.equal(salida.abierta, false, "y se sabe que no se pudo compartir");
    assert.match(salida.link, /^https:\/\/drive\.google\.com\/drive\/folders\//);
  } finally { falso.devolver(); }
});
