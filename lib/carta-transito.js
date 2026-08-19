/* En qué momento de su vida está una carta oferta.

   Una carta pasa por tres momentos, y no hay más:

     borrador  — se está llenando. Nunca salió del teléfono.
     tránsito  — se mandó a una parte o a las dos, y se espera que vuelvan firmadas.
     completa  — volvieron las dos y ya se les mandó la versión final a las partes.

   Esto existe porque Juan lleva VARIAS cartas oferta a la vez y se le mezclaban: volvía
   una firma y se juntaba con la carta que tuviera abierta, no con la que correspondía.
   Ahora cada carta tiene un número propio que viaja adentro del enlace, y cuando una
   vuelta entra se busca por ese número.

   Acá adentro no hay nada de pantalla ni de guardado: son las reglas, y nada más. */

const TURNOS = ["comprador", "propietario"];

/* Un número corto para la carta. No identifica a nadie y no tiene que ser secreto: sólo
   tiene que ser distinto de las otras cartas que Juan tenga abiertas al mismo tiempo. */
export function nuevoId(azar = Math.random) {
  let texto = "";
  while (texto.length < 6) texto += Math.floor(azar() * 36 ** 6).toString(36);
  return texto.slice(0, 6);
}

const mapa = (x) => (x && typeof x === "object" && !Array.isArray(x) ? x : {});

export const mandadas = (carta) => mapa((carta || {}).mandadas);
export const vueltas = (carta) => mapa((carta || {}).vueltas);

/* A quién se le mandó y todavía no contestó.

   Se mira si la parte ESTÁ ANOTADA, no si tiene fecha: la vuelta se anota desde la página
   del cliente, que a veces no tiene la fecha a mano y guarda `null`. Mirando el valor, una
   parte que ya había contestado seguía figurando como que faltaba. */
export const faltanVolver = (carta) =>
  Object.keys(mandadas(carta)).filter((t) => !(t in vueltas(carta)));

export function estadoDeCarta(carta) {
  if ((carta || {}).entregada) return "completa";
  return Object.keys(mandadas(carta)).length ? "transito" : "borrador";
}

/* Lo que hay que hacer ahora con esta carta, dicho para que se lea de un vistazo. */
export function comoVaLaCarta(carta) {
  if (estadoDeCarta(carta) === "completa") return "Enviada a las partes";
  const faltan = faltanVolver(carta);
  if (!Object.keys(mandadas(carta)).length) return "Sin mandar";
  if (!faltan.length) return "Pronta para enviar a las partes";
  const nombre = { comprador: "al comprador", propietario: "al propietario" };
  return `Esperando ${faltan.map((t) => nombre[t] || t).join(" y ")}`;
}

export const estaPronta = (carta) =>
  estadoDeCarta(carta) === "transito" && faltanVolver(carta).length === 0;

/* Los tres movimientos. Devuelven una carta nueva y no tocan la que reciben: así la
   pantalla decide cuándo guardar y no hay estados a medio cambiar. */
export function anotarMandada(carta, turno, cuando) {
  if (!TURNOS.includes(turno)) return carta;
  return {
    ...carta,
    id: carta.id || nuevoId(),
    mandadas: { ...mandadas(carta), [turno]: cuando || null },
    /* Si se la vuelve a mandar a la misma parte es porque lo anterior no sirvió: se borra
       la vuelta vieja para no darla por contestada. */
    vueltas: Object.fromEntries(Object.entries(vueltas(carta)).filter(([t]) => t !== turno)),
  };
}

export function anotarVuelta(carta, turno, cuando) {
  if (!TURNOS.includes(turno)) return carta;
  return { ...carta, vueltas: { ...vueltas(carta), [turno]: cuando || null } };
}

export const anotarEntregada = (carta, cuando) => ({ ...carta, entregada: cuando || null });

/* El orden del historial. Las completadas van AL FINAL: ya no se usan, quedan de registro
   nomas, y arriba tienen que estar las que todavia se pueden retomar.

   El orden entre las de un mismo grupo no se toca —viene del historial, mas nueva primero—
   porque `sort` en JavaScript es estable. */
export const ordenarParaElHistorial = (cartas) =>
  [...cartas].sort((a, b) =>
    Number(estadoDeCarta(a) === "completa") - Number(estadoDeCarta(b) === "completa"));
