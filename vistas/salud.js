/* Salud del Negocio: la plata del recorte elegido, el ritmo contra el calendario y los
   indicadores que el usuario decide mirar.

   Arriba de todo hay una BARRA DE MENU con cuatro desplegables — años, indicadores, qué
   hacer y reporte. Todo lo que es "elegir" o "leer aparte" vive ahí y no ocupa lugar en
   la pantalla: abajo quedan solo los números. Antes cada una de esas cosas era una
   tarjeta más y había que scrollear entre ellas para llegar a lo que se venía a ver.

   Lo que cambia con el año elegido y lo que NO:

     - Cobrado, ritmo, gráficas e indicadores: se recortan al año elegido.
     - Cartera viva (reservado / en negociación): NO. Esa es la de HOY y no tiene versión
       histórica. Si el recorte no incluye el año en curso, esas tarjetas se esconden en
       vez de mostrar la cartera de hoy bajo un título de 2023, que sería mentira. */

import { capas, ritmo, porAnio, formaDelAnio } from "../lib/salud.js";
import {
  aniosDisponibles, cerradosDe, etiquetaDeAnios, mesesDe, mesesPorAnio, acumular,
  mejorYPeorMes,
} from "../lib/indicadores.js";
import { armar } from "./indicadores.js";
import { lineas } from "../lib/graficos.js";
import * as prefs from "../lib/preferencias.js";
import { recomendaciones, contarPendientes } from "../lib/recomendaciones.js";
import { armarReporte, nombreArchivo } from "../lib/reporte.js";
import { plata, plataUSD, compacto, pct, escapar } from "../lib/formato.js";

const html = (cadenas, ...valores) =>
  cadenas.reduce((t, c, i) => t + c + (valores[i] ?? ""), "");

function nodo(marca) {
  const molde = document.createElement("template");
  molde.innerHTML = marca.trim();
  return molde.content;
}

/* Cuantos negocios hay atras de un numero. Va pegado a casi todo lo de esta pantalla: con
   81 cierres en cinco años, un promedio de dos negocios parece un dato y es una anecdota. */
const cuantos = (n, uno = "negocio", muchos = "negocios") =>
  `${n} ${n === 1 ? uno : muchos}`;

const decimal = (n, cifras = 2) => n.toFixed(cifras).replace(".", ",");

/* Mas de tres curvas encima no se leen en un telefono. Pasado ese punto se suman. */
const MAXIMO_SUPERPUESTO = 3;

/* Que panel del menu esta abierto. Vive AFUERA del dibujado: elegir un año o tildar un
   indicador redibuja la pantalla entera, y si el estado viviera en el HTML el panel se
   cerraria en cada toque. Habria que volver a abrirlo para cada eleccion. */
let panelAbierto = null;

/* El modo ordenar se prende desde el menu y saca las flechas en cada tarjeta.

   Antes esto era "mantener apretada la tarjeta", y en un telefono no funciona: apenas se
   apoya el dedo sobre algo que se puede scrollear, el navegador se queda con el gesto y
   manda un `pointercancel`. El temporizador se cancelaba solo y no pasaba nada — ni el
   arrastre ni el toque. Un modo explicito ademas se descubre; un gesto escondido no. */
let ordenando = false;

export function dibujarSalud(estado) {
  const { negocios, cartera, ajustes } = estado.datos;
  const anioActual = estado.hoy.slice(0, 4);
  const disponibles = aniosDisponibles(negocios);
  const preferencias = prefs.leer();

  // null quiere decir "el año en curso": es lo que se ve al abrir sin haber elegido nada.
  const elegidos = preferencias.anios === null ? [anioActual] : preferencias.anios;
  const activos = elegidos.length ? elegidos : disponibles;
  const incluyeHoy = activos.includes(anioActual);
  const unSoloAnio = activos.length === 1 ? activos[0] : null;
  const etiqueta = etiquetaDeAnios(preferencias.anios === null ? [anioActual] : preferencias.anios,
    disponibles);

  const cerrados = cerradosDe(negocios, activos);
  const cobrado = {
    negocios: cerrados.length,
    facturacion: cerrados.reduce((t, n) => t + (n.facturacion || 0), 0),
    ganancia: cerrados.reduce((t, n) => t + (n.ganancia || 0), 0),
  };

  // La cartera viva es la de hoy. Solo tiene sentido junto al año en curso.
  const c = capas(negocios, cartera, ajustes, anioActual);
  const objetivo = unSoloAnio ? (ajustes.objetivo_personal || {})[unSoloAnio] || 0 : 0;
  const cerroElAnio = unSoloAnio && unSoloAnio < anioActual;
  const r = objetivo
    ? ritmo(cobrado.facturacion, objetivo, unSoloAnio, cerroElAnio ? `${unSoloAnio}-12-31` : estado.hoy,
      formaDelAnio(estado.datos.negocios, unSoloAnio))
    : null;

  const guardar = (cambios) => {
    prefs.guardar({ ...preferencias, ...cambios });
    estado.redibujar();
  };

  const eventosSinAtender = (estado.datos.eventos || []).filter((e) => {
    const atendidos = new Set((estado.datos.mis_datos || {}).eventos_atendidos || []);
    return !atendidos.has(e.id) && !e.atendido;
  });
  const consejos = recomendaciones(
    estado.datos, anioActual, estado.hoy, contarPendientes(negocios, eventosSinAtender)
  );

  const trozo = document.createDocumentFragment();
  trozo.append(barraDeMenu({
    estado, disponibles, preferencias, anioActual, etiqueta, consejos, guardar,
  }));
  trozo.append(cabecera(etiqueta, cobrado, incluyeHoy ? c : null));
  if (r) trozo.append(barraDeRitmo(r, objetivo, c, unSoloAnio, incluyeHoy, cerroElAnio));
  if (incluyeHoy) trozo.append(tresCapas(c));

  trozo.append(graficaMensual(negocios, activos, estado.hoy, preferencias, guardar));
  const anios = porAnio(negocios);
  if (anios.length) trozo.append(graficaAnual(anios, activos, preferencias, guardar));

  trozo.append(indicadoresElegidos(estado, {
    negocios, cartera, ajustes, activos, preferencias, hoy: estado.hoy,
    aniosDisponibles: disponibles,
  }, preferencias, guardar));
  return trozo;
}

/* ---------- La barra de menu ---------- */

/* Cuatro desplegables. Ninguno se parece a una tarjeta del tablero, a proposito: si el
   menu se ve igual que el contenido, deja de leerse como un menu.

     Años e Indicadores  una columnita angosta colgando de su boton, sin explicaciones
     Que hacer           una ventana en el medio de la pantalla, que es texto para leer
     Reporte             dos iconos, sin una sola palabra

   El panel angosto se ancla al boton que lo abrio; los dos ultimos se pegan a la derecha
   para no irse de la pantalla. */
const PANELES = [
  { clave: "anios", nombre: "Años" },
  { clave: "indicadores", nombre: "Indicadores" },
  { clave: "quehacer", nombre: "Qué hacer" },
  { clave: "reporte", nombre: "Reporte" },
];

function barraDeMenu(ctx) {
  const { estado, disponibles, preferencias, anioActual, etiqueta, consejos, guardar } = ctx;

  // Cada boton dice de un vistazo que hay adentro: el año elegido, cuantos indicadores
  // estan prendidos, cuantos comentarios hay. Un menu que no adelanta nada no se abre.
  const resumen = {
    anios: escapar(etiqueta),
    indicadores: `${preferencias.indicadores.length}`,
    quehacer: consejos.length ? `${consejos.length}` : "",
    reporte: "",
  };

  const indice = PANELES.findIndex((p) => p.clave === panelAbierto);
  const enVentana = panelAbierto === "quehacer";
  const colgando = Boolean(panelAbierto) && !enVentana;

  const barra = nodo(html`
    <div class="menu-caja">
      <div class="barra-menu">
        ${PANELES.map((p) => html`
          <button class="menu-boton ${panelAbierto === p.clave ? "abierto" : ""}"
                  data-panel="${p.clave}" aria-expanded="${panelAbierto === p.clave}">
            <span class="menu-nombre">${escapar(p.nombre)}</span>
            ${resumen[p.clave] ? html`<span class="menu-dato">${resumen[p.clave]}</span>` : ""}
          </button>`).join("")}
      </div>
      ${colgando
        ? html`<div class="menu-globo ${indice >= 2 ? "derecha" : ""}"
                    style="--desde:${indice}" id="menu-panel"></div>`
        : ""}
    </div>
  `);

  for (const boton of barra.querySelectorAll("[data-panel]")) {
    boton.addEventListener("click", () => {
      // Tocar el que ya esta abierto lo cierra: es la unica forma de sacarlo del medio.
      panelAbierto = panelAbierto === boton.dataset.panel ? null : boton.dataset.panel;
      estado.redibujar();
    });
  }

  const panel = barra.getElementById("menu-panel");
  if (panel) {
    if (panelAbierto === "anios") {
      panel.append(panelDeAnios(disponibles, preferencias.anios, anioActual, guardar));
    }
    if (panelAbierto === "indicadores") {
      panel.append(panelDeIndicadores(preferencias, guardar, estado));
    }
    if (panelAbierto === "reporte") panel.append(panelReporte(estado, anioActual));
  }

  /* El telon va DEBAJO del panel en el apilado.

     Estaba por encima y lo tapaba entero: cada toque en un boton del menu caia en el
     telon, cuyo unico trabajo es cerrar. Se veia como que la app "tintineaba y no pasaba
     nada", y era eso — el menu se cerraba solo antes de que el boton se enterara. */
  if (colgando) {
    const telon = document.createElement("button");
    telon.className = "menu-telon";
    telon.setAttribute("aria-label", "Cerrar");
    telon.addEventListener("click", () => {
      panelAbierto = null;
      estado.redibujar();
    });
    barra.querySelector(".menu-caja").prepend(telon);
  }

  if (enVentana) barra.append(ventanaQueHacer(consejos, estado));
  return barra;
}

/* Una columna de años y nada mas. Sin parrafos: lo que hace cada opcion se ve tocandola. */
function panelDeAnios(disponibles, elegidos, anioActual, guardar) {
  const activos = new Set(elegidos === null ? [anioActual] : elegidos);
  const todos = elegidos !== null && elegidos.length === 0;
  const tilde = '<span class="tilde" aria-hidden="true">✓</span>';

  const caja = nodo(html`
    <div class="menu-lista">
      ${[...disponibles].reverse().map((a) => html`
        <button class="menu-opcion ${activos.has(a) && !todos ? "activo" : ""}" data-anio="${a}">
          <span>${a}</span>${activos.has(a) && !todos ? tilde : ""}
        </button>`).join("")}
      <button class="menu-opcion ${todos ? "activo" : ""}" data-anio="todos">
        <span>Todos</span>${todos ? tilde : ""}
      </button>
    </div>
  `);

  for (const boton of caja.querySelectorAll("[data-anio]")) {
    boton.addEventListener("click", () => {
      const cual = boton.dataset.anio;
      if (cual === "todos") return guardar({ anios: [] });

      // Sumar y restar años del recorte. Nunca se queda sin ninguno: sacar el ultimo
      // dejaria la pantalla en blanco, asi que ese toque se ignora.
      const base = todos ? [] : [...activos];
      const nuevo = base.includes(cual) ? base.filter((a) => a !== cual) : [...base, cual];
      if (!nuevo.length) return;
      guardar({ anios: nuevo.sort() });
    });
  }
  return caja;
}

/* Lista corta de nombres. Todos y Ninguno van arriba, como titulo de la columna. */
function panelDeIndicadores(preferencias, guardar, estado) {
  const elegidos = new Set(preferencias.indicadores);
  const tilde = '<span class="tilde" aria-hidden="true">✓</span>';

  const caja = nodo(html`
    <div class="menu-lista">
      <div class="menu-cabeza">
        <button class="menu-mini" data-todos="si">Todos</button>
        <button class="menu-mini" data-todos="no">Ninguno</button>
      </div>
      ${prefs.INDICADORES.map((i) => html`
        <button class="menu-opcion ${elegidos.has(i.clave) ? "activo" : ""}"
                data-indicador="${i.clave}">
          <span>${escapar(i.nombre)}</span>${elegidos.has(i.clave) ? tilde : ""}
        </button>`).join("")}
      <button class="menu-opcion aparte ${ordenando ? "activo" : ""}" data-ordenar="si">
        <span>${ordenando ? "Terminar de ordenar" : "Ordenar tarjetas"}</span>
      </button>
    </div>
  `);

  for (const boton of caja.querySelectorAll("[data-indicador]")) {
    boton.addEventListener("click", () => {
      const clave = boton.dataset.indicador;
      // Prender uno lo manda al FINAL: aparece abajo de todo, donde se lo ve entrar.
      // Si se colara en el medio, el orden que el usuario armo se le desarma solo.
      const nuevos = elegidos.has(clave)
        ? preferencias.indicadores.filter((c) => c !== clave)
        : [...preferencias.indicadores, clave];
      guardar({ indicadores: nuevos });
    });
  }
  for (const boton of caja.querySelectorAll("[data-todos]")) {
    boton.addEventListener("click", () => {
      guardar({ indicadores: boton.dataset.todos === "si" ? prefs.todos() : [] });
    });
  }
  caja.querySelector("[data-ordenar]").addEventListener("click", () => {
    ordenando = !ordenando;
    panelAbierto = null;
    estado.redibujar();
  });
  return caja;
}

const ROJAS = new Set(["falta_volumen", "categoria", "concentracion", "trabadas"]);

/* Aca no se elige nada: son los comentarios sobre tus numeros, para leer y cerrar.

   Por eso va en una ventana en el medio de la pantalla y no colgando de un boton: es lo
   unico del menu que se LEE, y leer parrafos en una columna de 200px es incomodo. */
function ventanaQueHacer(consejos, estado) {
  const caja = nodo(html`
    <div class="ventana-fondo" id="ventana-fondo">
      <div class="ventana" role="dialog" aria-label="Qué hacer">
        <div class="ventana-cabeza">
          <h2 class="titulo" style="font-size:17px">Qué hacer</h2>
          <button class="ventana-cerrar" id="cerrar-ventana" aria-label="Cerrar">✕</button>
        </div>
        <div class="ventana-cuerpo">
          ${consejos.length
            ? consejos.map((c) => html`
                <div class="consejo ${ROJAS.has(c.clave) ? "rojo" : ""}">
                  <p class="consejo-titulo">${escapar(c.titulo)}</p>
                  <p class="consejo-detalle">${escapar(c.detalle)}</p>
                </div>`).join("")
            : '<p class="apunte">Nada que marcarte hoy. Los números vienen prolijos.</p>'}
        </div>
      </div>
    </div>
  `);
  const cerrar = () => { panelAbierto = null; estado.redibujar(); };
  caja.getElementById("cerrar-ventana").addEventListener("click", cerrar);
  caja.getElementById("ventana-fondo").addEventListener("click", (evento) => {
    if (evento.target.id === "ventana-fondo") cerrar();
  });
  return caja;
}

/* Dos iconos y ninguna palabra: bajar y compartir se entienden en cualquier idioma. */
const ICONO_BAJAR = '<svg viewBox="0 0 24 24" aria-hidden="true">'
  + '<path d="M12 3v11m0 0 4-4m-4 4-4-4" fill="none" stroke="currentColor" stroke-width="2"'
  + ' stroke-linecap="round" stroke-linejoin="round"/>'
  + '<path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" fill="none" stroke="currentColor"'
  + ' stroke-width="2" stroke-linecap="round"/></svg>';

const ICONO_COMPARTIR = '<svg viewBox="0 0 24 24" aria-hidden="true">'
  + '<circle cx="18" cy="5" r="2.6" fill="none" stroke="currentColor" stroke-width="2"/>'
  + '<circle cx="6" cy="12" r="2.6" fill="none" stroke="currentColor" stroke-width="2"/>'
  + '<circle cx="18" cy="19" r="2.6" fill="none" stroke="currentColor" stroke-width="2"/>'
  + '<path d="m8.4 10.8 7.2-4.2m0 10.8-7.2-4.2" fill="none" stroke="currentColor"'
  + ' stroke-width="2" stroke-linecap="round"/></svg>';

/* El reporte se arma en el momento y se baja como archivo. No hay servidor atras: es el
   mismo navegador el que escribe el HTML. */
function panelReporte(estado, anio) {
  const caja = nodo(html`
    <div class="menu-iconos">
      <button class="boton-icono" id="bajar-reporte" aria-label="Descargar el reporte"
              title="Descargar">${ICONO_BAJAR}</button>
      <button class="boton-icono" id="compartir-reporte" aria-label="Compartir el reporte"
              title="Compartir">${ICONO_COMPARTIR}</button>
      <p class="apunte" id="aviso-reporte"></p>
    </div>
  `);

  const construir = () => armarReporte(estado.datos, anio, estado.hoy);
  const aviso = caja.getElementById("aviso-reporte");

  caja.getElementById("bajar-reporte").addEventListener("click", () => {
    const blob = new Blob([construir()], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const enlace = document.createElement("a");
    enlace.href = url;
    enlace.download = nombreArchivo(anio, estado.hoy);
    enlace.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    aviso.textContent = "Descargado.";
  });

  caja.getElementById("compartir-reporte").addEventListener("click", async () => {
    const archivo = new File([construir()], nombreArchivo(anio, estado.hoy), { type: "text/html" });
    if (navigator.canShare && navigator.canShare({ files: [archivo] })) {
      try {
        await navigator.share({ files: [archivo], title: `¿Cómo venimos? ${anio}` });
        return;
      } catch {
        return;   // se cancelo
      }
    }
    aviso.textContent = "Este navegador no comparte archivos. Descargalo.";
  });

  return caja;
}

/* ---------- Cabecera y ritmo ---------- */

function cabecera(etiqueta, cobrado, c) {
  const suma = c ? (campo) => c.cobrado[campo] + c.avanzado[campo] : null;
  return nodo(html`
    <section class="tarjeta tarjeta-fija">
      <p class="etiqueta">Cobrado en ${escapar(etiqueta)}</p>
      <p class="cifra cifra-heroe" style="margin:6px 0 2px">${plata(cobrado.ganancia)}</p>
      <p class="apunte" style="margin-bottom:${c ? "16px" : "0"}">
        <strong>a tu bolsillo</strong> · ${plataUSD(cobrado.facturacion)} facturados
        · ${cuantos(cobrado.negocios, "negocio cerrado", "negocios cerrados")}
      </p>
      ${c ? html`
        <div class="cierre">
          <p class="etiqueta">Si cierra lo reservado y lo que está en negociación</p>
          <p class="cifra cifra-grande" style="margin:6px 0 2px;color:var(--azul)">${plata(suma("ganancia"))}</p>
          <p class="apunte">
            a tu bolsillo · <strong>${plataUSD(suma("facturacion"))}</strong> facturados
          </p>
        </div>` : ""}
    </section>
  `);
}

function barraDeRitmo(r, objetivo, c, anio, incluyeHoy, cerroElAnio) {
  const relleno = Math.min(100, r.avance * 100);
  const marca = Math.min(100, r.esperado * 100);
  const veredicto = cerroElAnio
    ? (r.avance >= 1 ? "Llegaste" : "No llegaste")
    : (r.aRitmo ? "Vas a ritmo" : "Vas atrasado");
  const bien = cerroElAnio ? r.avance >= 1 : r.aRitmo;
  return nodo(html`
    <section class="tarjeta tarjeta-fija">
      <div class="tarjeta-titulo">
        <h2 class="titulo">Ritmo</h2>
        <span class="ritmo-veredicto ${bien ? "bien" : "mal"}">${veredicto}</span>
      </div>
      <div class="ritmo">
        <div class="ritmo-pista ${bien ? "" : "atrasado"}">
          <div class="ritmo-relleno" style="width:${relleno}%"></div>
          ${cerroElAnio ? "" : html`<div class="ritmo-marca" style="left:${marca}%" data-texto="hoy"></div>`}
        </div>
        <div class="ritmo-pies">
          <span><strong>${pct(r.avance)}</strong> del objetivo</span>
          ${cerroElAnio ? "" : html`<span>${pct(r.esperado)} del año, a tu ritmo</span>`}
        </div>
      </div>
      ${!cerroElAnio && r.aniosDeHistoria ? html`
        <p class="apunte" style="margin-top:8px">La marca no parte el año en partes iguales:
          es lo que llevabas cerrado a esta altura en tus últimos ${r.aniosDeHistoria} años.
          Tu año carga al final —agosto y diciembre son los meses fuertes—, así que el
          almanaque te pediría ${pct(r.calendario)} y tu historia ${pct(r.esperado)}.</p>` : ""}

      <div class="datos" style="margin-top:16px">
        <div class="dato"><span class="dato-nombre">Objetivo ${anio}</span><span class="dato-valor">${plata(objetivo)}</span></div>
        <div class="dato"><span class="dato-nombre">${cerroElAnio ? "Quedó sin cubrir" : "Te faltan"}</span><span class="dato-valor">${plata(r.falta)}</span></div>
        ${cerroElAnio ? "" : html`
          <div class="dato"><span class="dato-nombre">Por mes, para llegar</span><span class="dato-valor">${plata(r.porMes)}</span></div>
          <div class="dato"><span class="dato-nombre">A fin de año, a este paso</span><span class="dato-valor">${plata(r.proyeccion)}</span></div>`}
        ${incluyeHoy ? html`
          <div class="dato"><span class="dato-nombre">Si cierra toda tu cartera</span><span class="dato-valor">${plata(c.total.facturacion)} · ${plata(c.total.ganancia)} tuyos</span></div>` : ""}
      </div>
      ${!cerroElAnio && incluyeHoy && r.falta > 0 && c.total.facturacion < objetivo
        ? html`<p class="aviso">Aun cerrando <strong>todo</strong> lo que tenés hoy llegás a
             ${plata(c.total.facturacion)}. Te faltan <strong>${plata(objetivo - c.total.facturacion)}</strong>
             de negocio nuevo para el objetivo.</p>`
        : ""}
    </section>
  `);
}

/* ---------- Selector de tipo de grafica ---------- */

function selectorDeTipo(campo, actual, guardar) {
  const opciones = prefs.TIPOS[campo]
    .map((t) => html`
      <button class="pastilla ${t.clave === actual ? "activo" : ""}" data-tipo="${t.clave}">
        ${t.nombre}
      </button>`)
    .join("");
  const caja = nodo(html`<div class="pastillas">${opciones}</div>`);
  for (const boton of caja.querySelectorAll("[data-tipo]")) {
    boton.addEventListener("click", () => guardar({ [campo]: boton.dataset.tipo }));
  }
  return caja;
}

/* ---------- Graficas ---------- */

const MESES_CORTOS = ["E", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];

function columnas(filas, campo, etiquetaDe, destacar) {
  const tope = Math.max(...filas.map((f) => f[campo] || 0), 1);
  return html`<div class="barras">
    ${filas.map((f, i) => html`
      <div class="barras-columna ${destacar && destacar(f, i) ? "actual" : ""}">
        <span class="barras-tope">${f[campo] ? compacto(f[campo]) : ""}</span>
        <div class="barras-hueco">
          <div class="barras-cana" style="height:${((f[campo] || 0) / tope) * 100}%"></div>
        </div>
        <span class="barras-pie">${etiquetaDe(f, i)}</span>
      </div>`).join("")}
  </div>`;
}

function piesDeMeses() {
  return html`<div class="grafico-pies">
    ${MESES_CORTOS.map((m) => html`<span>${m}</span>`).join("")}
  </div>`;
}

/* Con dos o tres años elegidos se SUPERPONEN para comparar; con "Todos" o con uno solo se
   SUMAN. Es lo que pidio el usuario en sus dos pedidos, sin agregar otro boton: elegir
   años puntuales es querer compararlos, y "Todos" es querer el acumulado de la carrera. */
function graficaMensual(negocios, activos, hoy, preferencias, guardar) {
  const superponer = activos.length > 1 && activos.length <= MAXIMO_SUPERPUESTO;
  const tipo = preferencias.graficoMes;
  const meses = mesesDe(negocios, activos, hoy);
  const total = meses.reduce((t, m) => t + m.ganancia, 0);
  const { mejor, peor } = mejorYPeorMes(negocios, activos, hoy);

  let dibujo;
  if (superponer) {
    const series = mesesPorAnio(negocios, activos, hoy).map((s, i) => ({
      nombre: s.anio,
      puntos: tipo === "acumulado" ? acumular(s.meses) : s.meses,
      destacada: i === activos.length - 1,
    }));
    dibujo = lineas(series, {
      campo: tipo === "acumulado" ? "acumulado" : "ganancia",
      titulo: "ganancia mes a mes por año",
    }) + piesDeMeses() + html`<div class="leyenda">
      ${series.map((s, i) => html`
        <span class="leyenda-item">
          <span class="leyenda-punto" style="background:${["var(--azul)", "var(--azul-medio)", "var(--azul-claro)"][i % 3]}"></span>
          ${escapar(s.nombre)}
        </span>`).join("")}
    </div>`;
  } else if (tipo === "acumulado") {
    dibujo = lineas([{ nombre: "acumulado", puntos: acumular(meses), destacada: true }],
      { campo: "acumulado", relleno: true, titulo: "ganancia acumulada" }) + piesDeMeses();
  } else if (tipo === "linea") {
    dibujo = lineas([{ nombre: "mes", puntos: meses, destacada: true }],
      { campo: "ganancia", relleno: true, titulo: "ganancia mes a mes" }) + piesDeMeses();
  } else {
    const mesHoy = Number(hoy.slice(5, 7));
    dibujo = columnas(meses, "ganancia", (m, i) => MESES_CORTOS[i],
      (m) => activos.length === 1 && activos[0] === hoy.slice(0, 4) && m.mes === mesHoy);
  }

  const seccion = nodo(html`
    <section class="tarjeta tarjeta-fija">
      <div class="tarjeta-titulo">
        <h2 class="titulo">Tu ganancia mes a mes</h2>
        <span class="apunte">${plataUSD(total)}</span>
      </div>
      <div class="ranura-pastillas"></div>
      ${dibujo}
      ${mejor && mejor.ganancia ? html`
        <p class="apunte" style="margin-top:10px">
          Tu mejor mes fue <strong>${mejor.nombre}</strong>, con ${plataUSD(mejor.ganancia)}
          en ${cuantos(mejor.negocios, "cierre", "cierres")}.
          ${peor ? html` El más flojo, <strong>${peor.nombre}</strong>, con ${plataUSD(peor.ganancia)}.` : ""}
        </p>` : ""}
    </section>
  `);
  seccion.querySelector(".ranura-pastillas").append(
    selectorDeTipo("graficoMes", tipo, guardar));
  return seccion;
}

function graficaAnual(anios, activos, preferencias, guardar) {
  const total = anios.reduce((t, a) => t + a.facturacion, 0);
  const dibujo = preferencias.graficoAnual === "linea"
    ? lineas([{ nombre: "carrera", puntos: anios, destacada: true }],
        { campo: "facturacion", relleno: true, titulo: "facturación por año" })
      + html`<div class="grafico-pies">${anios.map((a) => html`<span>${a.anio.slice(2)}</span>`).join("")}</div>`
    : columnas(anios, "facturacion", (a) => a.anio.slice(2), (a) => activos.includes(a.anio));

  const seccion = nodo(html`
    <section class="tarjeta tarjeta-fija">
      <div class="tarjeta-titulo">
        <h2 class="titulo">Tu carrera</h2>
        <span class="apunte">${plataUSD(total)} facturados</span>
      </div>
      <div class="ranura-pastillas"></div>
      ${dibujo}
    </section>
  `);
  seccion.querySelector(".ranura-pastillas").append(
    selectorDeTipo("graficoAnual", preferencias.graficoAnual, guardar));
  return seccion;
}

/* ---------- Indicadores ---------- */

/* Las tarjetas de los indicadores, en el orden que el usuario dejo.

   Un toque abre la pantalla del indicador. Para moverlas de lugar hay un MODO ORDENAR que
   se prende desde el menu: mientras esta prendido cada tarjeta muestra sus flechas y el
   toque no navega.

   Antes esto era "mantener apretada la tarjeta" y no funcionaba en el telefono. Apenas se
   apoya el dedo sobre algo que se puede scrollear, el navegador se queda con el gesto para
   ver si vas a scrollear y manda `pointercancel`: el temporizador se cancelaba solo, asi
   que no salia ni el arrastre ni el toque. Un `click` de toda la vida no tiene ese
   problema, y un modo con nombre se descubre — un gesto escondido no. */
function indicadoresElegidos(estado, ctx, preferencias, guardar) {
  const contenedor = document.createElement("div");
  contenedor.className = "indicadores";

  const armados = preferencias.indicadores
    .map((clave) => ({ clave, armado: armar(clave, ctx) }))
    .filter((x) => x.armado);

  /* Una linea que separa el tablero fijo de lo que el usuario prendio. Sin esto las
     tarjetas se leian todas como una sola lista y no se entendia cuales se podian mover. */
  contenedor.append(nodo(html`
    <div class="separador-indicadores">
      <span class="separador-nombre">Tus indicadores</span>
    </div>`));

  if (ordenando) {
    contenedor.append(nodo(html`
      <p class="aviso-orden">Movelas con las flechas. Terminá desde
      <strong>Indicadores → Terminar de ordenar</strong>.</p>`));
  }

  if (!armados.length) {
    contenedor.append(nodo(html`
      <section class="tarjeta">
        <p class="apunte">No tenés ningún indicador prendido. Elegilos en
        <strong>Indicadores</strong>, acá arriba.</p>
      </section>`));
    return contenedor;
  }

  armados.forEach(({ clave, armado }, i) => {
    const tarjeta = nodo(html`
      <section class="tarjeta tarjeta-indicador ${ordenando ? "ordenando" : ""}"
               data-clave="${clave}" ${ordenando ? "" : 'role="button" tabindex="0"'}>
        ${ordenando ? html`
          <div class="mover">
            <button class="boton boton-chico" data-mover="-1" ${i === 0 ? "disabled" : ""}>↑</button>
            <button class="boton boton-chico" data-mover="1"
                    ${i === armados.length - 1 ? "disabled" : ""}>↓</button>
            <span class="apunte">${i + 1} de ${armados.length}</span>
          </div>` : ""}
        <div class="tarjeta-titulo">
          <h2 class="titulo">${escapar(armado.titulo)}</h2>
          <span class="apunte">${escapar(armado.apunte || "")}</span>
        </div>
        ${armado.resumen}
        ${ordenando ? "" : '<p class="ver-mas">Ver todo ›</p>'}
      </section>`).firstElementChild;

    if (ordenando) {
      for (const boton of tarjeta.querySelectorAll("[data-mover]")) {
        boton.addEventListener("click", () => {
          guardar({ indicadores: prefs.mover(preferencias.indicadores, clave, Number(boton.dataset.mover)) });
        });
      }
    } else {
      tarjeta.addEventListener("click", () => estado.irA("indicador", clave));
      tarjeta.addEventListener("keydown", (evento) => {
        if (evento.key === "Enter" || evento.key === " ") {
          evento.preventDefault();
          estado.irA("indicador", clave);
        }
      });
    }
    contenedor.append(tarjeta);
  });
  return contenedor;
}

/* ---------- Los cuatro momentos de la plata ---------- */

/* Los tres momentos que SUMAN — cobrado, reservado y en negociacion — y abajo, separado,
   lo potencial: lo que esta publicado y todavia no se movio.

   Lo potencial no suma a proposito. Es lo que hay dando vueltas, no lo que esta por
   entrar, y mezclarlo daba un numero que no se podia leer de un vistazo. El detalle
   propiedad por propiedad vive en Negocios, que es donde se va a hacer algo con el. */
function tresCapas(c) {
  const suma = c.encaminado.facturacion || 1;
  const ancho = (x) => `${Math.min(100, (x / suma) * 100)}%`;

  const fila = (clase, nombre, sub, grupo, aparte) => html`
    <div class="capa${aparte ? " aparte" : ""}">
      <span class="capa-punto ${clase}"></span>
      <span><span class="capa-nombre">${nombre}</span><br><span class="capa-sub">${sub}</span></span>
      <span class="capa-monto">
        <span class="cifra cifra-media">${plata(grupo.ganancia)}</span><br>
        <span class="capa-sub">de ${plata(grupo.facturacion)} facturados</span>
      </span>
    </div>`;

  return nodo(html`
    <section class="tarjeta tarjeta-fija">
      <h2 class="titulo" style="margin-bottom:14px">De dónde sale la plata</h2>
      <div class="capas-barra">
        <div class="capas-tramo uno" style="width:${ancho(c.cobrado.facturacion)}"></div>
        <div class="capas-tramo dos" style="width:${ancho(c.reservado.facturacion)}"></div>
        <div class="capas-tramo tres" style="width:${ancho(c.negociacion.facturacion)}"></div>
      </div>
      ${fila("uno", "Cobrado", cuantos(c.cobrado.negocios, "negocio cerrado", "negocios cerrados"), c.cobrado)}
      ${fila("dos", "Reservado", `${cuantos(c.reservado.cantidad, "propiedad", "propiedades")} · falta escriturar`, c.reservado)}
      ${fila("tres", "En negociación", `${cuantos(c.negociacion.cantidad, "propiedad", "propiedades")} · hay oferta`, c.negociacion)}

      <div class="capa capa-total">
        <span></span>
        <span class="capa-nombre">Total</span>
        <span class="capa-monto">
          <span class="cifra cifra-media">${plata(c.encaminado.ganancia)}</span><br>
          <span class="capa-sub">de ${plata(c.encaminado.facturacion)} facturados</span>
        </span>
      </div>

      ${fila("cuatro", "Potencial", `${cuantos(c.publicado.cantidad, "propiedad", "propiedades")} publicadas · no suma`, c.publicado, true)}
      <p class="apunte" style="margin-top:12px">Lo potencial, una por una, está en Negocios.</p>
    </section>
  `);
}
