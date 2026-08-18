/* Arranque: baja los datos, arma la navegacion y dibuja la vista activa. */

import { derivar } from "./lib/pendientes.js";
import * as github from "./lib/github.js";
import * as tema from "./lib/tema.js";
import { fusionar, completarConNegocios } from "./lib/cartera.js";
import { revisar } from "./lib/motor.js";
import { hayCambios, resumenCambios, sincronizar } from "./lib/guardado.js";
import { dibujarSalud } from "./vistas/salud.js";
import { dibujarHoy } from "./vistas/hoy.js";
import { dibujarNegocios } from "./vistas/negocios.js";
import { dibujarFicha } from "./vistas/ficha.js";
import { dibujarCartera } from "./vistas/cartera.js";
import { dibujarPropiedad } from "./vistas/propiedad.js";
import { dibujarRenta } from "./vistas/renta.js";
import { dibujarIndicador } from "./vistas/indicador.js";
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
  anterior: "negocios",  // de que pantalla se vino, para poder volver
  redibujar: () => dibujar(),
  // La navegacion viaja en el estado y NO se importa desde las vistas: si cada vista
  // importara app.js habria un ciclo (app.js -> vistas -> app.js).
  irA: (vista, foco) => irA(vista, foco),
  guardar: () => guardar(),
};

/* Los cuatro que escribe la APP. Se leen distinto que los del robot, y hay un motivo. */
const MIOS = { negocios: "datos/negocios.json", mis_datos: "datos/mis_datos.json",
  ajustes: "datos/ajustes.json", calculos_renta: "datos/calculos_renta.json" };

async function bajarDeLaWeb(nombre) {
  const respuesta = await fetch(`datos/${nombre}.json`, { cache: "no-cache" });
  if (!respuesta.ok) throw new Error(respuesta.status);
  return respuesta.json();
}

/* GitHub Pages tarda cerca de un minuto en publicar un archivo recien subido.

   Eso hacia perder datos a la vista: guardabas un calculo de renta, la app lo mandaba al
   repo, recargabas para verlo y Pages todavia servia el JSON viejo. El dato estaba —
   nunca se perdio ninguno — pero no aparecia, que a los ojos del que lo cargo es lo
   mismo. Paso de verdad con un calculo guardado a nombre de un cliente.

   Con token, los cuatro archivos que escribe la app se leen por la API de GitHub, que
   devuelve el contenido del repo al instante. Los del robot (cartera, eventos, estado)
   siguen por la web: ahi no hay apuro, y son los mas pesados. Sin token o sin señal, todo
   cae a la web como antes. */
async function bajarDatos(token, shas) {
  const pares = await Promise.all(
    ARCHIVOS.map(async (nombre) => {
      try {
        if (token && MIOS[nombre]) {
          try {
            const { datos, sha } = await github.leerArchivo(MIOS[nombre], token);
            if (datos !== null) {
              // De paso queda el sha de entrada: el primer guardado no choca.
              if (shas) shas[MIOS[nombre]] = sha;
              return [nombre, datos];
            }
          } catch {
            // Token vencido, sin señal o rate limit: se sigue por la web.
          }
        }
        return [nombre, await bajarDeLaWeb(nombre)];
      } catch {
        // Si falta un archivo la app tiene que abrir igual, no quedarse en blanco.
        return [nombre, VACIO_OBJETO.has(nombre) ? {} : []];
      }
    })
  );
  return Object.fromEntries(pares);
}

/* El engranaje y el sol/luna solo en Hoy: en el resto de las pantallas se comian una
   franja entera de alto y no se usaban nunca. */
function dibujarCinta() {
  document.getElementById("cinta").hidden = estado.vista !== "hoy";
}

function dibujarBotonTema() {
  const boton = document.getElementById("boton-tema");
  const actual = tema.vigente();
  const otro = tema.opuesto(actual);
  // El boton muestra a donde VA, no donde esta: es lo que se entiende sin pensarlo.
  boton.textContent = otro === tema.OSCURO ? "☾" : "☀";
  boton.setAttribute("aria-label", `Cambiar a modo ${otro}`);
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
  indicador: dibujarIndicador,
};

// La ficha de un negocio se llega desde Negocios, y la de una propiedad desde Cartera:
// la barra de abajo tiene que quedar marcada en la pantalla de la que salio.
const PADRE = { ficha: "negocios", propiedad: "cartera", indicador: "salud" };

/* Cambiar de pantalla sube arriba de todo. Corregir un dato NO: hay que quedarse donde
   estaba y con el cursor en el mismo campo.

   Sin esto, cada vez que se cargaba un dato la pantalla pestañeaba, volvia arriba y habia
   que scrollear de nuevo hasta donde uno estaba. Con una ficha de veinte campos, eso hace
   la app inusable. */
function dibujar({ desdeArriba = false } = {}) {
  dibujarCinta();
  dibujarBotonTema();
  const contenedor = document.getElementById("vista");
  const alturaPrevia = window.scrollY;
  const enfocado = document.activeElement;
  const idEnfocado = enfocado && enfocado.id && contenedor.contains(enfocado)
    ? enfocado.id : null;

  const fabrica = VISTAS[estado.vista];
  contenedor.innerHTML = "";
  if (!fabrica) {
    contenedor.innerHTML = `<p class="pronto">Esta pantalla llega en la próxima etapa.</p>`;
  } else {
    contenedor.append(fabrica(estado));
  }

  if (desdeArriba) {
    window.scrollTo(0, 0);
  } else {
    window.scrollTo(0, alturaPrevia);
    if (idEnfocado) {
      const devuelto = document.getElementById(idEnfocado);
      // `preventScroll` es la clave: sin eso el navegador vuelve a saltar al campo.
      if (devuelto) devuelto.focus({ preventScroll: true });
    }
  }

  const marcada = PADRE[estado.vista] || estado.vista;
  for (const boton of document.querySelectorAll(".nav-boton")) {
    boton.setAttribute("aria-current", boton.dataset.vista === marcada ? "page" : "false");
  }
  dibujarBarraGuardado();
  dibujarGlobo();
}

function irA(vista, foco = null) {
  // De donde vino, para que "Ficha completa" sepa a donde devolverlo.
  if (vista !== estado.vista) estado.anterior = estado.vista;
  estado.vista = vista;
  estado.foco = foco;
  location.hash = foco ? `${vista}/${foco}` : vista;
  dibujar({ desdeArriba: true });
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
  // Antes de bajar nada: si no, la pantalla parpadea en claro y despues se pone oscura.
  tema.aplicar(tema.vigente());
  estado.shas = estado.shas || {};
  estado.datos = await bajarDatos(estado.token, estado.shas);
  // Lo que el usuario edito de la cartera vive aparte (§3.3) y se superpone al leer.
  estado.datos.cartera = fusionar(estado.datos.cartera, estado.datos.mis_datos);

  /* Se repasan todos los negocios contra la cartera de hoy. Sin esto, un negocio dado por
     completo cuando la propiedad estaba en negociacion nunca volveria a la bandeja al
     venderse: los avisos quedarian congelados como estaban el dia que se cargo el Excel.

     Es solo en memoria y NO marca nada para subir: si el usuario despues edita algo, se
     guarda todo junto. Al abrir de nuevo se vuelve a calcular igual. */
  estado.datos.negocios = (estado.datos.negocios || []).map(
    (n) => revisar(n, estado.datos.ajustes, estado.hoy, estado.datos.cartera)
  );

  /* Y al reves: la propiedad toma lo que ya esta cargado en sus negocios. Sin esto, un
     dato cargado desde el negocio hace semanas seguia apareciendo en rojo en la ficha de
     la propiedad, porque la sincronia solo corria al editar. */
  estado.datos.cartera = completarConNegocios(estado.datos.cartera, estado.datos.negocios);

  leerHash();

  document.getElementById("navegacion").addEventListener("click", (evento) => {
    const boton = evento.target.closest(".nav-boton");
    if (boton) irA(boton.dataset.vista);
  });
  document.getElementById("boton-guardar").addEventListener("click", guardar);
  document.getElementById("boton-tema").addEventListener("click", () => {
    tema.aplicar(tema.guardar(tema.opuesto(tema.vigente())));
    dibujarBotonTema();
  });
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

  cuidarLaVersion();
}

/* Que la app se actualice sola, sin que nadie tenga que borrar nada.

   El problema: el service worker viejo es el que manda mientras esté instalado, así que
   una version con un error podia quedarse sirviendo codigo viejo para siempre. Y recargar
   no alcanza, porque el service worker sobrevive a la recarga.

   Las cuatro piezas que hacen falta, juntas:
     1. `updateViaCache: "none"` — el navegador no puede servir un sw.js viejo de SU cache.
     2. `update()` al abrir y al volver a la app — se fija si hay uno nuevo.
     3. `skipWaiting` + `clients.claim` (en sw.js) — el nuevo toma el mando enseguida.
     4. al cambiar de mando, se recarga UNA vez — asi la pantalla queda con el codigo nuevo.

   Con esto, abrir y cerrar la app alcanza. */
function cuidarLaVersion() {
  if (!("serviceWorker" in navigator)) return;

  // Solo se recarga si habia una version anterior andando. En la primera visita no hay
  // nada viejo que reemplazar, y recargar seria un parpadeo al pedo.
  const habiaUnaAnterior = Boolean(navigator.serviceWorker.controller);
  let yaRecargue = false;

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!habiaUnaAnterior || yaRecargue) return;
    yaRecargue = true;
    window.location.reload();
  });

  navigator.serviceWorker
    .register("sw.js", { updateViaCache: "none" })
    .then((registro) => {
      registro.update().catch(() => {});
      // Al volver a la app (en el celular casi nunca se cierra del todo) se vuelve a mirar.
      document.addEventListener("visibilitychange", () => {
        if (!document.hidden) registro.update().catch(() => {});
      });
    })
    .catch(() => {});
}

arrancar();
