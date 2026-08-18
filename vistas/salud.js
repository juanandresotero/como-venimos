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

import { capas, ritmo, porAnio } from "../lib/salud.js";
import {
  aniosDisponibles, cerradosDe, etiquetaDeAnios, mesesDe, mesesPorAnio, acumular,
  mejorYPeorMes, barrios, porOrigen, ventaVsAlquiler, concentracion, carteraPorCanal,
  plazos,
} from "../lib/indicadores.js";
import { lineas, torta, colorear, agruparCola } from "../lib/graficos.js";
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
    ? ritmo(cobrado.facturacion, objetivo, unSoloAnio, cerroElAnio ? `${unSoloAnio}-12-31` : estado.hoy)
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

  trozo.append(indicadoresElegidos(estado, negocios, cartera, ajustes, activos, preferencias));
  return trozo;
}

/* ---------- La barra de menu ---------- */

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

  const barra = nodo(html`
    <div class="barra-menu">
      ${PANELES.map((p) => html`
        <button class="menu-boton ${panelAbierto === p.clave ? "abierto" : ""}"
                data-panel="${p.clave}" aria-expanded="${panelAbierto === p.clave}">
          <span class="menu-nombre">${escapar(p.nombre)}</span>
          ${resumen[p.clave] ? html`<span class="menu-dato">${resumen[p.clave]}</span>` : ""}
        </button>`).join("")}
    </div>
    <div class="menu-panel" id="menu-panel" ${panelAbierto ? "" : "hidden"}></div>
  `);

  const panel = barra.getElementById("menu-panel");
  for (const boton of barra.querySelectorAll("[data-panel]")) {
    boton.addEventListener("click", () => {
      // Tocar el que ya esta abierto lo cierra: es la unica forma de sacarlo del medio.
      panelAbierto = panelAbierto === boton.dataset.panel ? null : boton.dataset.panel;
      estado.redibujar();
    });
  }

  if (panelAbierto === "anios") panel.append(panelDeAnios(disponibles, preferencias.anios, anioActual, guardar));
  if (panelAbierto === "indicadores") panel.append(panelDeIndicadores(preferencias, guardar));
  if (panelAbierto === "quehacer") panel.append(panelQueHacer(consejos));
  if (panelAbierto === "reporte") panel.append(panelReporte(estado, anioActual));

  return barra;
}

function panelDeAnios(disponibles, elegidos, anioActual, guardar) {
  const activos = new Set(elegidos === null ? [anioActual] : elegidos);
  const todos = elegidos !== null && elegidos.length === 0;

  const caja = nodo(html`
    <div>
      <div class="tags">
        ${disponibles.map((a) => html`
          <button class="tag ${activos.has(a) && !todos ? "activo" : ""}" data-anio="${a}">
            ${a}
          </button>`).join("")}
        <button class="tag ${todos ? "activo" : ""}" data-anio="todos">Todos</button>
      </div>
      <p class="apunte" style="margin-top:10px">
        Con dos o tres años elegidos las curvas se superponen para comparar. Con
        <strong>Todos</strong> se suman todos los eneros, todos los febreros y así.
      </p>
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

function panelDeIndicadores(preferencias, guardar) {
  const elegidos = new Set(preferencias.indicadores);
  const caja = nodo(html`
    <div>
      ${prefs.INDICADORES.map((i) => html`
        <label class="opcion">
          <input type="checkbox" data-indicador="${i.clave}" ${elegidos.has(i.clave) ? "checked" : ""}>
          <span>
            <span class="opcion-nombre">${escapar(i.nombre)}</span>
            <span class="opcion-pista">${escapar(i.pista)}</span>
          </span>
        </label>`).join("")}
      <div class="ranura-reparto"></div>
    </div>
  `);

  for (const casilla of caja.querySelectorAll("[data-indicador]")) {
    casilla.addEventListener("change", () => {
      const clave = casilla.dataset.indicador;
      const nuevos = casilla.checked
        ? [...preferencias.indicadores, clave]
        : preferencias.indicadores.filter((c) => c !== clave);
      guardar({ indicadores: nuevos });
    });
  }

  // El tipo de grafica del reparto solo se ofrece si hay algun indicador que lo use.
  if (["origenes", "barrios", "cartera_canal"].some((c) => elegidos.has(c))) {
    const ranura = caja.querySelector(".ranura-reparto");
    ranura.append(nodo(html`<p class="apunte" style="margin:14px 0 6px">Barrios y canales, en</p>`));
    ranura.append(selectorDeTipo("graficoReparto", preferencias.graficoReparto, guardar));
  }
  return caja;
}

const ROJAS = new Set(["falta_volumen", "categoria", "concentracion", "trabadas"]);

/* Aca no se elige nada: son los comentarios sobre tus numeros, para leer y cerrar. */
function panelQueHacer(consejos) {
  if (!consejos.length) {
    return nodo(html`<p class="apunte">Nada que marcarte hoy. Los números vienen prolijos.</p>`);
  }
  return nodo(html`
    <div>
      <p class="apunte" style="margin-bottom:12px">Con tus propios números.</p>
      ${consejos.map((c) => html`
        <div class="consejo ${ROJAS.has(c.clave) ? "rojo" : ""}">
          <p class="consejo-titulo">${escapar(c.titulo)}</p>
          <p class="consejo-detalle">${escapar(c.detalle)}</p>
        </div>`).join("")}
    </div>
  `);
}

/* El reporte se arma en el momento y se baja como archivo. No hay servidor atras: es el
   mismo navegador el que escribe el HTML. */
function panelReporte(estado, anio) {
  const caja = nodo(html`
    <div>
      <p class="apunte" style="margin-bottom:12px">
        Un archivo con todo esto adentro: capas, ritmo, gráficas y qué hacer para llegar.
        Se abre en cualquier teléfono, aunque no haya señal.
      </p>
      <div class="botonera" style="margin-top:0">
        <button class="boton boton-primario" id="bajar-reporte">Descargar</button>
        <button class="boton" id="compartir-reporte">Compartir</button>
      </div>
      <p class="apunte" id="aviso-reporte" style="margin-top:10px"></p>
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
    aviso.textContent = "Este navegador no comparte archivos. Descargalo y adjuntalo.";
  });

  return caja;
}

/* ---------- Cabecera y ritmo ---------- */

function cabecera(etiqueta, cobrado, c) {
  const suma = c ? (campo) => c.cobrado[campo] + c.avanzado[campo] : null;
  return nodo(html`
    <section class="tarjeta">
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
  const marca = Math.min(100, r.calendario * 100);
  const veredicto = cerroElAnio
    ? (r.avance >= 1 ? "Llegaste" : "No llegaste")
    : (r.aRitmo ? "Vas a ritmo" : "Vas atrasado");
  const bien = cerroElAnio ? r.avance >= 1 : r.aRitmo;
  return nodo(html`
    <section class="tarjeta">
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
          ${cerroElAnio ? "" : html`<span>${pct(r.calendario)} del año</span>`}
        </div>
      </div>
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
    <section class="tarjeta">
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
    <section class="tarjeta">
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

/* Una lista de barras horizontales o una torta, segun lo que el usuario haya elegido. Es
   el mismo dato: la torta se lee mejor para "cuanto pesa cada uno" y la barra para
   comparar valores. */
function reparto(filas, preferencias, opciones = {}) {
  const unidad = opciones.unidad || "negocios";
  const conCola = agruparCola(filas, opciones.cuantas || 5);
  const pintadas = colorear(conCola, opciones.cuantas || 5);
  const total = pintadas.reduce((t, f) => t + (f.ganancia || 0), 0);
  const tope = Math.max(...pintadas.map((f) => f.ganancia || 0), 1);

  const lista = pintadas
    .map((f) => html`
      <div class="reparto-fila">
        <div class="reparto-cabeza">
          <span class="reparto-nombre">
            <span class="leyenda-punto" style="background:${f.color}"></span>
            ${escapar(f.nombre)}
          </span>
          <span class="reparto-valor">${plata(f.ganancia)}</span>
        </div>
        <div class="reparto-pista">
          <div class="reparto-relleno" style="width:${((f.ganancia || 0) / tope) * 100}%;background:${f.color}"></div>
        </div>
        <span class="reparto-pie">
          ${cuantos(f[unidad] || 0, unidad === "propiedades" ? "propiedad" : "negocio",
            unidad === "propiedades" ? "propiedades" : "negocios")}
          ${total ? html` · ${pct((f.ganancia || 0) / total)} de la plata` : ""}
          ${f.negocios && unidad === "negocios" && !f.esCola
            ? html` · ${plata(f.ganancia / f.negocios)} por negocio` : ""}
        </span>
      </div>`)
    .join("");

  if (preferencias.graficoReparto === "torta") {
    return html`<div class="torta-caja">${torta(pintadas)}</div>${lista}`;
  }
  return lista;
}

function tarjeta(titulo, apunte, cuerpo, extra = "") {
  return html`
    <section class="tarjeta">
      <div class="tarjeta-titulo">
        <h2 class="titulo">${escapar(titulo)}</h2>
        ${apunte ? html`<span class="apunte">${escapar(apunte)}</span>` : ""}
      </div>
      ${cuerpo}
      ${extra}
    </section>`;
}

function indicadorVentaAlquiler(negocios, activos) {
  const r = ventaVsAlquiler(negocios, activos);
  if (!r.venta.negocios && !r.alquiler.negocios) return "";
  const fila = (d, nombre) => html`
    <div class="reparto-fila">
      <div class="reparto-cabeza">
        <span class="reparto-nombre">${nombre}</span>
        <span class="reparto-valor">${plata(d.ganancia)}</span>
      </div>
      <div class="reparto-pista">
        <div class="reparto-relleno" style="width:${d.parteDeLaPlata * 100}%"></div>
      </div>
      <span class="reparto-pie">
        ${cuantos(d.negocios)} · ${pct(d.parteDeLosNegocios)} de tu trabajo ·
        <strong>${plata(d.porNegocio)} por negocio</strong>
      </span>
    </div>`;
  return tarjeta("Venta vs alquiler", "lo que deja cada una",
    fila(r.venta, "Venta") + fila(r.alquiler, "Alquiler"),
    r.veces > 1 ? html`<p class="aviso">Una venta te deja
      <strong>${decimal(r.veces, 1)} veces</strong> lo que te deja un alquiler.
      Los alquileres son ${pct(r.alquiler.parteDeLosNegocios)} de tus cierres y
      ${pct(r.alquiler.parteDeLaPlata)} de tu plata.</p>` : "");
}

function indicadorOrigenes(negocios, activos, preferencias) {
  const filas = porOrigen(negocios, activos);
  if (!filas.length) return "";
  return tarjeta("De dónde vino la plata", "por canal de captación",
    reparto(filas, preferencias));
}

function indicadorBarrios(negocios, activos, preferencias) {
  const b = barrios(negocios, activos);
  if (!b.total) return "";
  const cuerpo = reparto(b.top, preferencias, { cuantas: 5 });
  const extra = html`
    <div class="datos" style="margin-top:14px">
      <div class="dato"><span class="dato-nombre">Barrios trabajados</span><span class="dato-valor">${b.total}</span></div>
      <div class="dato"><span class="dato-nombre">De una sola vez</span><span class="dato-valor">${b.unaVez}</span></div>
      ${b.masPlata ? html`
        <div class="dato"><span class="dato-nombre">El que más plata te dio</span>
          <span class="dato-valor">${escapar(b.masPlata.nombre)} · ${plata(b.masPlata.ganancia)}
            <br><span class="apunte">${cuantos(b.masPlata.negocios)}</span></span></div>` : ""}
      ${b.mejorPorNegocio ? html`
        <div class="dato"><span class="dato-nombre">El que mejor te paga por negocio</span>
          <span class="dato-valor">${escapar(b.mejorPorNegocio.nombre)} · ${plata(b.mejorPorNegocio.porNegocio)}
            <br><span class="apunte">${cuantos(b.mejorPorNegocio.negocios)}</span></span></div>` : ""}
    </div>
    ${b.mejorPorNegocio && b.masPlata && b.mejorPorNegocio.nombre !== b.masPlata.nombre
      ? html`<p class="apunte" style="margin-top:10px">
          El de más plata puede ser un solo negocio grande y no repetirse nunca. El que
          mejor paga por negocio se mide solo entre los que trabajaste
          ${b.minimoParaPromediar} veces o más — ese es el que sirve para decidir.</p>`
      : ""}`;
  return tarjeta("Barrios", `top ${Math.min(5, b.top.length)} por repetición`, cuerpo, extra);
}

function indicadorMeses(negocios, activos, hoy) {
  const { mejor, peor, evaluados, empatadosEnPeor } = mejorYPeorMes(negocios, activos, hoy);
  if (!mejor) return "";
  const meses = mesesDe(negocios, activos, hoy);
  const sinTerminar = meses.filter((m) => !m.terminado).length;
  return tarjeta("Mejor y peor mes", `sobre ${cuantos(evaluados, "mes cerrado", "meses cerrados")}`,
    html`<div class="datos">
      <div class="dato"><span class="dato-nombre">Tu mejor mes</span>
        <span class="dato-valor">${escapar(mejor.nombre)} · ${plata(mejor.ganancia)}
          <br><span class="apunte">${cuantos(mejor.negocios, "cierre", "cierres")}</span></span></div>
      <div class="dato"><span class="dato-nombre">El más flojo</span>
        <span class="dato-valor">${escapar(peor.nombre)} · ${plata(peor.ganancia)}
          <br><span class="apunte">${cuantos(peor.negocios, "cierre", "cierres")}</span></span></div>
    </div>`,
    html`${sinTerminar ? html`<p class="apunte" style="margin-top:10px">
        Quedan ${sinTerminar} ${sinTerminar === 1 ? "mes" : "meses"} sin terminar en el
        recorte: no se juzgan, un mes que no llegó no es un mes malo.</p>` : ""}
      ${empatadosEnPeor > 1 ? html`<p class="apunte" style="margin-top:6px">
        Hay ${empatadosEnPeor} meses empatados abajo. Se eligió el que peor viene en toda
        tu carrera.</p>` : ""}`);
}

function indicadorDependencia(negocios, activos) {
  const filas = concentracion(negocios, activos).filter((f) => f.negocios);
  if (!filas.length) return "";
  const cuerpo = html`<div class="datos">
    ${filas.map((f) => html`
      <div class="dato">
        <span class="dato-nombre">${f.anio} · ${cuantos(f.negocios, "cierre", "cierres")}</span>
        <span class="dato-valor">${pct(f.parte)}
          <br><span class="apunte">el mejor solo: ${pct(f.parteDelMejor)}</span></span>
      </div>`).join("")}
  </div>`;
  const fragil = filas.filter((f) => f.parte > 0.6 && f.negocios >= 3);
  return tarjeta("De cuánto dependés", "peso de tus 3 mejores negocios", cuerpo,
    fragil.length ? html`<p class="aviso">En ${fragil.map((f) => f.anio).join(", ")} tres
      negocios trajeron más de la mitad del año. Si uno se cae, se cae el año.</p>` : "");
}

function indicadorCarteraCanal(cartera, negocios, ajustes, preferencias) {
  const filas = carteraPorCanal(cartera, negocios, ajustes);
  if (!filas.length) return "";
  return tarjeta("Cartera viva por canal", "de dónde va a venir lo que viene",
    reparto(filas, preferencias, { unidad: "propiedades" }),
    html`<p class="apunte" style="margin-top:10px">Esto es tu cartera de HOY, no cambia con
      el año elegido. Lo que no tiene negocio cargado va estimado con tus puntas.</p>`);
}

function indicadorPuntas(negocios, activos) {
  const r = ventaVsAlquiler(negocios, activos);
  if (!r.puntasTotales) return "";
  return tarjeta("Puntas y tickets", "tu volumen real de trabajo",
    html`<div class="datos">
      <div class="dato"><span class="dato-nombre">Puntas totales</span><span class="dato-valor">${r.puntasTotales}</span></div>
      <div class="dato"><span class="dato-nombre">Puntas en venta</span><span class="dato-valor">${r.venta.puntas} · ${decimal(r.venta.puntasPromedio)} por negocio</span></div>
      <div class="dato"><span class="dato-nombre">Puntas en alquiler</span><span class="dato-valor">${r.alquiler.puntas} · ${decimal(r.alquiler.puntasPromedio)} por negocio</span></div>
      <div class="dato"><span class="dato-nombre">Ticket mediano de venta</span><span class="dato-valor">${plata(r.venta.ticket)}</span></div>
      <div class="dato"><span class="dato-nombre">Ticket mediano de alquiler</span><span class="dato-valor">${plata(r.alquiler.ticket)}</span></div>
    </div>`);
}

function indicadorPlazos(negocios, activos) {
  const p = plazos(negocios, activos);
  if (!p.venta && !p.alquiler) return "";
  const dias = (d) => (d ? `${d} días` : "—");
  return tarjeta("Cuánto tardás en cerrar", "mediana, de captación a firma",
    html`<div class="datos">
      <div class="dato"><span class="dato-nombre">Venta</span><span class="dato-valor">${dias(p.venta)}</span></div>
      <div class="dato"><span class="dato-nombre">Alquiler</span><span class="dato-valor">${dias(p.alquiler)}</span></div>
      <div class="dato"><span class="dato-nombre">Hasta el boleto (venta)</span><span class="dato-valor">${dias(p.boleto)}</span></div>
    </div>`);
}

/* Los indicadores que el usuario dejo prendidos. La eleccion vive en el menu de arriba.

   Reemplaza a la vieja tarjeta "Como trabajas", que era una lista fija de seis datos. */
function indicadoresElegidos(estado, negocios, cartera, ajustes, activos, preferencias) {
  const elegidos = new Set(preferencias.indicadores);
  const arma = {
    venta_alquiler: () => indicadorVentaAlquiler(negocios, activos),
    origenes: () => indicadorOrigenes(negocios, activos, preferencias),
    barrios: () => indicadorBarrios(negocios, activos, preferencias),
    meses: () => indicadorMeses(negocios, activos, estado.hoy),
    dependencia: () => indicadorDependencia(negocios, activos),
    cartera_canal: () => indicadorCarteraCanal(cartera, negocios, ajustes, preferencias),
    puntas: () => indicadorPuntas(negocios, activos),
    plazos: () => indicadorPlazos(negocios, activos),
  };

  const cuerpo = prefs.INDICADORES
    .filter((i) => elegidos.has(i.clave) && arma[i.clave])
    .map((i) => arma[i.clave]())
    .filter(Boolean)
    .join("");

  if (!cuerpo) return document.createDocumentFragment();
  return nodo(cuerpo);
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
    <section class="tarjeta">
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
