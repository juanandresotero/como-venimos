/* Averiguar el padron desde la direccion. SOLO MONTEVIDEO.

   La Intendencia publica "Direcciones oficiales de Montevideo": 377.583 puntos con calle,
   numero de puerta y padron. No hay ningun servicio al que preguntarle de a uno, asi que
   el robot se baja la tabla entera y arma el indice (robot/padrones.py). Aca solo se
   consulta.

   Los otros departamentos no publican nada equivalente. Cuando la direccion es de otro
   lado esto lo dice y ofrece el visor oficial — no adivina. Un padron equivocado
   identifica OTRA propiedad en un documento que obliga.

   Da el padron del EDIFICIO, no del apartamento: la tabla no tiene esa columna. En
   propiedad horizontal la carta se escribe "padron NNNN, unidad 202", asi que alcanza. */

const GRUPOS = 48;
export const DEPARTAMENTO_CUBIERTO = "Montevideo";
/* En http a proposito: el visor NO responde por https. Ver la nota de papelesDeCatastro. */
export const VISOR_CATASTRO = "http://visor.catastro.gub.uy/visordnc/";

/* Para comparar: "MAROÑAS" y "MARONAS" tienen que encontrarse igual. */
export const sinTildes = (texto) =>
  String(texto).toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export const normalizar = (calle) =>
  sinTildes(calle).replace(/\./g, " ").replace(/\s+/g, " ").trim();

/* La MISMA cuenta que robot/padrones.py. Si las dos no dan el mismo numero, la app busca
   en el archivo equivocado y no encuentra nada — por eso hay un test que la fija. */
export function grupoDe(calle) {
  let h = 0;
  for (const letra of normalizar(calle)) h = (h * 31 + letra.codePointAt(0)) % 1000003;
  return String(h % GRUPOS).padStart(2, "0");
}

/* Los archivos se piden una vez y quedan. Son 29 KB comprimidos cada uno. */
const enMemoria = new Map();

/* Por defecto se pide por la red. `leer` existe para poder probarlo sin servidor: los
   tests le pasan una funcion que abre el archivo del disco. */
async function porLaRed(grupo, base) {
  const respuesta = await fetch(new URL(`datos/padrones/${grupo}.json`, base));
  if (!respuesta.ok) throw new Error(grupo);
  return respuesta.json();
}

async function traerGrupo(calle, base, leer) {
  const grupo = grupoDe(calle);
  if (enMemoria.has(grupo)) return enMemoria.get(grupo);
  try {
    const datos = leer ? await leer(grupo) : await porLaRed(grupo, base);
    if (!datos) return null;
    if (!leer) enMemoria.set(grupo, datos);
    return datos;
  } catch {
    return null;
  }
}

/* "1881:82447;1885:82448" -> Map con los numeros de puerta y su padron. */
function comoMapa(compacto) {
  const puertas = new Map();
  for (const par of String(compacto).split(";")) {
    const corte = par.indexOf(":");
    if (corte > 0) puertas.set(Number(par.slice(0, corte)), par.slice(corte + 1));
  }
  return puertas;
}

/* Los numeros de puerta mas cercanos que SI existen. Sirve para no dejarlo en la nada:
   RE/MAX publica muchas direcciones redondeadas a la cuadra ("Eusebio Vidal 3100") y ese
   numero no existe como puerta. */
function cercanos(puertas, numero, cuantos = 4) {
  return [...puertas.keys()]
    .sort((a, b) => Math.abs(a - numero) - Math.abs(b - numero) || a - b)
    .slice(0, cuantos)
    .sort((a, b) => a - b)
    .map((n) => ({ numero: n, padron: puertas.get(n) }));
}

/* Devuelve siempre un objeto con `estado`, para que la pantalla no tenga que adivinar:
     "fuera-de-montevideo" | "sin-datos" | "calle-desconocida" | "sin-numero" | "encontrado" */
export async function buscar({ calle, numero, departamento }, { base = "", leer = null } = {}) {
  const donde = base || (typeof window !== "undefined" ? window.location.href : "");

  if (departamento && normalizar(departamento) !== normalizar(DEPARTAMENTO_CUBIERTO)) {
    return { estado: "fuera-de-montevideo", departamento };
  }
  if (!String(calle || "").trim()) return { estado: "calle-desconocida", calle };

  const grupo = await traerGrupo(calle, donde, leer);
  if (!grupo) return { estado: "sin-datos" };

  const compacto = grupo[normalizar(calle)];
  if (!compacto) return { estado: "calle-desconocida", calle };

  const puertas = comoMapa(compacto);
  const puerta = Number(String(numero).replace(/\D/g, ""));
  if (!puerta) return { estado: "sin-numero", calle, puertas: puertas.size };

  const padron = puertas.get(puerta);
  if (padron) return { estado: "encontrado", padron, calle, numero: puerta };

  return { estado: "sin-numero-exacto", calle, numero: puerta, cercanos: cercanos(puertas, puerta) };
}

/* El nombre de calle mas parecido a lo que se escribio, para sugerir mientras tipea. */
export function sugerir(calles, escrito, cuantas = 6) {
  const busca = normalizar(escrito);
  if (busca.length < 2) return [];
  const empiezan = [];
  const contienen = [];
  for (const calle of calles) {
    const plana = normalizar(calle);
    if (plana.startsWith(busca)) empiezan.push(calle);
    else if (plana.includes(busca)) contienen.push(calle);
    if (empiezan.length >= cuantas) break;
  }
  return [...empiezan, ...contienen].slice(0, cuantas);
}

/* Los papeles oficiales de Catastro para un padron.

   Salen del visor geoCatastro. No hay documentacion: las direcciones se sacaron leyendo el
   javascript del propio visor (`CedulaCatastral.js`) y estan PROBADAS contra el servidor,
   una por una. Montevideo es el departamento "V" y la localidad catastral "AA"; como esta
   herramienta solo cubre Montevideo, van fijos.

   TRES COSAS QUE COSTARON Y NO HAY QUE VOLVER A PERDER:

   1. Va por **https en el puerto 8443**. El mismo servlet existe en http:8080 y devuelve
      lo mismo, pero la app se sirve por https y el navegador no abre un http en un puerto
      raro sin plantar antes una pantalla de peligro. Para el usuario eso es "no anda".

   2. El **visor no tiene https**: `https://visor.catastro.gub.uy` no contesta nada, ni
      redirige. Va en http o no va.

   3. La **"unidad" de Catastro NO es el numero de apartamento.** Probado contra el padron
      82447: la unidad 1 devuelve la cedula y la 202 devuelve un archivo vacio. Catastro
      numera las unidades a su manera. Por eso la unidad se PREGUNTA y no se adivina —
      inventarla devuelve el papel de otra unidad, sin decir nada.

   El croquis de manzana y el listado de planos **no se pueden armar desde aca**, y esta
   medido, no supuesto: el croquis se pide por SOAP (`wsVisor.asmx`, un solo metodo, sin
   variante GET) y necesita el numero de manzana; la manzana sale de un servicio de mapas
   que existe solo en http, y desde una pagina https el navegador bloquea esa consulta
   siempre. Para esos dos se manda al visor, que los tiene a un clic. */
const SERVLET = "https://apls2.catastro.gub.uy:8443/integralevol3produccion/servlet/"
  + "gub.catastro.integralevol3produccion";

const TERRITORIAL = "https://intgis.montevideo.gub.uy/sit/aplicaciones/montevimap/"
  + "formularios/padrones.php";

/* Catastro separa los pedazos de la direccion CON COMAS. Si el usuario escribe una coma
   en la unidad —"202,X"— la direccion queda con ocho pedazos en vez de siete y Catastro
   devuelve otro documento o un error. Se deja pasar solo letras y numeros. */
const soloLetrasYNumeros = (texto) =>
  String(texto || "").normalize("NFD").replace(/[^0-9A-Za-z]/g, "");

export function papelesDeCatastro(padron, { apartamento = "", bloque = "", unidad = "" } = {}) {
  const bloq = soloLetrasYNumeros(bloque);
  const uni = soloLetrasYNumeros(unidad);
  const esApartamento = Boolean(soloLetrasYNumeros(apartamento) || bloq || uni);
  const papeles = [];

  if (esApartamento) {
    /* Los datos de la parcela salen SIN saber la unidad, y adentro vienen listadas todas
       las unidades con su destino y sus metros. Por eso van primero: son el papel que
       responde cual es la unidad que hace falta para pedir la cedula. */
    papeles.push({
      clave: "parcela", nombre: "Datos completos de la parcela", pdf: true,
      url: `${SERVLET}.arwebphmvdeopublico?V,AA,${padron},${bloq},,${uni},N`,
    });
    if (uni) {
      papeles.push({
        clave: "cedula", nombre: `Cédula catastral (unidad ${uni})`, pdf: true,
        url: `${SERVLET}.apwebimpresioncedulasgeocatastro?H,V,AA,${padron},${bloq},,${uni}`,
      });
    }
  } else {
    papeles.push({
      clave: "cedula", nombre: "Cédula catastral", pdf: true,
      url: `${SERVLET}.apwebimpresioncedulasgeocatastro?C,V,AA,${padron},,,`,
    });
    papeles.push({
      clave: "parcela", nombre: "Datos completos de la parcela", pdf: true,
      url: `${SERVLET}.arwebmvdeocomunpublico?${padron},N`,
    });
  }

  papeles.push({
    clave: "territorial", nombre: "Datos territoriales de la Intendencia", pdf: false,
    url: `${TERRITORIAL}?padron=${encodeURIComponent(padron)}`
      + "&servidor=intgis.montevideo.gub.uy&language=es",
  });
  papeles.push({
    clave: "visor", nombre: "Croquis de manzana y planos (en el visor)", pdf: false,
    url: VISOR_CATASTRO,
  });
  return papeles;
}

/* El papel mas util que se puede armar para ese padron: la cedula si se puede pedir, y
   si no los datos de la parcela, que salen siempre. */
export const infoCatastral = (padron, opciones) => {
  const papeles = papelesDeCatastro(padron, opciones);
  return (papeles.find((p) => p.clave === "cedula") || papeles[0]).url;
};
