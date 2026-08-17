/* Encontrar a qué propiedad de la cartera corresponde un negocio.

   Hace falta porque las direcciones se escriben distinto en cada lado: el Excel dice
   "juana de ibarburu" y RE/MAX dice "Juana de Ibarbourou 200". Sin el vínculo, la app no
   sabe que ese negocio ya está en la cartera y le sigue pidiendo la fecha de firma de una
   propiedad que está en negociación.

   No decide sola: propone, y el usuario confirma de un toque. Igual que el robot con los
   desenlaces. */

/* Saca acentos, mayúsculas y puntuación para poder comparar dos formas de escribir lo
   mismo. "Flammarión" y "flamarrion" tienen que quedar comparables. */
export function normalizar(texto) {
  return String(texto ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const RUIDO = new Set([
  "apto", "apartamento", "casa", "local", "unidad", "piso", "esq", "esquina", "y", "de",
  "del", "la", "el", "los", "las", "bis",
]);

/* Parte una dirección en el nombre de la calle y su número. El número de puerta es la
   señal más fuerte que hay: dos calles con el mismo nombre y distinto número no son la
   misma propiedad. */
export function partirDireccion(texto) {
  const limpio = normalizar(texto);
  const numeros = limpio.match(/\b\d{2,6}\b/g) || [];
  const palabras = limpio
    .split(" ")
    .filter((p) => p && !/^\d+$/.test(p) && !RUIDO.has(p));
  return { calle: palabras.join(" "), numeros };
}

/* Parecido entre dos textos por pares de letras (coeficiente de Dice).

   Se eligió esto y no una comparación letra a letra porque aguanta bien los errores de
   tipeo del Excel: "ibarburu" contra "ibarbourou" sigue dando alto. */
export function parecido(a, b) {
  const paresDe = (texto) => {
    const limpio = texto.replace(/\s/g, "");
    const pares = new Map();
    for (let i = 0; i < limpio.length - 1; i += 1) {
      const par = limpio.slice(i, i + 2);
      pares.set(par, (pares.get(par) || 0) + 1);
    }
    return pares;
  };
  if (!a || !b) return 0;
  if (a === b) return 1;
  const unos = paresDe(a);
  const otros = paresDe(b);
  let comunes = 0;
  let totalUnos = 0;
  let totalOtros = 0;
  for (const n of unos.values()) totalUnos += n;
  for (const n of otros.values()) totalOtros += n;
  for (const [par, n] of unos) comunes += Math.min(n, otros.get(par) || 0);
  return totalUnos + totalOtros ? (2 * comunes) / (totalUnos + totalOtros) : 0;
}

/* Cuánto se parecen la dirección de un negocio y la de una propiedad, de 0 a 1.

   El número de puerta manda: si los dos lo tienen y no coincide, no son la misma por más
   que la calle sea idéntica. Si uno no lo tiene, se juzga solo por el nombre de la calle,
   que es justo el caso del Excel, donde muchas filas se cargaron sin número. */
export function puntaje(direccionNegocio, direccionPropiedad) {
  const uno = partirDireccion(direccionNegocio);
  const otro = partirDireccion(direccionPropiedad);
  if (!uno.calle || !otro.calle) return 0;

  const calles = parecido(uno.calle, otro.calle);
  if (!uno.numeros.length || !otro.numeros.length) return calles * 0.85;

  const coincide = uno.numeros.some((n) => otro.numeros.includes(n));
  if (coincide) return Math.min(1, calles + 0.15);

  // Números de puerta cercanos suelen ser la misma cuadra, pero no la misma casa.
  const cerca = uno.numeros.some((n) =>
    otro.numeros.some((m) => Math.abs(Number(n) - Number(m)) <= 60)
  );
  return cerca ? calles * 0.7 : calles * 0.35;
}

export const UMBRAL_SUGERENCIA = 0.62;

/* Las propiedades de la cartera que podrían ser este negocio, de la más probable a la
   menos. Solo devuelve las que pasan el umbral: es mejor no sugerir nada que sugerir
   cualquier cosa. */
export function sugerencias(negocio, cartera, { umbral = UMBRAL_SUGERENCIA } = {}) {
  // Ya esta enganchada, o el usuario ya dijo que no es ninguna: no se vuelve a preguntar.
  if (negocio.entity_id_cartera || negocio.sin_propiedad_en_cartera) return [];
  return Object.values(cartera || {})
    .map((propiedad) => ({
      propiedad,
      puntaje: puntaje(negocio.direccion, propiedad.direccion || propiedad.titulo),
    }))
    .filter((x) => x.puntaje >= umbral)
    .sort((a, b) => b.puntaje - a.puntaje);
}
