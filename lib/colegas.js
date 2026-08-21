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

/* EL TEAM SE EDITA EN AJUSTES, no acá.

   Vive en `ajustes.team` como una lista de SLUGS. El slug es la identidad estable de un
   agente en RE/MAX: "martin-sedes" no cambia porque alguien lo escriba "Martin" o "Martín",
   y no depende de acentos. Guardar nombres sueltos habría hecho que el team se rompiera solo
   el día que RE/MAX corrigiera una tilde.

   Está en ajustes y no en la guía porque la API de RE/MAX no tiene ningún concepto de equipo:
   los 373 agentes figuran todos sueltos. Es una decisión de Juan sobre quiénes son los suyos,
   no un dato del portal.

   La lista de abajo es sólo el arranque: los ocho que dio el primer día, para que la app
   funcione aunque todavía no se haya guardado nada en Ajustes. */
export const TEAM_DEL_ARRANQUE = [
  "estefania-larraz",
  "juan-andres-otero",
  "martin-sedes",
  "leticia-varela",
  "eugenia-fernandez",
  "veronica-d-atri",
  "geronimo-fernandez",
  "maria-rodriguez",
];
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

/* Los agentes de esa oficina, para el segundo desplegable.

   VOS NO ESTAS EN NINGUNA DE LAS DOS LISTAS: no te podés referir una propiedad a vos mismo, y
   verte ahí sólo sirve para elegirte sin querer. */
export function agentesDe(guia, oficinaId, ajustes, yo) {
  const g = guia && Array.isArray(guia.agentes) ? guia : vacio;
  if (!oficinaId || oficinaId === EXTERIOR) return [];

  const soyYo = (a) => Boolean(yo) && (a.slug === yo || a.id === yo);
  if (oficinaId === TEAM) {
    /* En el orden en que están cargados, no alfabético: es su equipo y así los nombra. */
    return slugsDelTeam(ajustes)
      .map((slug) => g.agentes.find((a) => a.slug === slug))
      .filter((a) => a && !soyYo(a));
  }
  return g.agentes.filter((a) => a.oficina_id === oficinaId && !soyYo(a));
}

export function agentesParaElegir(guia, oficinaId, ajustes, yo) {
  return [
    ["", "sin cargar"],
    ...agentesDe(guia, oficinaId, ajustes, yo).map((a) => [a.id, a.nombre]),
  ];
}

/* Quiénes son el team hoy. Sin nada guardado todavía, los ocho del arranque. Una lista VACIA
   guardada a propósito se respeta: si Juan los saca a todos, el team queda vacío — no se
   repuebla sola con gente que él acaba de borrar. */
export function slugsDelTeam(ajustes) {
  const puesto = (ajustes || {}).team;
  return Array.isArray(puesto) ? puesto : TEAM_DEL_ARRANQUE;
}

/* El team con nombre y oficina, para poder listarlo en Ajustes. Un slug que ya no está en la
   guía —se fue de RE/MAX— igual se muestra, para poder sacarlo. */
export function elTeam(guia, ajustes) {
  const agentes = (guia || vacio).agentes || [];
  return slugsDelTeam(ajustes).map((slug) => {
    const a = agentes.find((x) => x.slug === slug);
    return a
      ? { ...a, oficina: nombreDeOficina(guia, a.oficina_id) }
      : { slug, nombre: slug, oficina: "ya no está en RE/MAX" };
  });
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
function yoEnLaGuia(guia, ajustes) {
  const nombre = ((ajustes || {}).agente || {}).nombre;
  if (!nombre) return null;
  const buscado = nombre.trim().toLowerCase();
  return ((guia || vacio).agentes || [])
    .find((a) => (a.nombre || "").trim().toLowerCase() === buscado) || null;
}

export function miOficina(guia, ajustes) {
  const yo = yoEnLaGuia(guia, ajustes);
  return yo ? yo.oficina_id : null;
}

/* Tu propio id, para poder sacarte de la lista de colegas a los que referir. */
export function miId(guia, ajustes) {
  const yo = yoEnLaGuia(guia, ajustes);
  return yo ? yo.id : null;
}

/* Como se llama el colega, para mostrarlo en una lista sin abrir la ficha. Puede venir de la
   guia (lo elegiste) o escrito a mano (una oficina del exterior). */
export function comoSeLlamaElColega(negocio, guia) {
  const n = negocio || {};
  return nombreDeAgente(guia, n.referido_a_agente) || n.referido_a_nombre || null;
}
