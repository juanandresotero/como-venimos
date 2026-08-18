/* Salud del Negocio: la plata del recorte elegido, el ritmo contra el calendario y los
   indicadores que el usuario decide mirar.

   La barra de ritmo sigue siendo el elemento central: muestra el avance real contra un
   marcador de calendario, y la distancia entre los dos es toda la informacion.

   Arriba de todo hay un selector de años. Lo que cambia con el año y lo que NO:

     - Cobrado, ritmo, graficas e indicadores: se recortan al año elegido.
     - Cartera viva (reservado / en negociacion / potencial): NO. Esa es la de HOY y no
       tiene version historica. Si el recorte no incluye el año en curso, esas tarjetas se
       esconden en vez de mostrar la cartera de hoy bajo un titulo de 2023, que seria
       directamente mentira. */

import { capas, ritmo, porAnio, comparativaCategorias } from "../lib/salud.js";
import {
  aniosDisponibles, cerradosDe, etiquetaDeAnios, mesesDe, mesesPorAnio, acumular,
  mejorYPeorMes, barrios, porOrigen, ventaVsAlquiler, concentracion, carteraPorCanal,
  plazos, MESES,
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

/* Si el menu de indicadores estuviera abierto o cerrado segun el HTML, cada tilde lo
   cerraria: tildar redibuja la pantalla entera y volveria a nacer cerrado. Habria que
   abrirlo de nuevo para cada uno de los nueve. Vive afuera del dibujado a proposito. */
let menuAbierto = false;

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

  const guardarPreferencias = (cambios) => {
    prefs.guardar({ ...preferencias, ...cambios });
    estado.redibujar();
  };

  const trozo = document.createDocumentFragment();
  trozo.append(selectorDeAnios(disponibles, preferencias.anios, anioActual, guardarPreferencias));
  trozo.append(cabecera(etiqueta, cobrado, incluyeHoy ? c : null));
  if (r) trozo.append(barraDeRitmo(r, objetivo, c, unSoloAnio, incluyeHoy, cerroElAnio));

  if (incluyeHoy) {
    trozo.append(tresCapas(c));
    const eventosSinAtender = (estado.datos.eventos || []).filter((e) => {
      const atendidos = new Set((estado.datos.mis_datos || {}).eventos_atendidos || []);
      return !atendidos.has(e.id) && !e.atendido;
    });
    const consejos = recomendaciones(
      estado.datos, anioActual, estado.hoy, contarPendientes(negocios, eventosSinAtender)
    );
    if (consejos.length) trozo.append(queHacer(consejos));
  }

  trozo.append(graficaMensual(negocios, activos, estado.hoy, preferencias, guardarPreferencias));
  const anios = porAnio(negocios);
  if (anios.length) trozo.append(graficaAnual(anios, activos, preferencias, guardarPreferencias));

  trozo.append(seccionIndicadores(estado, negocios, cartera, ajustes, activos, etiqueta,
    preferencias, guardarPreferencias));

  if (incluyeHoy && c.publicado.detalle.length) trozo.append(propiedadesUsadas(c.publicado, estado));
  trozo.append(descargarReporte(estado, anioActual));
  return trozo;
}

/* ---------- Selector de años ---------- */

function selectorDeAnios(disponibles, elegidos, anioActual, guardar) {
  const activos = new Set(elegidos === null ? [anioActual] : elegidos);
  const todos = elegidos !== null && elegidos.length === 0;

  const seccion = nodo(html`
    <section class="tarjeta tarjeta-apretada">
      <div class="tags">
        ${disponibles.map((a) => html`
          <button class="tag ${activos.has(a) && !todos ? "activo" : ""}" data-anio="${a}">
            ${a}
          </button>`).join("")}
        <button class="tag ${todos ? "activo" : ""}" data-anio="todos">Todos</button>
      </div>
    </section>
  `);

  for (const boton of seccion.querySelectorAll("[data-anio]")) {
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
  return seccion;
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

const ROJAS = new Set(["falta_volumen", "categoria", "concentracion", "trabadas"]);

function queHacer(consejos) {
  return nodo(html`
    <section class="tarjeta">
      <div class="tarjeta-titulo">
        <h2 class="titulo">Qué hacer</h2>
        <span class="apunte">con tus propios números</span>
      </div>
      ${consejos.map((c) => html`
        <div class="consejo ${ROJAS.has(c.clave) ? "rojo" : ""}">
          <p class="consejo-titulo">${escapar(c.titulo)}</p>
          <p class="consejo-detalle">${escapar(c.detalle)}</p>
        </div>`).join("")}
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
      ${superponer ? html`<p class="apunte" style="margin-top:10px">
           Comparando ${activos.length} años. Con <strong>Todos</strong> se suman todos los
           eneros, todos los febreros y así.</p>` : ""}
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
  const frágil = filas.filter((f) => f.parte > 0.6 && f.negocios >= 3);
  return tarjeta("De cuánto dependés", "peso de tus 3 mejores negocios", cuerpo,
    frágil.length ? html`<p class="aviso">En ${frágil.map((f) => f.anio).join(", ")} tres
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

function indicadorCategoria(negocios, ajustes, activos, hoy) {
  const anio = activos.length === 1 ? activos[0] : hoy.slice(0, 4);
  const cats = comparativaCategorias(negocios, ajustes, anio, hoy);
  if (!cats.length) return "";
  const mejor = [...cats].sort((a, b) => b.neto - a.neto)[0];
  const actual = cats.find((c) => c.actual);
  const filas = cats.map((c) => html`
    <div class="dato">
      <span class="dato-nombre">${escapar(c.categoria)} · ${Math.round(c.split * 100)}%${c.actual ? " (tu categoría)" : ""}</span>
      <span class="dato-valor" style="${c.diferencia > 0 ? "color:var(--azul)" : ""}">
        ${plata(c.neto)}${c.diferencia ? ` (${c.diferencia > 0 ? "+" : ""}${plata(c.diferencia)})` : ""}
      </span>
    </div>`).join("");
  return tarjeta("Tu categoría", `ganancia neta de ${anio}`, html`<div class="datos">${filas}</div>`,
    mejor && actual && mejor.categoria !== actual.categoria
      ? html`<p class="aviso">Con <strong>${escapar(mejor.categoria)}</strong> habrías ganado
          <strong>${plata(mejor.neto - actual.neto)}</strong> más, descontando el fee mensual.</p>`
      : "");
}

/* Reemplaza a la vieja tarjeta "Como trabajas", que era una lista fija de seis datos.
   Ahora el usuario elige cuales quiere ver y la eleccion queda guardada, asi la pantalla
   no crece hasta volverse un deposito de numeros que no se mira. */
function seccionIndicadores(estado, negocios, cartera, ajustes, activos, etiqueta,
  preferencias, guardar) {
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
    categoria: () => indicadorCategoria(negocios, ajustes, activos, estado.hoy),
  };

  const cuerpo = prefs.INDICADORES
    .filter((i) => elegidos.has(i.clave))
    .map((i) => arma[i.clave]())
    .filter(Boolean)
    .join("");

  const usaReparto = ["origenes", "barrios", "cartera_canal"].some((c) => elegidos.has(c));

  const seccion = nodo(html`
    <div class="indicadores">
      <div class="tarjeta tarjeta-apretada">
        <div class="tarjeta-titulo" style="margin-bottom:0">
          <h2 class="titulo">Cómo trabajás</h2>
          <button class="boton boton-chico" id="elegir-indicadores">
            ${menuAbierto ? "Listo" : "Elegir"}
          </button>
        </div>
        <p class="apunte" style="margin-top:6px">
          ${elegidos.size} de ${prefs.INDICADORES.length} · ${escapar(etiqueta)}
        </p>
        <div class="menu-indicadores" id="menu-indicadores" ${menuAbierto ? "" : "hidden"}>
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
      </div>
      ${cuerpo}
    </div>
  `);

  const menu = seccion.getElementById("menu-indicadores");
  seccion.getElementById("elegir-indicadores").addEventListener("click", (e) => {
    menuAbierto = menu.hidden;
    menu.hidden = !menuAbierto;
    e.currentTarget.textContent = menuAbierto ? "Listo" : "Elegir";
  });

  for (const casilla of seccion.querySelectorAll("[data-indicador]")) {
    casilla.addEventListener("change", () => {
      const clave = casilla.dataset.indicador;
      const nuevos = casilla.checked
        ? [...preferencias.indicadores, clave]
        : preferencias.indicadores.filter((c) => c !== clave);
      guardar({ indicadores: nuevos });
    });
  }

  // El tipo de grafica del reparto solo se ofrece si hay algun indicador que lo use.
  if (usaReparto) {
    const ranura = seccion.querySelector(".ranura-reparto");
    ranura.append(nodo(html`<p class="apunte" style="margin:10px 0 6px">Barrios y canales</p>`));
    ranura.append(selectorDeTipo("graficoReparto", preferencias.graficoReparto, guardar));
  }
  return seccion;
}

/* ---------- Lo potencial y el reporte ---------- */

/* Los cuatro momentos del camino de la plata. Los tres que SUMAN — cobrado, reservado y
   en negociacion — y abajo, separado, lo potencial: lo publicado que todavia no se movio.

   Lo potencial no suma a proposito. Es lo que hay dando vueltas, no lo que esta por
   entrar, y mezclarlo daba un numero que no se podia leer de un vistazo. */
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
    </section>
  `);
}

function propiedadesUsadas(publicado, estado) {
  const filas = publicado.detalle
    .map(
      (p) => html`
      <button class="fila" data-propiedad="${escapar(p.entity_id)}">
        <span class="fila-cuerpo">
          <span class="fila-titulo">${escapar(p.direccion || "Sin dirección")}</span>
          <span class="fila-sub">
            ${plata(p.precio)}${p.estimado ? ` × ${pct(p.pct)}` : " · con tu negocio ya cargado"}
          </span>
        </span>
        <span class="fila-plata">
          <span class="cifra cifra-media">${plata(p.ganancia)}</span>
          <span class="fila-sub">${plata(p.facturacion)} fact.</span>
        </span>
      </button>`
    )
    .join("");

  const muestra = publicado.detalle.find((p) => p.estimado);
  const seccion = nodo(html`
    <section class="tarjeta">
      <div class="tarjeta-titulo">
        <h2 class="titulo">Lo potencial, una por una</h2>
        <span class="apunte">${publicado.cantidad} propiedades</span>
      </div>
      <div class="lista">${filas}</div>
      ${muestra
        ? html`<p class="apunte" style="margin-top:12px">
             El <strong>${pct(muestra.pct)}</strong> sale de tu propia forma de cerrar:
             ${pct(muestra.unaPunta)} de comisión por punta, y cerrás con
             <strong>${decimal(muestra.puntas)} puntas</strong> en promedio. De ahí se
             descuenta tu tajada de hoy. Si alguna no debería contar, entrá y apagala.
           </p>`
        : ""}
    </section>
  `);
  for (const boton of seccion.querySelectorAll("[data-propiedad]")) {
    boton.addEventListener("click", () => estado.irA("propiedad", boton.dataset.propiedad));
  }
  return seccion;
}

/* El reporte se arma en el momento y se baja como archivo. No hay servidor atras: es el
   mismo navegador el que escribe el HTML. */
function descargarReporte(estado, anio) {
  const seccion = nodo(html`
    <section class="tarjeta">
      <h2 class="titulo" style="font-size:17px;margin-bottom:6px">Llevate el reporte</h2>
      <p class="apunte" style="margin-bottom:12px">
        Un archivo con todo esto adentro: capas, ritmo, gráficas y qué hacer para llegar.
        Se abre en cualquier teléfono, aunque no haya señal.
      </p>
      <div class="botonera" style="margin-top:0">
        <button class="boton boton-primario" id="bajar-reporte">Descargar</button>
        <button class="boton" id="compartir-reporte">Compartir</button>
      </div>
      <p class="apunte" id="aviso-reporte" style="margin-top:10px"></p>
    </section>
  `);

  const construir = () => armarReporte(estado.datos, anio, estado.hoy);
  const aviso = seccion.getElementById("aviso-reporte");

  seccion.getElementById("bajar-reporte").addEventListener("click", () => {
    const blob = new Blob([construir()], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const enlace = document.createElement("a");
    enlace.href = url;
    enlace.download = nombreArchivo(anio, estado.hoy);
    enlace.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    aviso.textContent = "Descargado.";
  });

  seccion.getElementById("compartir-reporte").addEventListener("click", async () => {
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

  return seccion;
}
