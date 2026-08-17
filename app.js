/* Arranque: baja los datos, arma la navegacion y dibuja la vista activa. */

import { derivar } from "./lib/pendientes.js";
import * as github from "./lib/github.js";
import { fusionar } from "./lib/cartera.js";
import { hayCambios, resumenCambios, sincronizar } from "./lib/guardado.js";
import { dibujarSalud } from "./vistas/salud.js";
import { dibujarHoy } from "./vistas/hoy.js";
import { dibujarNegocios } from "./vistas/negocios.js";
import { dibujarFicha } from "./vistas/ficha.js";
import { dibujarCartera } from "./vistas/cartera.js";
import { dibujarPropiedad } from "./vistas/propiedad.js";
import { dibujarRenta } from "./vistas/renta.js";
import { dibujarAjustes } from "./vistas/ajustes.js";

const ARCHIVOS = [
  "cartera", "negocios", "ajustes", "eventos", "estado_robot", "mis_datos", "calculos_renta",
];
const VACIO_OBJETO = new Set(["cartera", "ajustes", "estado_robot", "mis_datos"]);

const estado = {
  datos: {},
  hoy: new Date().toISOString().slice(0, 10),
  vista: "hoy",
  foco: null,          // id del negocio o de la propiedad abierta
  precargaRenta: null, // precio que viaja de una propiedad a la calculadora
  instalador: null,    // el aviso de Android para instalar la app, guardado para despues
  token: github.leerToken(),
  sucios: new Set(),
  shas: {},
  redibujar: () => dibujar(),
  // La navegacion viaja en el estado y NO se importa desde las vistas: si cada vista
  // importara app.js habria un ciclo (app.js -> vistas -> app.js).
  irA: (vista, foco) => irA(vista, foco),
};

async function bajarDatos() {
  const pares = await Promise.all(
    ARCHIVOS.map(async (nombre) => {
      try {
        const respuesta = await fetch(`datos/${nombre}.json`, { cache: "no-cache" });
        if (!respuesta.ok) throw new Error(respuesta.status);
        return [nombre, await respuesta.json()];
      } catch {
        // Si falta un archivo la app tiene que abrir igual, no quedarse en blanco.
        return [nombre, VACIO_OBJETO.has(nombre) ? {} : []];
      }
    })
  );
  return Object.fromEntries(pares);
}

function dibujarBarraEstado() {
  const barra = document.getElementById("barra-estado");
  const robot = estado.datos.estado_robot;
  if (!robot || !robot.ultima_corrida) {
    barra.hidden = true;
    return;
  }
  const dias = Math.round(
    (Date.parse(`${estado.hoy}T00:00:00Z`) - Date.parse(`${robot.ultima_corrida}T00:00:00Z`)) / 86400000
  );
  barra.hidden = false;
  if (!robot.ok || dias > 2) {
    barra.className = "barra-estado alerta";
    barra.textContent = robot.ok
      ? `⚠ El robot no corre hace ${dias} días — los datos de tu cartera están viejos`
      : `⚠ La última corrida del robot falló: ${robot.error || "error desconocido"}`;
    return;
  }
  barra.className = "barra-estado";
  const cuando = dias === 0 ? "hoy" : dias === 1 ? "ayer" : `hace ${dias} días`;
  barra.textContent = `Cartera actualizada ${cuando} · ${robot.propiedades} propiedades`;
}

/* estados: null (lo que falta subir) · "guardando" · "listo" · "error" */
function dibujarBarraGuardado(situacion, mensaje) {
  const barra = document.getElementById("barra-guardado");
  const texto = document.getElementById("texto-guardado");
  const boton = document.getElementById("boton-guardar");

  if (!situacion && !hayCambios(estado)) {
    barra.hidden = true;
    return;
  }
  barra.hidden = false;
  barra.className = `barra-guardado${situacion ? ` ${situacion}` : ""}`;
  texto.textContent = mensaje || resumenCambios(estado);
  boton.disabled = situacion === "guardando";
  boton.hidden = situacion === "listo";
  boton.textContent = situacion === "error" ? "Reintentar" : "Guardar";
}

/* Los eventos que el usuario ya despacho se filtran con lo anotado en mis_datos. */
function eventosSinAtender() {
  const atendidos = new Set((estado.datos.mis_datos || {}).eventos_atendidos || []);
  return (estado.datos.eventos || []).filter((e) => !atendidos.has(e.id));
}

function dibujarGlobo() {
  const globo = document.getElementById("globo-pendientes");
  const grupos = derivar(estado.datos.negocios, eventosSinAtender(), estado.hoy);
  const total = grupos.reduce((t, g) => t + g.items.length, 0);
  globo.hidden = total === 0;
  globo.textContent = total > 99 ? "99+" : String(total);
}

const VISTAS = {
  hoy: dibujarHoy,
  salud: dibujarSalud,
  negocios: dibujarNegocios,
  ficha: dibujarFicha,
  cartera: dibujarCartera,
  propiedad: dibujarPropiedad,
  renta: dibujarRenta,
  ajustes: dibujarAjustes,
};

// La ficha de un negocio se llega desde Negocios, y la de una propiedad desde Cartera:
// la barra de abajo tiene que quedar marcada en la pantalla de la que salio.
const PADRE = { ficha: "negocios", propiedad: "cartera" };

function dibujar() {
  const contenedor = document.getElementById("vista");
  const fabrica = VISTAS[estado.vista];
  contenedor.innerHTML = "";
  if (!fabrica) {
    contenedor.innerHTML = `<p class="pronto">Esta pantalla llega en la próxima etapa.</p>`;
  } else {
    contenedor.append(fabrica(estado));
  }
  window.scrollTo(0, 0);
  const marcada = PADRE[estado.vista] || estado.vista;
  for (const boton of document.querySelectorAll(".nav-boton")) {
    boton.setAttribute("aria-current", boton.dataset.vista === marcada ? "page" : "false");
  }
  dibujarBarraGuardado();
  dibujarGlobo();
}

function irA(vista, foco = null) {
  estado.vista = vista;
  estado.foco = foco;
  location.hash = foco ? `${vista}/${foco}` : vista;
  dibujar();
}

function leerHash() {
  const [vista, foco] = location.hash.replace("#", "").split("/");
  if (vista) {
    estado.vista = vista;
    estado.foco = foco || null;
  }
}

/* Antes esto se quedaba en "Guardando…" y no decia nunca que habia terminado: la barra
   simplemente desaparecia. Ahora avisa que salio bien y recien despues se va sola.

   El try/catch no es de adorno: si `sincronizar` reventara por algo inesperado, sin el la
   barra quedaria colgada en "Guardando…" para siempre. */
let reloj = null;

async function guardar() {
  clearTimeout(reloj);
  dibujarBarraGuardado("guardando", "Guardando…");
  let r;
  try {
    r = await sincronizar(estado, github, estado.token);
  } catch (error) {
    r = { ok: false, mensaje: `No se pudo guardar: ${error.message}` };
  }
  if (!r.ok) {
    dibujarBarraGuardado("error", r.mensaje);
    return;
  }
  dibujarBarraGuardado("listo", "✓ Guardado en GitHub");
  reloj = setTimeout(() => dibujarBarraGuardado(), 2500);
}

async function arrancar() {
  estado.datos = await bajarDatos();
  // Lo que el usuario edito de la cartera vive aparte (§3.3) y se superpone al leer.
  estado.datos.cartera = fusionar(estado.datos.cartera, estado.datos.mis_datos);
  leerHash();

  document.getElementById("navegacion").addEventListener("click", (evento) => {
    const boton = evento.target.closest(".nav-boton");
    if (boton) irA(boton.dataset.vista);
  });
  document.getElementById("boton-guardar").addEventListener("click", guardar);
  document.getElementById("boton-ajustes").addEventListener("click", () => irA("ajustes"));
  window.addEventListener("hashchange", () => { leerHash(); dibujar(); });

  // Si se cierra la app con cambios sin subir, avisar antes de perderlos.
  window.addEventListener("beforeunload", (evento) => {
    if (hayCambios(estado)) evento.preventDefault();
  });

  // Android avisa una sola vez que la app se puede instalar, y si no se atiende ese aviso
  // se pierde. Se guarda para poder ofrecerlo despues, con un boton en Ajustes.
  window.addEventListener("beforeinstallprompt", (evento) => {
    evento.preventDefault();
    estado.instalador = evento;
    dibujar();
  });
  window.addEventListener("appinstalled", () => {
    estado.instalador = null;
    dibujar();
  });

  dibujarBarraEstado();
  dibujar();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}

arrancar();
