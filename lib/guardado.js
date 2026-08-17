/* Aplica los cambios del usuario en memoria al instante y lleva la cuenta de que archivos
   quedaron sucios, para subirlos despues.

   La edicion se ve al toque aunque no haya señal: primero se aplica local, despues se
   sincroniza. Asi la app nunca se queda esperando a la red. */

import { revisar } from "./motor.js";

export const ARCHIVO_NEGOCIOS = "datos/negocios.json";
export const ARCHIVO_MIS_DATOS = "datos/mis_datos.json";

const NOMBRES = {
  [ARCHIVO_NEGOCIOS]: "negocios",
  [ARCHIVO_MIS_DATOS]: "tus anotaciones",
};

export function editarNegocio(estado, id, cambios) {
  const indice = estado.datos.negocios.findIndex((n) => n.id === id);
  if (indice === -1) return null;

  const actualizado = revisar(
    { ...estado.datos.negocios[indice], ...cambios },
    estado.datos.ajustes,
    estado.hoy
  );
  estado.datos.negocios[indice] = actualizado;
  estado.sucios.add(ARCHIVO_NEGOCIOS);
  return actualizado;
}

export function marcarAtendido(estado, eventoId) {
  const mis = estado.datos.mis_datos || (estado.datos.mis_datos = {});
  const lista = mis.eventos_atendidos || (mis.eventos_atendidos = []);
  if (lista.includes(eventoId)) return;
  lista.push(eventoId);
  estado.sucios.add(ARCHIVO_MIS_DATOS);
}

export function hayCambios(estado) {
  return estado.sucios.size > 0;
}

export function resumenCambios(estado) {
  if (!estado.sucios.size) return "";
  const nombres = [...estado.sucios].map((a) => NOMBRES[a] || a);
  return `Cambios sin subir en ${nombres.join(" y ")}`;
}

const CONTENIDO = {
  [ARCHIVO_NEGOCIOS]: (estado) => estado.datos.negocios,
  [ARCHIVO_MIS_DATOS]: (estado) => estado.datos.mis_datos,
};

const esConflicto = (error) => /conflicto/i.test(error.message);

/* Sube lo que este sucio. Si algo falla, la cola queda intacta para reintentar: es
   preferible reintentar mil veces a perder un dato que el usuario ya cargo. */
export async function sincronizar(estado, api, token) {
  if (!estado.sucios.size) return { ok: true, mensaje: "" };
  if (!token) {
    return { ok: false, mensaje: "Falta el token de GitHub. Cargalo en Ajustes." };
  }

  estado.shas = estado.shas || {};
  const fecha = new Date().toISOString().slice(0, 10);

  for (const ruta of [...estado.sucios]) {
    const datos = CONTENIDO[ruta](estado);
    const mensaje = `datos: cambios desde la app (${fecha})`;
    try {
      let resultado;
      try {
        resultado = await api.escribirArchivo(ruta, datos, estado.shas[ruta] || null, mensaje, token);
      } catch (error) {
        if (!esConflicto(error)) throw error;
        // El robot escribio mientras editabamos. Se relee el sha y se reintenta una vez.
        const fresco = await api.leerArchivo(ruta, token);
        estado.shas[ruta] = fresco.sha;
        resultado = await api.escribirArchivo(ruta, datos, fresco.sha, mensaje, token);
      }
      estado.shas[ruta] = resultado.sha;
      estado.sucios.delete(ruta);
    } catch (error) {
      return { ok: false, mensaje: error.message };
    }
  }
  return { ok: true, mensaje: "Guardado" };
}
