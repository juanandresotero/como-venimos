/* Arranque: baja los datos, arma la navegacion y dibuja la vista activa. */

import { bandeja, cuantosPendientes, sinAtender } from "./lib/pendientes.js";
import * as github from "./lib/github.js";
import * as tema from "./lib/tema.js";
import { fusionar, completarConNegocios } from "./lib/cartera.js";
import { revisar } from "./lib/motor.js";
import { hayCambios, resumenCambios, sincronizar, ARCHIVO_NEGOCIOS } from "./lib/guardado.js";
import { negociosQueFaltan } from "./lib/nacen-solos.js";
import { dibujarSalud } from "./vistas/salud.js";
import { dibujarHoy } from "./vistas/hoy.js";
import { dibujarNegocios } from "./vistas/negocios.js";
import { dibujarFicha } from "./vistas/ficha.js";
import { dibujarCartera } from "./vistas/cartera.js";
import { dibujarPropiedad } from "./vistas/propiedad.js";
import { dibujarRenta } from "./vistas/renta.js";
import { dibujarHerramientas } from "./vistas/herramientas.js";
import { dibujarComisiones } from "./vistas/comisiones.js";
import { dibujarReajuste } from "./vistas/reajuste.js";
import { dibujarCartaOferta } from "./vistas/carta-oferta.js";
import { dibujarPadron } from "./vistas/padron.js";
import { dibujarIndicador } from "./vistas/indicador.js";
import { dibujarAjustes } from "./vistas/ajustes.js";
import { dibujarHomogeneizacion } from "./vistas/homogeneizacion.js";
import { dibujarCostosCierre } from "./vistas/costos-cierre.js";
import { dibujarPersonalResumen } from "./vistas/personal-resumen.js";
import { dibujarPersonalFijos } from "./vistas/personal-fijos.js";
import { dibujarPersonalVariables } from "./vistas/personal-variables.js";

const ARCHIVOS = [
  "cartera", "negocios", "ajustes", "eventos", "estado_robot", "mis_datos", "calculos_renta",
  "indices",
];
const VACIO_OBJETO = new Set(["cartera", "ajustes", "estado_robot", "mis_datos", "indices"]);

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
  const casa = CARAS[cara].casa;
  document.getElementById("cinta").hidden = estado.vista !== casa;
  const boton = document.getElementById("boton-cara");
  boton.setAttribute("aria-checked", cara === "personal" ? "true" : "false");
  boton.classList.toggle("en-personal", cara === "personal");
}

/* Cada cara tiene su barra de abajo. Se muestran y se esconden enteras en vez de reescribir
   los botones: son dos menus distintos, no uno que cambia de nombres. */
function dibujarNavegacion() {
  for (const [clave, datos] of Object.entries(CARAS)) {
    document.getElementById(datos.nav).hidden = clave !== cara;
  }
}

function cambiarDeCara() {
  cara = cara === "personal" ? "negocios" : "personal";
  irA(CARAS[cara].casa);
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

  /* Esta barra sube cambios AL REPO. Lo personal no va al repo, asi que en esa cara no
     aparece: verla ahi seria invitar a subir lo que justamente no tiene que salir. */
  if (cara === "personal") {
    barra.hidden = true;
    return;
  }
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

/* Una sola regla, en lib/pendientes.js: estaba copiada acá y en la vista de Hoy, y al
   cambiarla en un lado el otro seguía con la vieja. */
const eventosSinAtender = () =>
  sinAtender(estado.datos.eventos, estado.datos.mis_datos, estado.datos.cartera);


function dibujarGlobo() {
  const globo = document.getElementById("globo-pendientes");
  const total = cuantosPendientes(bandeja(estado.datos.negocios, eventosSinAtender(),
    estado.hoy, estado.datos.cartera));
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
  herramientas: dibujarHerramientas,
  renta: dibujarRenta,
  comisiones: dibujarComisiones,
  reajuste: dibujarReajuste,
  carta_oferta: dibujarCartaOferta,
  padron: dibujarPadron,
  ajustes: dibujarAjustes,
  homogeneizacion: dibujarHomogeneizacion,
  costos_cierre: dibujarCostosCierre,
  indicador: dibujarIndicador,
  personal_resumen: dibujarPersonalResumen,
  personal_fijos: dibujarPersonalFijos,
  personal_variables: dibujarPersonalVariables,
};

/* ---------- Las dos caras ---------- */

/* La app tiene DOS caras y no comparten nada salvo la ganancia de los negocios cobrados.

   La cara ES DE LA SESION, no se guarda: al abrir la app siempre se entra por el negocio.
   Lo pidio Juan asi y ademas cuida lo otro — si alguien agarra el telefono y abre la app, lo
   primero que ve no son sus gastos personales. */
const CARAS = {
  negocios: { casa: "hoy", nav: "navegacion" },
  personal: { casa: "personal_resumen", nav: "navegacion-personal" },
};
const VISTAS_PERSONALES = new Set(
  ["personal_resumen", "personal_fijos", "personal_variables"]);
const caraDe = (vista) => (VISTAS_PERSONALES.has(vista) ? "personal" : "negocios");
let cara = "negocios";

// La ficha de un negocio se llega desde Negocios, y la de una propiedad desde Cartera:
// la barra de abajo tiene que quedar marcada en la pantalla de la que salio.
/* La barra de abajo queda marcada en la pestaña de la que se salio. Las calculadoras
   viven adentro de Herramientas, asi que su pestaña es esa. */
const PADRE = { ficha: "negocios", propiedad: "cartera", indicador: "salud",
  renta: "herramientas", comisiones: "herramientas", reajuste: "herramientas",
  carta_oferta: "herramientas", padron: "herramientas",
  homogeneizacion: "herramientas", costos_cierre: "herramientas" };

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

  /* La animacion de entrada corre SOLO al cambiar de pantalla.

     Estaba en todos los elementos siempre, y como cualquier cambio redibuja la vista
     entera, tocar un año o tildar un indicador hacia que la pantalla completa se
     desvaneciera y volviera a entrar deslizandose. Eso era el pestañeo.

     Y se reemplaza de una sola vez con replaceChildren en vez de vaciar y despues
     llenar: vaciar primero deja un cuadro en blanco visible entre las dos cosas. */
  const fabrica = VISTAS[estado.vista];
  contenedor.classList.toggle("entrando", desdeArriba);
  if (fabrica) {
    contenedor.replaceChildren(fabrica(estado));
  } else {
    const aviso = document.createElement("p");
    aviso.className = "pronto";
    aviso.textContent = "Esta pantalla llega en la próxima etapa.";
    contenedor.replaceChildren(aviso);
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
  dibujarNavegacion();
  dibujarBarraGuardado();
  dibujarGlobo();
}

/* Cambiar el hash dispara `hashchange`, que tambien redibuja. Sin esta bandera cada
   navegacion dibujaba DOS veces — una desde aca con la animacion de entrada y otra desde
   el evento sin ella, que ademas pisaba a la primera. El trabajo se hacia al pedo y la
   animacion no llegaba a verse. */
let navegando = false;

function irA(vista, foco = null) {
  // De donde vino, para que "Ficha completa" sepa a donde devolverlo.
  if (vista !== estado.vista) estado.anterior = estado.vista;
  cara = caraDe(vista);
  estado.vista = vista;
  estado.foco = foco;
  const destino = foco ? `${vista}/${foco}` : vista;
  if (location.hash.slice(1) === destino) {
    // El hash ya era ese: no va a haber evento, hay que dibujar aca.
    dibujar({ desdeArriba: true });
    return;
  }
  navegando = true;
  location.hash = destino;   // el `hashchange` dibuja
}

function leerHash() {
  const [vista, foco] = location.hash.replace("#", "").split("/");
  if (vista) {
    estado.vista = vista;
    estado.foco = foco || null;
    cara = caraDe(vista);
  }
}

/* Al ABRIR la app se entra siempre por el negocio, aunque la direccion diga otra cosa.

   Pasa cuando se cierra la app parado en una pantalla personal: el navegador guarda ese
   `#personal_variables` y al volver a abrir mostraria los gastos de una. Lo pidio Juan asi
   y ademas cuida lo otro: lo primero que ve cualquiera que agarre el telefono es el trabajo. */
/* Lo que llega cuando se comparte un mensaje CON la app.

   El aviso de consumo del banco se comparte desde la app de mensajes y cae acá como un
   parámetro de la dirección. NO se leen los mensajes del teléfono —ninguna página web puede,
   y está bien que sea así: por SMS llegan los códigos de un solo uso del banco— sino
   únicamente el que el usuario decidió pasar.

   Se guarda en el estado y se limpia la dirección: si quedara pegada, recargar la pantalla
   volvería a cargar el mismo gasto. */
function recibirLoCompartido() {
  const parametros = new URLSearchParams(location.search);
  const texto = parametros.get("texto") || parametros.get("text") || "";
  if (!texto.trim()) return;
  estado.compartido = texto;
  history.replaceState(null, "", `${location.pathname}#personal_variables`);
  estado.vista = "personal_variables";
  estado.foco = null;
  cara = "personal";
}

/* El atajo del icono: mantener apretado el icono de la app y elegir "Anotar un gasto".

   Va derecho al campo del monto, con el teclado abierto. Anotar un gasto es lo unico que se
   hace TODOS LOS DIAS y en cualquier lado —parado en la caja del super, con una mano— y cada
   pantalla de por medio es una razon mas para no hacerlo. Juan lo dijo con todas las letras:
   "es muy dificil anotar todos mis gastos, seguro que algunas veces me olvidare".

   Corre DESPUES de `entrarPorElNegocio`, que manda a la cara del trabajo: este atajo es la
   excepcion a esa regla, porque el usuario dijo a donde quiere ir. */
function atajoDeGasto() {
  const parametros = new URLSearchParams(location.search);
  if (parametros.get("anotar") !== "gasto") return;
  history.replaceState(null, "", `${location.pathname}#personal_variables`);
  estado.vista = "personal_variables";
  estado.foco = null;
  estado.anotarYa = true;
  cara = "personal";
}

function entrarPorElNegocio() {
  if (caraDe(estado.vista) !== "personal") return;
  estado.vista = "hoy";
  estado.foco = null;
  cara = "negocios";
  if (location.hash) history.replaceState(null, "", "#hoy");
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

  /* LOS NEGOCIOS QUE FALTAN NACEN SOLOS. Una venta que paso a negociacion o un alquiler que
     quedo reservado ya son plata en camino, y hasta ahora habia que cargarlos a mano desde
     "+ Nuevo" copiando lo que el robot ya tenia delante. Regla de Juan.

     ESTO SI MARCA PARA SUBIR, a diferencia del repaso de arriba: un negocio nuevo es un dato
     que no existia, y si se quedara solo en memoria desapareceria al cerrar la app. */
  const reciennacidos = negociosQueFaltan(
    estado.datos.cartera, estado.datos.negocios, estado.datos.ajustes, estado.hoy);
  if (reciennacidos.length) {
    estado.datos.negocios.push(...reciennacidos);
    estado.sucios.add(ARCHIVO_NEGOCIOS);
  }

  /* Y al reves: la propiedad toma lo que ya esta cargado en sus negocios. Sin esto, un
     dato cargado desde el negocio hace semanas seguia apareciendo en rojo en la ficha de
     la propiedad, porque la sincronia solo corria al editar. */
  estado.datos.cartera = completarConNegocios(estado.datos.cartera, estado.datos.negocios);

  leerHash();
  entrarPorElNegocio();
  recibirLoCompartido();
  atajoDeGasto();

  for (const barra of document.querySelectorAll(".navegacion")) {
    barra.addEventListener("click", (evento) => {
      const boton = evento.target.closest(".nav-boton");
      if (boton) irA(boton.dataset.vista);
    });
  }
  document.getElementById("boton-cara").addEventListener("click", cambiarDeCara);
  document.getElementById("boton-guardar").addEventListener("click", guardar);
  document.getElementById("boton-tema").addEventListener("click", () => {
    tema.aplicar(tema.guardar(tema.opuesto(tema.vigente())));
    dibujarBotonTema();
  });
  document.getElementById("boton-ajustes").addEventListener("click", () => irA("ajustes"));
  window.addEventListener("hashchange", () => {
    leerHash();
    // Volver con el boton de atras tambien es cambiar de pantalla, y tambien anima.
    dibujar({ desdeArriba: true });
    navegando = false;
  });

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
