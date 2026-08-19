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
export const VISOR_CATASTRO = "https://visor.catastro.gub.uy/visordnc/";

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

/* La pagina oficial de la Intendencia con los datos territoriales de ese padron. No se
   baja el PDF desde aca: ese pedido necesita una sesion del sitio. Se manda el enlace, que
   siempre funciona y lo abre el que lo recibe. */
export const infoCatastral = (padron) =>
  "https://intgis.montevideo.gub.uy/sit/aplicaciones/montevimap/formularios/padrones.php"
  + `?padron=${encodeURIComponent(padron)}&servidor=intgis.montevideo.gub.uy&language=es`;
