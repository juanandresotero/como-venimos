/* Aplica los cambios del usuario en memoria al instante y lleva la cuenta de que archivos
   quedaron sucios, para subirlos despues.

   La edicion se ve al toque aunque no haya señal: primero se aplica local, despues se
   sincroniza. Asi la app nunca se queda esperando a la red. */

import { revisar, plantillaNegocio, estaCaido, CAIDO } from "./motor.js";
import { CAMPOS_DEL_USUARIO } from "./cartera.js";

export const ARCHIVO_NEGOCIOS = "datos/negocios.json";
export const ARCHIVO_MIS_DATOS = "datos/mis_datos.json";
export const ARCHIVO_AJUSTES = "datos/ajustes.json";
export const ARCHIVO_CALCULOS = "datos/calculos_renta.json";

const NOMBRES = {
  [ARCHIVO_NEGOCIOS]: "negocios",
  [ARCHIVO_MIS_DATOS]: "tus anotaciones",
  [ARCHIVO_AJUSTES]: "ajustes",
  [ARCHIVO_CALCULOS]: "cálculos de renta",
};

/* Dos datos son de la PROPIEDAD aunque se carguen desde el negocio: cuándo se empezó a
   publicar y de dónde salió. Son la misma pregunta hecha desde dos pantallas.

   Sin esto pasaba lo obvio: se cargaban desde el negocio y la ficha de la propiedad los
   seguía mostrando en rojo, como si faltaran. */
const COMPARTIDOS = {
  fecha_inicio: "fecha_captacion_real",
  origen_captacion: "origen_captacion",
};

function volcarNegocioEnPropiedad(estado, negocio, cambios) {
  if (!negocio.entity_id_cartera) return;
  const propiedad = (estado.datos.cartera || {})[negocio.entity_id_cartera] || {};
  const paraLaPropiedad = {};

  for (const [enElNegocio, enLaPropiedad] of Object.entries(COMPARTIDOS)) {
    if (!(enElNegocio in cambios)) continue;
    const valor = negocio[enElNegocio];
    if (!valor) continue;

    /* La fecha de captacion de la propiedad es UNA: la del principio. Un alquiler que
       rota genera tres negocios, cada uno con su fecha de inicio, y el tercero es de
       meses despues. Si se volcara tal cual, cargar ese tercero pisaria la captacion con
       una fecha equivocada.

       Solo se vuelca si adelanta la fecha, o si la que hay todavia es la estimacion que
       puso el robot el dia que empezo a mirar. */
    if (enLaPropiedad === "fecha_captacion_real") {
      const laQueHay = propiedad.fecha_captacion_real;
      const esEstimada = propiedad.fecha_captacion_estimada !== false;
      if (laQueHay && !esEstimada && valor >= laQueHay) continue;
      paraLaPropiedad.fecha_captacion_estimada = false;
    }
    paraLaPropiedad[enLaPropiedad] = valor;
  }

  if (Object.keys(paraLaPropiedad).length) {
    editarPropiedad(estado, negocio.entity_id_cartera, paraLaPropiedad);
  }
}

/* QUE PASO AL FINAL, contestado en la propiedad, cierra su negocio abierto. Es la misma
   pregunta que hace el negocio —¿se vendio o se cayo?— vista desde la otra pantalla, y
   contestada en un lado tiene que quedar contestada en los dos. Juan dijo en la propiedad
   que se vendio y el negocio le siguio preguntando (San Fructuoso, 2026-09-11).

   Vendida o alquilada: firmada el dia que se fue del portal, que es la regla de siempre.
   Caida o retirada por el dueño: el negocio se cae, y como lo dijo el, el portal deja de
   mandar. */
const LO_QUE_LE_PASA_AL_NEGOCIO = {
  vendida: (propiedad, hoy) => ({
    fecha_fin: propiedad.fecha_desaparicion || hoy, fecha_fin_estimada: false,
  }),
  alquilada: (propiedad, hoy) => ({
    fecha_fin: propiedad.fecha_desaparicion || hoy, fecha_fin_estimada: false,
  }),
  caida: () => ({ estado: CAIDO, estado_a_mano: true, se_cayo_solo: false }),
  retirada: () => ({ estado: CAIDO, estado_a_mano: true, se_cayo_solo: false }),
};

function volcarPropiedadEnNegocios(estado, entityId, cambios) {
  const alReves = { fecha_captacion_real: "fecha_inicio", origen_captacion: "origen_captacion" };
  const paraElNegocio = {};
  for (const [enLaPropiedad, enElNegocio] of Object.entries(alReves)) {
    if (enLaPropiedad in cambios && cambios[enLaPropiedad]) {
      paraElNegocio[enElNegocio] = cambios[enLaPropiedad];
    }
  }
  const desenlace = LO_QUE_LE_PASA_AL_NEGOCIO[cambios.desenlace_confirmado];
  if (!Object.keys(paraElNegocio).length && !desenlace) return;
  const propiedad = (estado.datos.cartera || {})[entityId] || {};

  for (const [indice, n] of (estado.datos.negocios || []).entries()) {
    if (n.entity_id_cartera !== entityId) continue;
    /* SOLO AL ABIERTO. Una propiedad que se alquila todos los años tiene los negocios de las
       vueltas anteriores cerrados y cobrados, y esos no se tocan. */
    const abierto = n.estado !== "cerrado" && !estaCaido(n);
    const todo = { ...paraElNegocio, ...(desenlace && abierto ? desenlace(propiedad, estado.hoy) : {}) };
    if (!Object.keys(todo).length) continue;
    estado.datos.negocios[indice] = revisar(
      { ...n, ...todo }, estado.datos.ajustes, estado.hoy, estado.datos.cartera
    );
    estado.sucios.add(ARCHIVO_NEGOCIOS);
  }
}

export function editarNegocio(estado, id, cambios) {
  const indice = estado.datos.negocios.findIndex((n) => n.id === id);
  if (indice === -1) return null;

  const actualizado = revisar(
    { ...estado.datos.negocios[indice], ...cambios },
    estado.datos.ajustes,
    estado.hoy,
    estado.datos.cartera
  );
  estado.datos.negocios[indice] = actualizado;
  estado.sucios.add(ARCHIVO_NEGOCIOS);
  volcarNegocioEnPropiedad(estado, actualizado, cambios);
  return actualizado;
}

/* Los ids de los importados son "excel-N". Los de alta manual van aparte para que se
   pueda reimportar el Excel sin pisar lo cargado a mano. */
export function nuevoId(negocios) {
  const usados = new Set((negocios || []).map((n) => n.id));
  let numero = 1;
  while (usados.has(`manual-${numero}`)) numero += 1;
  return `manual-${numero}`;
}

export function crearNegocio(estado, atajo, extra = {}) {
  const negocio = revisar(
    {
      id: nuevoId(estado.datos.negocios),
      ...plantillaNegocio(atajo, estado.datos.ajustes, estado.hoy),
      ...extra,
    },
    estado.datos.ajustes,
    estado.hoy,
    estado.datos.cartera
  );
  estado.datos.negocios.push(negocio);
  estado.sucios.add(ARCHIVO_NEGOCIOS);
  return negocio;
}

export function borrarNegocio(estado, id) {
  const indice = estado.datos.negocios.findIndex((n) => n.id === id);
  if (indice === -1) return false;
  const negocio = estado.datos.negocios[indice];
  estado.datos.negocios.splice(indice, 1);
  estado.sucios.add(ARCHIVO_NEGOCIOS);

  /* BORRAR UN NEGOCIO QUE NACIO SOLO SE ANOTA EN LA PROPIEDAD. Si no, la app se lo vuelve a
     estrenar al abrirla manana: borrarlo no serviria de nada y el usuario terminaria
     borrando lo mismo todos los dias. Se anota en la propiedad y no en el negocio porque el
     negocio deja de existir. */
  if (negocio && negocio.nacio_solo && negocio.entity_id_cartera) {
    editarPropiedad(estado, negocio.entity_id_cartera, { sin_negocio: true });
  }
  return true;
}

const misDatos = (estado) => estado.datos.mis_datos || (estado.datos.mis_datos = {});

/* Lo que el usuario edita de una propiedad NO se escribe en cartera.json: ese archivo es
   del robot. Se anota aparte y se aplica encima (§3.3). Ademas se refleja al toque en la
   cartera que tiene la app en memoria, para que el cambio se vea sin esperar al robot. */
export function editarPropiedad(estado, entityId, cambios) {
  const mis = misDatos(estado);
  const overlay = mis.cartera || (mis.cartera = {});
  const anotado = overlay[entityId] || (overlay[entityId] = {});

  for (const [campo, valor] of Object.entries(cambios)) {
    if (!CAMPOS_DEL_USUARIO.includes(campo)) {
      throw new Error(`Ese campo lo escribe el robot, no la app: ${campo}`);
    }
    anotado[campo] = valor;
  }

  const propiedad = (estado.datos.cartera || {})[entityId];
  if (propiedad) Object.assign(propiedad, cambios);
  estado.sucios.add(ARCHIVO_MIS_DATOS);
  // El otro sentido: cargarlo en la propiedad tambien lo baja a sus negocios.
  volcarPropiedadEnNegocios(estado, entityId, cambios);

  /* Y LA NOTICIA DE QUE SE FUE QUEDA CONTESTADA. "Desaparecio de RE/MAX, ¿se cayo o se
     vendio?" es justo lo que se acaba de decir. Sin esto habia que tocar "Ya lo resolvi"
     aparte: Juan lo hizo el 2026-09-11, dos veces por la misma cosa. */
  if (cambios.desenlace_confirmado) {
    for (const evento of estado.datos.eventos || []) {
      if (evento.tipo === "baja" && evento.entity_id === entityId) {
        marcarAtendido(estado, evento.id);
      }
    }
  }
  return propiedad || null;
}

export function editarAjustes(estado, cambios) {
  Object.assign(estado.datos.ajustes, cambios);
  estado.sucios.add(ARCHIVO_AJUSTES);
  return estado.datos.ajustes;
}

export function guardarCalculo(estado, calculo) {
  const lista = estado.datos.calculos_renta || (estado.datos.calculos_renta = []);
  lista.unshift(calculo);
  estado.sucios.add(ARCHIVO_CALCULOS);
  return calculo;
}

export function borrarCalculo(estado, indice) {
  const lista = estado.datos.calculos_renta || [];
  if (indice < 0 || indice >= lista.length) return false;
  lista.splice(indice, 1);
  estado.sucios.add(ARCHIVO_CALCULOS);
  return true;
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
  [ARCHIVO_AJUSTES]: (estado) => estado.datos.ajustes,
  [ARCHIVO_CALCULOS]: (estado) => estado.datos.calculos_renta || [],
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
