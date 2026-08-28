/* LAS FOTOS DE UN INVENTARIO.

   Un inventario sin fotos es la palabra de uno contra la del otro. El de Leyenda patria tiene
   ciento cincuenta, y son la mitad del valor del documento: el dia que el inquilino se va, lo
   que decide si se devuelve el deposito es poder mirar como estaba la pared.

   TRES PROBLEMAS QUE HAY QUE RESOLVER JUNTOS:

   1. EL PESO. Una foto de celular pesa entre 2 y 5 MB. Ciento cincuenta son medio giga: no
      entran en el telefono, no suben con datos moviles y hacen un PDF que no abre nadie.

   2. QUE SIRVAN PARA DOS COSAS DISTINTAS. En el PDF una foto se imprime del tamaño de un
      sello —cinco por fila en una A4— asi que 760 puntos de lado sobran. Pero para el Drive,
      donde se miran en grande, hace falta mas.

      Por eso se guardan DOS versiones de cada una: la chica para el papel y una grande para
      el Drive. Dos versiones de 150 fotos pesan unos 45 MB; los 450 MB de las originales no
      los aguanta el telefono.

   3. DONDE VIVEN. En localStorage no entran ni tres: es para texto y tiene un techo de pocos
      megas. Van a IndexedDB, que es el deposito grande del navegador, y NUNCA al repositorio
      —que es publico— porque son fotos de adentro de la casa de un cliente.

   Este archivo tiene dos mitades. Las cuentas son puras y se prueban solas; achicar y guardar
   necesitan el navegador. */

/* Cuanto mide cada version. La chica se imprime a 100 puntos de ancho en la hoja: con 760 de
   lado se puede hacer zoom al doble y todavia se ve. La grande es para mirar en pantalla. */
export const PARA_EL_PAPEL = { lado: 760, calidad: 0.66 };
export const PARA_EL_DRIVE = { lado: 1600, calidad: 0.82 };

/* Achicar una foto SIN DEFORMARLA: se respeta la proporcion y se limita el lado mas largo.
   Una foto estirada de una pared no prueba nada sobre esa pared. */
export function medidaAchicada(ancho, alto, lado) {
  if (!ancho || !alto) return null;
  const mayor = Math.max(ancho, alto);
  if (mayor <= lado) return { ancho, alto };
  const factor = lado / mayor;
  return { ancho: Math.round(ancho * factor), alto: Math.round(alto * factor) };
}

/* Como se llama una foto en el Drive: el ambiente y el numero, en el orden en que se sacaron.
   "Dormitorio 1 - 03.jpg" se ordena solo en cualquier carpeta; "IMG_20260828_143355.jpg" no
   dice nada. El cero adelante es lo que hace que la 10 no quede antes que la 2. */
export function comoSeLlamaLaFoto(ambiente, numero) {
  const limpio = String(ambiente || "Ambiente").replace(/[\\/:*?"<>|]/g, "-").trim();
  return `${limpio} - ${String(numero).padStart(2, "0")}.jpg`;
}

/* ---------- El deposito ---------- */

/* IndexedDB es el unico deposito del navegador donde entran fotos: localStorage tiene un techo
   de pocos megas y es para texto.

   PERO ES ASINCRONICO Y PUEDE NO CONTESTAR NUNCA: si el telefono se queda sin lugar, si el
   usuario esta en modo incognito, o si otra pestaña dejo una transaccion abierta. Sin un
   reloj encima, la pantalla se queda en "achicando las fotos..." para siempre y no hay forma
   de saber por que. Todo lo de aca abajo tiene su reloj y devuelve algo razonable si falla:
   perder una foto es malo, colgar la app es peor. */

const BASE = "como-venimos-fotos";
const BOLSA = "fotos";
const ESPERA = 10000;

/* UNA sola conexion para toda la sesion. Abrir una por operacion —eran decenas por minuto—
   deja conexiones colgando y en algunos telefonos termina bloqueando la base contra si misma. */
let conexion = null;

function abrir() {
  if (conexion) return conexion;
  conexion = new Promise((listo, falla) => {
    if (typeof indexedDB === "undefined") { falla(new Error("este navegador no guarda fotos")); return; }
    const reloj = setTimeout(() => falla(new Error("el depósito no contestó")), ESPERA);
    const pedido = indexedDB.open(BASE, 1);
    pedido.onupgradeneeded = () => {
      const db = pedido.result;
      if (!db.objectStoreNames.contains(BOLSA)) {
        const bolsa = db.createObjectStore(BOLSA, { keyPath: "id" });
        /* Se busca siempre por inventario y por ambiente: sin el indice habria que leer todas
           las fotos de todos los inventarios para dibujar una tarjeta. */
        bolsa.createIndex("por_ambiente", ["inventario", "ambiente"]);
        bolsa.createIndex("por_inventario", "inventario");
      }
    };
    pedido.onsuccess = () => { clearTimeout(reloj); listo(pedido.result); };
    pedido.onerror = () => { clearTimeout(reloj); falla(pedido.error || new Error("no abrio")); };
    pedido.onblocked = () => { clearTimeout(reloj); falla(new Error("el depósito está ocupado")); };
  });
  /* Si fallo, la proxima vez se vuelve a intentar: puede haber sido algo pasajero. */
  conexion.catch(() => { conexion = null; });
  return conexion;
}

/* Corre una operacion y devuelve `siFalla` en vez de reventar. Una foto que no se puede leer
   no puede dejar sin dibujar la tarjeta entera del ambiente. */
async function enElDeposito(modo, hacer, siFalla) {
  try {
    const db = await abrir();
    return await new Promise((listo, falla) => {
      const reloj = setTimeout(() => falla(new Error("el depósito tardó demasiado")), ESPERA);
      const trans = db.transaction(BOLSA, modo);
      let resultado;
      hacer(trans.objectStore(BOLSA), (x) => { resultado = x; });
      trans.oncomplete = () => { clearTimeout(reloj); listo(resultado); };
      trans.onerror = () => { clearTimeout(reloj); falla(trans.error || new Error("falló")); };
      trans.onabort = () => { clearTimeout(reloj); falla(trans.error || new Error("se cortó")); };
    });
  } catch (error) {
    ultimoProblema = error.message || "no se pudo guardar la foto";
    return siFalla;
  }
}

/* Lo ultimo que salio mal, para poder decirlo en pantalla. Un fallo silencioso con las fotos
   es peor que uno ruidoso: te enteras el dia que abris el PDF y no estan. */
let ultimoProblema = "";
export const queSalioMal = () => ultimoProblema;
export const olvidarElProblema = () => { ultimoProblema = ""; };

const enOrden = (fotos) => (fotos || []).sort((a, b) => (a.orden || 0) - (b.orden || 0));

/* Las fotos de un ambiente, en el orden en que se agregaron. */
export function fotosDe(inventario, ambiente) {
  return enElDeposito("readonly", (bolsa, dejar) => {
    const pedido = bolsa.index("por_ambiente").getAll([inventario, ambiente]);
    pedido.onsuccess = () => dejar(enOrden(pedido.result));
  }, []);
}

export function fotosDelInventario(inventario) {
  return enElDeposito("readonly", (bolsa, dejar) => {
    const pedido = bolsa.index("por_inventario").getAll(inventario);
    pedido.onsuccess = () => dejar(enOrden(pedido.result));
  }, []);
}

export function guardarFoto(foto) {
  return enElDeposito("readwrite", (bolsa, dejar) => {
    bolsa.put(foto);
    dejar(foto);
  }, null);
}

export function borrarFoto(id) {
  return enElDeposito("readwrite", (bolsa, dejar) => {
    bolsa.delete(id);
    dejar(id);
  }, null);
}

/* Al borrar un inventario se van sus fotos. Si no, quedan cientos de megas de una casa que ya
   no existe en la app, y nadie las va a ir a buscar. */
export async function borrarFotosDe(inventario) {
  const suyas = await fotosDelInventario(inventario);
  return enElDeposito("readwrite", (bolsa, dejar) => {
    for (const f of suyas) bolsa.delete(f.id);
    dejar(suyas.length);
  }, 0);
}

/* ---------- Achicar ---------- */

/* CUANTO SE ESPERA A QUE EL NAVEGADOR DECODIFIQUE UNA FOTO antes de probar por el otro lado.

   `createImageBitmap` es el camino rapido, pero puede quedarse colgado sin contestar nunca
   —pasa—. Sin este reloj, la app se queda en "achicando las fotos..." para siempre y no hay
   forma de saber por que.

   VEINTE SEGUNDOS ES MUCHO A PROPOSITO. No es para que la espera sea corta: es para que una
   foto que NUNCA va a contestar no deje la pantalla colgada. Un telefono viejo achicando una
   foto de doce megapixeles puede tardar varios segundos, y cortarlo antes de tiempo seria
   perder una foto que estaba por salir bien. */
const PACIENCIA = 20000;

function conReloj(promesa, ms) {
  return Promise.race([
    promesa,
    new Promise((_, mal) => setTimeout(() => mal(new Error("tardo demasiado")), ms)),
  ]);
}

/* Decodifica la foto UNA sola vez.

   Antes se decodificaba dos veces, una por medida, y decodificar es lo caro de todo esto: una
   foto de celular son doce millones de pixeles. Con veinte fotos por ambiente, hacerlo dos
   veces es el doble de espera parado en el medio de un apartamento. */
async function comoImagen(archivo) {
  if (typeof createImageBitmap === "function") {
    try {
      return await conReloj(createImageBitmap(archivo), PACIENCIA);
    } catch {
      /* Si el camino rapido no contesta, se sigue por el lento. */
    }
  }
  return new Promise((listo, falla) => {
    const url = URL.createObjectURL(archivo);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); listo(img); };
    img.onerror = () => { URL.revokeObjectURL(url); falla(new Error("no se pudo leer")); };
    img.src = url;
  });
}

function dibujar(bitmap, { lado, calidad }) {
  const ancho = bitmap.width || bitmap.naturalWidth;
  const alto = bitmap.height || bitmap.naturalHeight;
  const medida = medidaAchicada(ancho, alto, lado) || { ancho, alto };

  const lienzo = document.createElement("canvas");
  lienzo.width = medida.ancho;
  lienzo.height = medida.alto;
  lienzo.getContext("2d").drawImage(bitmap, 0, 0, medida.ancho, medida.alto);

  return conReloj(new Promise((listo, mal) => {
    lienzo.toBlob(async (blob) => {
      if (!blob) { mal(new Error("no se pudo achicar")); return; }
      listo({ bytes: new Uint8Array(await blob.arrayBuffer()), ...medida });
    }, "image/jpeg", calidad);
  }), PACIENCIA);
}

/* Las dos medidas de una misma foto, decodificando una sola vez. */
export async function achicarEnDos(archivo) {
  const bitmap = await comoImagen(archivo);
  try {
    return {
      papel: await dibujar(bitmap, PARA_EL_PAPEL),
      drive: await dibujar(bitmap, PARA_EL_DRIVE),
    };
  } finally {
    if (bitmap.close) bitmap.close();
  }
}

/* Una sola medida, para cuando hace falta suelta. */
export async function achicar(archivo, medidas) {
  const bitmap = await comoImagen(archivo);
  try {
    return await dibujar(bitmap, medidas);
  } finally {
    if (bitmap.close) bitmap.close();
  }
}

/* Agarra lo que eligio de la galeria y lo deja guardado, en las dos medidas.

   `avisar(hechas, total)` se llama en cada una: con veinte fotos de celular esto tarda, y una
   pantalla quieta parece colgada. */
export async function sumarFotos(inventario, ambiente, archivos, avisar = () => {}) {
  /* SE SIGUE DESDE EL NUMERO MAS ALTO, no desde la cantidad.

     Con la cantidad pasaba esto: si tenias las fotos 1, 2 y 3 y borrabas la 2, la proxima se
     numeraba 3 —porque quedaban dos— y PISABA a la que ya era la 3. Una foto de una pared
     desaparecia sin que nada avisara, en un documento que se usa para discutir un deposito.

     El numero mas alto no se repite nunca, aunque se borre del medio. */
  const yaHay = await fotosDe(inventario, ambiente);
  let orden = yaHay.reduce((mayor, f) => Math.max(mayor, Number(f.orden) || 0), 0);
  const nuevas = [];

  for (const [i, archivo] of [...archivos].entries()) {
    if (!archivo || !String(archivo.type || "").startsWith("image/")) continue;
    try {
      const { papel, drive } = await achicarEnDos(archivo);
      orden += 1;
      const foto = {
        id: `${inventario}|${ambiente}|${orden}|${archivo.name || "foto"}`,
        inventario,
        ambiente,
        orden,
        papel,
        drive,
        /* Para saber despues si ya se subio, sin tener que preguntarle al Drive. */
        subida: null,
      };
      await guardarFoto(foto);
      nuevas.push(foto);
    } catch {
      /* Una foto rota no puede llevarse puestas a las otras diecinueve. */
    }
    avisar(i + 1, archivos.length);
  }
  return nuevas;
}

/* Cuanto ocupan, para poder decirlo en pantalla antes de que el telefono se quede sin lugar. */
export const cuantoPesan = (fotos) => (fotos || []).reduce((t, f) => {
  /* Una foto a medio guardar —el telefono se apago en el medio— no puede tumbar la cuenta y
     con ella la tarjeta entera del ambiente. */
  const cual = f || {};
  return t + ((cual.papel || {}).bytes || []).length + ((cual.drive || {}).bytes || []).length;
}, 0);

export const enMegas = (bytes) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
