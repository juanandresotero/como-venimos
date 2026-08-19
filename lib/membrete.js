/* Las dos imagenes de la hoja membretada de RE/MAX Unico.

   Salen del mismo Word que usa la oficina, incrustadas tal cual en el PDF: son JPEG y el
   PDF sabe leer JPEG de fabrica, asi que no hay que recomprimir nada.

   Se piden una sola vez y quedan en memoria. Si el telefono esta sin señal y no las tiene
   en cache, la carta sale igual — sin membrete, pero sale. Un documento no puede depender
   de que haya internet. */

const ARCHIVOS = {
  arriba: "imagenes/membrete-arriba.jpg",
  abajo: "imagenes/membrete-abajo.jpg",
};

let guardado = null;

export async function cargarMembrete(base = "") {
  if (guardado) return guardado;
  try {
    const partes = await Promise.all(Object.values(ARCHIVOS).map(async (ruta) => {
      const respuesta = await fetch(new URL(ruta, base || window.location.href));
      if (!respuesta.ok) throw new Error(ruta);
      return new Uint8Array(await respuesta.arrayBuffer());
    }));
    guardado = { arriba: partes[0], abajo: partes[1] };
  } catch {
    guardado = null;
  }
  return guardado;
}
