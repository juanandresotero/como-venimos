/* Los indicadores del tablero, en dos tamaños.

     RESUMEN   la tarjeta que se ve en Salud: el titular y nada más.
     DETALLE   la pantalla entera de ese indicador, con todo lo que quedó afuera.

   Los dos salen de la misma cuenta, así que no hay forma de que digan cosas distintas.
   El resumen agrupa la cola larga en "otros 30 barrios" para que se pueda leer de un
   vistazo; el detalle no agrupa nada, porque para eso se entra.

   Regla que vale para todo el archivo: cada número dice sobre cuántos negocios está
   hecho. Con 81 cierres en cinco años, un promedio de dos negocios parece un dato y es
   una anécdota. */

import {
  mesesDe, mejorYPeorMes, barrios, porOrigen, ventaVsAlquiler, concentracion,
  carteraPorCanal, plazos, cerradosDe, MESES,
} from "../lib/indicadores.js";
import { torta, colorear, agruparCola } from "../lib/graficos.js";
import { plata, plataUSD, pct, escapar, fechaCorta } from "../lib/formato.js";

const html = (c, ...v) => c.reduce((t, x, i) => t + x + (v[i] ?? ""), "");

export const cuantos = (n, uno = "negocio", muchos = "negocios") =>
  `${n} ${n === 1 ? uno : muchos}`;

export const decimal = (n, cifras = 2) => (n || 0).toFixed(cifras).replace(".", ",");

/* Una lista de barras horizontales o una torta, segun lo que el usuario haya elegido. Es
   el mismo dato: la torta se lee mejor para "cuanto pesa cada uno" y la barra para
   comparar valores. */
function reparto(filas, preferencias, opciones = {}) {
  const unidad = opciones.unidad || "negocios";
  const cuantas = opciones.cuantas || 5;
  const pintadas = colorear(
    opciones.agrupar === false ? [...filas] : agruparCola(filas, cuantas), cuantas
  );
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

const datos = (filas) => html`<div class="datos">${filas.filter(Boolean).join("")}</div>`;
const dato = (nombre, valor, pie) => html`
  <div class="dato">
    <span class="dato-nombre">${nombre}</span>
    <span class="dato-valor">${valor}${pie ? html`<br><span class="apunte">${pie}</span>` : ""}</span>
  </div>`;

/* ---------- Venta vs alquiler ---------- */

function ventaAlquiler(ctx) {
  const r = ventaVsAlquiler(ctx.negocios, ctx.activos);
  if (!r.venta.negocios && !r.alquiler.negocios) return null;

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

  const titular = r.veces > 1
    ? html`<p class="aviso">Una venta te deja <strong>${decimal(r.veces, 1)} veces</strong> lo
        que te deja un alquiler. Los alquileres son ${pct(r.alquiler.parteDeLosNegocios)} de
        tus cierres y ${pct(r.alquiler.parteDeLaPlata)} de tu plata.</p>`
    : "";

  return {
    titulo: "Venta vs alquiler",
    apunte: "lo que deja cada una",
    resumen: fila(r.venta, "Venta") + fila(r.alquiler, "Alquiler") + titular,
    detalle: () => {
      const porAnio = (ctx.aniosDisponibles || []).map((anio) => {
        const v = ventaVsAlquiler(ctx.negocios, [anio]);
        if (!v.venta.negocios && !v.alquiler.negocios) return "";
        return dato(anio,
          `${plata(v.venta.ganancia + v.alquiler.ganancia)}`,
          `${v.venta.negocios} venta · ${v.alquiler.negocios} alquiler`);
      });
      return fila(r.venta, "Venta") + fila(r.alquiler, "Alquiler") + titular
        + html`<h3 class="titulo" style="font-size:15px;margin:22px 0 10px">Cada una en detalle</h3>`
        + datos([
          dato("Ticket mediano de venta", plata(r.venta.ticket)),
          dato("Ticket mediano de alquiler", plata(r.alquiler.ticket)),
          dato("Puntas en venta", `${r.venta.puntas}`, `${decimal(r.venta.puntasPromedio)} por negocio`),
          dato("Puntas en alquiler", `${r.alquiler.puntas}`, `${decimal(r.alquiler.puntasPromedio)} por negocio`),
          dato("Facturado en venta", plata(r.venta.facturacion)),
          dato("Facturado en alquiler", plata(r.alquiler.facturacion)),
        ])
        + html`<h3 class="titulo" style="font-size:15px;margin:22px 0 10px">Año por año</h3>`
        + datos(porAnio)
        + html`<p class="apunte" style="margin-top:14px">
            La ganancia por negocio es lo que de verdad separa una cosa de la otra. Un
            alquiler no es "medio negocio": es una quinta parte, y ocupa una captación,
            una publicación y un cierre igual que una venta.</p>`;
    },
  };
}

/* ---------- De donde vino la plata ---------- */

function origenes(ctx) {
  const filas = porOrigen(ctx.negocios, ctx.activos);
  if (!filas.length) return null;
  const total = filas.reduce((t, f) => t + f.ganancia, 0);

  return {
    titulo: "De dónde vino la plata",
    apunte: "por canal de captación",
    resumen: reparto(filas, ctx.preferencias),
    detalle: () => reparto(filas, ctx.preferencias, { agrupar: false, cuantas: filas.length })
      + html`<h3 class="titulo" style="font-size:15px;margin:22px 0 10px">Cuánto paga cada canal</h3>`
      + datos(filas.map((f) => dato(escapar(f.nombre), plata(f.porNegocio),
          `por negocio · ${cuantos(f.negocios)}`)))
      + html`<p class="apunte" style="margin-top:14px">
          El canal que más plata trae no es siempre el que mejor paga por negocio. Los
          referidos de colegas dejan menos por operación porque se comparte la comisión,
          pero llegan hechos: no hubo que captarlos. Los tuyos (base de datos, redes,
          cliente antiguo) pagan completo y dependen de vos.</p>`
      + (total ? html`<p class="apunte" style="margin-top:8px">
          Total del recorte: <strong>${plata(total)}</strong> en ${cuantos(
            filas.reduce((t, f) => t + f.negocios, 0))}.</p>` : ""),
  };
}

/* ---------- Barrios ---------- */

function barriosIndicador(ctx) {
  const b = barrios(ctx.negocios, ctx.activos);
  if (!b.total) return null;

  const remate = html`
    ${datos([
      dato("Barrios trabajados", `${b.total}`),
      dato("De una sola vez", `${b.unaVez}`),
      b.masPlata ? dato("El que más plata te dio",
        `${escapar(b.masPlata.nombre)} · ${plata(b.masPlata.ganancia)}`,
        cuantos(b.masPlata.negocios)) : "",
      b.mejorPorNegocio ? dato("El que mejor te paga por negocio",
        `${escapar(b.mejorPorNegocio.nombre)} · ${plata(b.mejorPorNegocio.porNegocio)}`,
        cuantos(b.mejorPorNegocio.negocios)) : "",
    ])}
    ${b.mejorPorNegocio && b.masPlata && b.mejorPorNegocio.nombre !== b.masPlata.nombre
      ? html`<p class="apunte" style="margin-top:10px">
          El de más plata puede ser un solo negocio grande y no repetirse nunca. El que
          mejor paga por negocio se mide solo entre los que trabajaste
          ${b.minimoParaPromediar} veces o más — ese es el que sirve para decidir.</p>`
      : ""}`;

  return {
    titulo: "Barrios",
    apunte: `top ${Math.min(5, b.top.length)} por repetición`,
    resumen: reparto(b.top, ctx.preferencias, { cuantas: 5 }) + remate,
    detalle: () => remate
      + html`<h3 class="titulo" style="font-size:15px;margin:22px 0 10px">
          Los ${b.total}, de mayor a menor</h3>`
      + datos(b.todos.map((f) => dato(escapar(f.nombre), plata(f.ganancia),
          `${cuantos(f.negocios)} · ${plata(f.porNegocio)} por negocio`)))
      + html`<p class="apunte" style="margin-top:14px">
          Más de la mitad de tus barrios los pisaste una sola vez. Repetir en un barrio
          abarata todo: ya conocés los precios, tenés referencias y el próximo dueño te
          llama a vos. La lista de arriba dice dónde ya empezaste ese camino.</p>`,
  };
}

/* ---------- Mejor y peor mes ---------- */

function meses(ctx) {
  const { mejor, peor, evaluados, empatadosEnPeor } = mejorYPeorMes(
    ctx.negocios, ctx.activos, ctx.hoy);
  if (!mejor) return null;
  const filas = mesesDe(ctx.negocios, ctx.activos, ctx.hoy);
  const sinTerminar = filas.filter((m) => !m.terminado).length;

  const cabeza = datos([
    dato("Tu mejor mes", `${escapar(mejor.nombre)} · ${plata(mejor.ganancia)}`,
      cuantos(mejor.negocios, "cierre", "cierres")),
    dato("El más flojo", `${escapar(peor.nombre)} · ${plata(peor.ganancia)}`,
      cuantos(peor.negocios, "cierre", "cierres")),
  ]);
  const avisos = html`
    ${sinTerminar ? html`<p class="apunte" style="margin-top:10px">
        Quedan ${sinTerminar} ${sinTerminar === 1 ? "mes" : "meses"} sin terminar en el
        recorte: no se juzgan, un mes que no llegó no es un mes malo.</p>` : ""}
    ${empatadosEnPeor > 1 ? html`<p class="apunte" style="margin-top:6px">
        Hay ${empatadosEnPeor} meses empatados abajo. Se eligió el que peor viene en toda
        tu carrera.</p>` : ""}`;

  return {
    titulo: "Mejor y peor mes",
    apunte: `sobre ${cuantos(evaluados, "mes cerrado", "meses cerrados")}`,
    resumen: cabeza + avisos,
    detalle: () => cabeza + avisos
      + html`<h3 class="titulo" style="font-size:15px;margin:22px 0 10px">Los doce</h3>`
      + datos(filas.map((m) => dato(
          `${escapar(m.nombre)}${m.terminado ? "" : " <span class=\"apunte\">— sin terminar</span>"}`,
          m.terminado ? plata(m.ganancia) : "—",
          m.terminado ? cuantos(m.negocios, "cierre", "cierres") : "todavía no llegó")))
      + html`<p class="apunte" style="margin-top:14px">
          Con un solo año elegido esto es casi azar: son menos de dos cierres por mes.
          Elegí <strong>Todos</strong> arriba y ahí sí hay señal — la estacionalidad se ve
          cuando se suman cinco eneros, no uno.</p>`,
  };
}

/* ---------- De cuanto dependes ---------- */

function dependencia(ctx) {
  const filas = concentracion(ctx.negocios, ctx.activos).filter((f) => f.negocios);
  if (!filas.length) return null;
  const fragil = filas.filter((f) => f.parte > 0.6 && f.negocios >= 3);

  const cuerpo = datos(filas.map((f) => dato(
    `${f.anio} · ${cuantos(f.negocios, "cierre", "cierres")}`,
    pct(f.parte), `el mejor solo: ${pct(f.parteDelMejor)}`)));
  const aviso = fragil.length
    ? html`<p class="aviso">En ${fragil.map((f) => f.anio).join(", ")} tres negocios
        trajeron más de la mitad del año. Si uno se cae, se cae el año.</p>`
    : "";

  return {
    titulo: "De cuánto dependés",
    apunte: "peso de tus 3 mejores negocios",
    resumen: cuerpo + aviso,
    detalle: () => {
      const porAnio = filas.map((f) => {
        const mejores = cerradosDe(ctx.negocios, [f.anio])
          .sort((a, b) => (b.ganancia || 0) - (a.ganancia || 0))
          .slice(0, 3);
        return html`
          <h3 class="titulo" style="font-size:15px;margin:22px 0 10px">
            ${f.anio} · los 3 más grandes fueron ${pct(f.parte)} del año
          </h3>
          ${datos(mejores.map((n) => dato(
            escapar(n.direccion || n.barrio || "Sin dirección"),
            plata(n.ganancia),
            `${escapar(n.tipo_negocio || "")} · ${fechaCorta(n.fecha_fin, Number(f.anio))}`)))}`;
      }).join("");
      return cuerpo + aviso + porAnio
        + html`<p class="apunte" style="margin-top:14px">
            Depender de pocos negocios no es un error: en esta actividad una venta grande
            cambia el año. Pero conviene saberlo en junio y no en diciembre, porque es la
            diferencia entre salir a buscar volumen a tiempo o enterarse cuando ya no hay
            margen para reaccionar.</p>`;
    },
  };
}

/* ---------- Cartera viva por canal ---------- */

function carteraCanal(ctx) {
  const filas = carteraPorCanal(ctx.cartera, ctx.negocios, ctx.ajustes);
  if (!filas.length) return null;
  const nota = html`<p class="apunte" style="margin-top:10px">
    Esto es tu cartera de HOY, no cambia con el año elegido. Lo que no tiene negocio
    cargado va estimado con tus puntas.</p>`;

  return {
    titulo: "Cartera viva por canal",
    apunte: "de dónde va a venir lo que viene",
    resumen: reparto(filas, ctx.preferencias, { unidad: "propiedades" }) + nota,
    detalle: () => reparto(filas, ctx.preferencias,
      { unidad: "propiedades", agrupar: false, cuantas: filas.length }) + nota
      + html`<h3 class="titulo" style="font-size:15px;margin:22px 0 10px">
          Comparado con lo que ya cerraste</h3>`
      + datos(filas.map((f) => {
          const historico = porOrigen(ctx.negocios, null).find((h) => h.nombre === f.nombre);
          return dato(escapar(f.nombre), plata(f.ganancia),
            historico
              ? `en la carrera te dio ${plata(historico.ganancia)} en ${cuantos(historico.negocios)}`
              : "todavía no cerraste ninguno por este canal");
        }))
      + html`<p class="apunte" style="margin-top:14px">
          Si un canal pesa mucho más acá que en tu historia, algo cambió — para bien o
          para mal. Vale la pena mirar por qué.</p>`,
  };
}

/* ---------- Puntas y tickets ---------- */

function puntas(ctx) {
  const r = ventaVsAlquiler(ctx.negocios, ctx.activos);
  if (!r.puntasTotales) return null;
  const cuerpo = datos([
    dato("Puntas totales", `${r.puntasTotales}`),
    dato("Puntas en venta", `${r.venta.puntas}`, `${decimal(r.venta.puntasPromedio)} por negocio`),
    dato("Puntas en alquiler", `${r.alquiler.puntas}`, `${decimal(r.alquiler.puntasPromedio)} por negocio`),
    dato("Ticket mediano de venta", plata(r.venta.ticket)),
    dato("Ticket mediano de alquiler", plata(r.alquiler.ticket)),
  ]);

  return {
    titulo: "Puntas y tickets",
    apunte: "tu volumen real de trabajo",
    resumen: cuerpo,
    detalle: () => cuerpo
      + html`<h3 class="titulo" style="font-size:15px;margin:22px 0 10px">Año por año</h3>`
      + datos((ctx.aniosDisponibles || []).map((anio) => {
          const v = ventaVsAlquiler(ctx.negocios, [anio]);
          if (!v.puntasTotales) return "";
          return dato(anio, `${v.puntasTotales} puntas`,
            `${v.venta.puntas} en venta · ${v.alquiler.puntas} en alquiler`);
        }))
      + html`<p class="apunte" style="margin-top:14px">
          Una punta es un lado de la operación. Cerrar con dos puntas quiere decir que
          pusiste el comprador y el vendedor, y se cobra el doble. Tu promedio de
          <strong>${decimal(r.venta.puntasPromedio)}</strong> en venta es el número con el
          que la app estima lo que va a dejar cada propiedad publicada.</p>`,
  };
}

/* ---------- Plazos ---------- */

function plazosIndicador(ctx) {
  const p = plazos(ctx.negocios, ctx.activos);
  if (!p.venta && !p.alquiler) return null;
  const dias = (d) => (d ? `${d} días` : "—");
  const cuerpo = datos([
    dato("Venta", dias(p.venta)),
    dato("Alquiler", dias(p.alquiler)),
    dato("Hasta el boleto (venta)", dias(p.boleto)),
  ]);

  return {
    titulo: "Cuánto tardás en cerrar",
    apunte: "mediana, de captación a firma",
    resumen: cuerpo,
    detalle: () => cuerpo
      + html`<h3 class="titulo" style="font-size:15px;margin:22px 0 10px">Año por año</h3>`
      + datos((ctx.aniosDisponibles || []).map((anio) => {
          const q = plazos(ctx.negocios, [anio]);
          if (!q.venta && !q.alquiler) return "";
          return dato(anio, dias(q.venta), `venta · alquiler ${dias(q.alquiler)}`);
        }))
      + html`<p class="apunte" style="margin-top:14px">
          Es la <strong>mediana</strong>, no el promedio: una propiedad que tardó tres años
          en venderse no tiene que deformar el número. Sirve para dos cosas — saber cuándo
          una publicación se trabó, y decirle a un dueño cuánto va a esperar de verdad.</p>`,
  };
}

const ARMADORES = {
  venta_alquiler: ventaAlquiler,
  origenes,
  barrios: barriosIndicador,
  meses,
  dependencia,
  cartera_canal: carteraCanal,
  puntas,
  plazos: plazosIndicador,
};

/* Arma uno. Devuelve null si con los datos del recorte no hay nada que mostrar. */
export function armar(clave, ctx) {
  const armador = ARMADORES[clave];
  return armador ? armador(ctx) : null;
}
