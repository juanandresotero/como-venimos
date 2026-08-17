/* Arranque: baja los datos, arma la navegacion y dibuja la vista activa. */

import { derivar } from "./lib/pendientes.js";
import { dibujarSalud } from "./vistas/salud.js";
import { dibujarHoy } from "./vistas/hoy.js";

const ARCHIVOS = ["cartera", "negocios", "ajustes", "eventos", "estado_robot"];
const VACIO_OBJETO = new Set(["cartera", "ajustes", "estado_robot"]);

const estado = {
  datos: {},
  hoy: new Date().toISOString().slice(0, 10),
  vista: "hoy",
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

function dibujarGlobo() {
  const globo = document.getElementById("globo-pendientes");
  const grupos = derivar(estado.datos.negocios, estado.datos.eventos, estado.hoy);
  const total = grupos.reduce((t, g) => t + g.items.length, 0);
  globo.hidden = total === 0;
  globo.textContent = total > 99 ? "99+" : String(total);
}

const VISTAS = {
  hoy: dibujarHoy,
  salud: dibujarSalud,
};

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
  for (const boton of document.querySelectorAll(".nav-boton")) {
    const activa = boton.dataset.vista === estado.vista;
    boton.setAttribute("aria-current", activa ? "page" : "false");
  }
}

function irA(vista) {
  estado.vista = vista;
  location.hash = vista;
  dibujar();
}

async function arrancar() {
  estado.datos = await bajarDatos();
  const desdeElHash = location.hash.replace("#", "");
  if (desdeElHash) estado.vista = desdeElHash;

  document.getElementById("navegacion").addEventListener("click", (evento) => {
    const boton = evento.target.closest(".nav-boton");
    if (boton) irA(boton.dataset.vista);
  });
  window.addEventListener("hashchange", () => {
    const vista = location.hash.replace("#", "") || "hoy";
    if (vista !== estado.vista) { estado.vista = vista; dibujar(); }
  });

  dibujarBarraEstado();
  dibujarGlobo();
  dibujar();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}

arrancar();
