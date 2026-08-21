/* A QUIEN LE REFERISTE LA PROPIEDAD.

   Antes era un campo de texto libre: se escribia "pepito" y ahi moria. Con un nombre suelto
   la app no puede hacer nada mas — no sabe quien es, ni donde trabaja, ni como ir a mirar si
   ese colega publico la propiedad.

   Ahora se elige en dos pasos —primero la OFICINA, despues el AGENTE— y lo que queda anotado
   es el ID del colega. Ese ID es la llave: con el se le puede pedir su cartera a la misma API
   publica de RE/MAX que ya usamos para la de Juan, y de ahi sale todo lo demas.

   Juan: "cuando alguien refiere algo los agentes que recibieron mi referido no me informan de
   como viene la cosa y este sistema me garantiza enterarme".

   DOS OPCIONES QUE NO SON OFICINAS DEL PAIS:

     TEAM      — la gente de tu propio equipo.
     EXTERIOR  — una oficina de otro pais, que no esta en la guia uruguaya. Ahi el nombre se
                 escribe a mano y se pega el LINK de la cartera de ese agente, que es lo unico
                 que despues permite ir a mirarla.

   La guia (datos/agentes_remax.json) la baja el robot todos los dias. Este archivo solo la
   ordena para poder elegir. */

export const TEAM = "team";
export const EXTERIOR = "exterior";

/* Se muestran al final, despues de las oficinas de verdad: son casos aparte, no una oficina
   mas de la lista. */
export const APARTE = [
  [TEAM, "Mi Team"],
  [EXTERIOR, "Oficina del exterior"],
];

const vacio = { oficinas: [], agentes: [] };

/* Las oficinas para el primer desplegable, con las dos opciones aparte al final. */
export function oficinasParaElegir(guia) {
  const g = guia && Array.isArray(guia.oficinas) ? guia : vacio;
  return [
    ["", "sin cargar"],
    ...g.oficinas.map((o) => [o.id, o.nombre]),
    ...APARTE,
  ];
}

/* Los agentes de esa oficina, para el segundo.

   EL TEAM SON LOS DE TU PROPIA OFICINA. No hay ningun "equipo" en la API de RE/MAX —todos
   figuran como agentes sueltos— asi que lo mas cerca que se puede estar sin inventar datos es
   ofrecer los de tu oficina. Si algun dia hace falta acotarlo a los cinco del equipo, se
   acota; mientras tanto es una lista de la que se puede elegir, que es lo que hace falta. */
export function agentesDe(guia, oficinaId, miOficinaId) {
  const g = guia && Array.isArray(guia.agentes) ? guia : vacio;
  const cual = oficinaId === TEAM ? miOficinaId : oficinaId;
  if (!cual || oficinaId === EXTERIOR) return [];
  return g.agentes.filter((a) => a.oficina_id === cual);
}

export function agentesParaElegir(guia, oficinaId, miOficinaId) {
  return [
    ["", "sin cargar"],
    ...agentesDe(guia, oficinaId, miOficinaId).map((a) => [a.id, a.nombre]),
  ];
}

const nombreDe = (lista, id) => (lista.find((x) => x.id === id) || {}).nombre || null;

export const nombreDeOficina = (guia, id) => {
  const aparte = APARTE.find(([clave]) => clave === id);
  if (aparte) return aparte[1];
  return nombreDe((guia || vacio).oficinas || [], id);
};

export const nombreDeAgente = (guia, id) => nombreDe((guia || vacio).agentes || [], id);

/* En que oficina trabaja Juan. Sale de la guia buscandolo por nombre: no hace falta cargarlo
   a mano en Ajustes ni que quede pegado en el codigo, y si algun dia cambia de oficina la app
   se entera sola el dia que el robot baje la guia. */
export function miOficina(guia, ajustes) {
  const yo = ((ajustes || {}).agente || {}).nombre;
  if (!yo) return null;
  const buscado = yo.trim().toLowerCase();
  const encontrado = ((guia || vacio).agentes || [])
    .find((a) => (a.nombre || "").trim().toLowerCase() === buscado);
  return encontrado ? encontrado.oficina_id : null;
}

/* Como se llama el colega, para mostrarlo en una lista sin abrir la ficha. Puede venir de la
   guia (lo elegiste) o escrito a mano (una oficina del exterior). */
export function comoSeLlamaElColega(negocio, guia) {
  const n = negocio || {};
  return nombreDeAgente(guia, n.referido_a_agente) || n.referido_a_nombre || null;
}
