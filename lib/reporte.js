/* El reporte descargable (§8.6).

   Es un HTML de una sola pieza: sin hojas de estilo de afuera, sin scripts, sin fuentes
   remotas. Se abre en cualquier teléfono o computadora aunque no haya internet, y se
   manda por WhatsApp como archivo. Las graficas van en SVG dibujado a mano por eso mismo:
   una libreria de graficas obligaria a tener conexion para verlo. */

import { capas, ritmo, metricas, porAnio, porMes, nivelRemax, comparativaCategorias } from "./salud.js";
import { recomendaciones, contarPendientes } from "./recomendaciones.js";
import { escapar } from "./formato.js";

const monto = (n) => (n === null || n === undefined ? "—" : Math.round(n).toLocaleString("es-UY"));
const porcentaje = (n) => (n === null || n === undefined ? "—" : `${(n * 100).toFixed(1).replace(".", ",")}%`);

const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

/* Barras en SVG. Coordenadas calculadas a mano: es la unica forma de que el archivo se
   vea igual sin bajar nada. */
export function barras(datos, { alto = 150, color = "#0043ff", moneda = true } = {}) {
  const ancho = 640;
  const margen = { arriba: 18, abajo: 26, lado: 4 };
  const util = alto - margen.arriba - margen.abajo;
  const tope = Math.max(...datos.map((d) => d.valor), 1);
  const paso = ancho / datos.length;
  const anchoBarra = Math.max(6, paso * 0.62);

  const piezas = datos.map((d, i) => {
    const altura = Math.max(1, (d.valor / tope) * util);
    const x = i * paso + (paso - anchoBarra) / 2;
    const y = margen.arriba + util - altura;
    const etiqueta = d.valor
      ? `<text x="${(x + anchoBarra / 2).toFixed(1)}" y="${(y - 5).toFixed(1)}" text-anchor="middle" font-size="10" fill="#5d6880">${
          moneda ? monto(d.valor) : d.valor}</text>`
      : "";
    return `${etiqueta}<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${anchoBarra.toFixed(1)}" height="${altura.toFixed(1)}" rx="3" fill="${d.destacado ? color : "#b6c8ff"}"/>` +
      `<text x="${(x + anchoBarra / 2).toFixed(1)}" y="${alto - 8}" text-anchor="middle" font-size="10" fill="#5d6880">${escapar(d.nombre)}</text>`;
  });

  return `<svg viewBox="0 0 ${ancho} ${alto}" width="100%" height="${alto}" role="img">${piezas.join("")}</svg>`;
}

function tabla(filas) {
  return `<table>${filas
    .map(([nombre, valor]) => `<tr><th>${escapar(nombre)}</th><td>${escapar(String(valor))}</td></tr>`)
    .join("")}</table>`;
}

const ESTILO = `
:root{color-scheme:light}
*{box-sizing:border-box}
body{margin:0;padding:24px 18px 60px;background:#f6f8fc;color:#0b0f1a;
  font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
  font-size:15px;line-height:1.5;-webkit-text-size-adjust:100%}
main{max-width:720px;margin:0 auto}
h1{font-size:28px;letter-spacing:-.02em;margin:0 0 4px}
h2{font-size:18px;letter-spacing:-.01em;margin:0 0 12px}
p.sub{color:#5d6880;font-size:13px;margin:0}
section{background:#fff;border:1px solid #e3e8f2;border-radius:16px;padding:18px;margin:14px 0}
.heroe{font-size:44px;font-weight:800;letter-spacing:-.03em;line-height:1;margin:8px 0 4px;
  font-variant-numeric:tabular-nums}
.chico{color:#5d6880;font-size:13px}
table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}
th{text-align:left;font-weight:400;color:#5d6880;font-size:13.5px;padding:9px 0;
  border-bottom:1px solid #e3e8f2}
td{text-align:right;font-weight:700;padding:9px 0;border-bottom:1px solid #e3e8f2}
tr:last-child th,tr:last-child td{border-bottom:none}
.pista{position:relative;height:30px;background:#f6f8fc;border:1px solid #e3e8f2;
  border-radius:9px;overflow:hidden;margin:6px 0 10px}
.relleno{height:100%;background:#0043ff}
.relleno.mal{background:#ff1200}
.marca{position:absolute;top:0;bottom:0;width:3px;background:#0b0f1a}
.pies{display:flex;justify-content:space-between;font-size:12px;color:#5d6880}
.reco{border-left:3px solid #0043ff;background:#eef3ff;border-radius:0 12px 12px 0;
  padding:12px 14px;margin:10px 0}
.reco.rojo{border-color:#ff1200;background:#fff0ee}
.reco b{display:block;margin-bottom:3px}
.capa{display:flex;justify-content:space-between;gap:12px;padding:11px 0;
  border-top:1px solid #e3e8f2}
.capa:first-child{border-top:none}
.detalle{font-size:12.5px;color:#5d6880;margin:2px 0 0}
footer{text-align:center;color:#5d6880;font-size:12px;margin-top:24px}
`;

const ROJAS = new Set(["falta_volumen", "categoria", "concentracion", "trabadas"]);

export function armarReporte(datos, anio, hoy, { nombre = "Juan Andrés Otero", oficina = "RE/MAX Único" } = {}) {
  const { negocios, cartera, ajustes } = datos;
  const c = capas(negocios, cartera, ajustes, anio);
  const objetivo = (ajustes.objetivo_personal || {})[anio] || 0;
  const r = ritmo(c.cobrado.facturacion, objetivo, anio, hoy);
  const m = metricas(negocios, anio);
  const anios = porAnio(negocios);
  const meses = porMes(negocios, anio);
  const nivel = nivelRemax(c.cobrado.facturacion, ajustes.niveles_remax);
  const cats = comparativaCategorias(negocios, ajustes, anio, hoy);

  const eventos = (datos.eventos || []).filter((e) => {
    const atendidos = new Set((datos.mis_datos || {}).eventos_atendidos || []);
    return !atendidos.has(e.id) && !e.atendido;
  });
  const consejos = recomendaciones(datos, anio, hoy, contarPendientes(negocios, eventos));

  const partes = [];

  partes.push(`<section>
    <p class="sub">${escapar(nombre)} · ${escapar(oficina)}</p>
    <h1>¿Cómo venimos?</h1>
    <p class="sub">Año ${escapar(anio)} · datos al ${escapar(hoy)}</p>
    <p class="heroe">${monto(c.cobrado.ganancia)}</p>
    <p class="chico">a tu bolsillo · <b>${monto(c.cobrado.facturacion)}</b> facturados
      · ${c.cobrado.negocios} ${c.cobrado.negocios === 1 ? "negocio" : "negocios"}</p>
    <p class="chico" style="margin-top:14px">Si cierra todo lo que está en negociación y
      reservado: <b>${monto(c.cobrado.ganancia + c.avanzado.ganancia)}</b> a tu bolsillo,
      ${monto(c.cobrado.facturacion + c.avanzado.facturacion)} facturados.</p>
  </section>`);

  if (r) {
    const relleno = Math.min(100, r.avance * 100);
    const marca = Math.min(100, r.calendario * 100);
    partes.push(`<section>
      <h2>Ritmo contra el calendario</h2>
      <div class="pista">
        <div class="relleno ${r.aRitmo ? "" : "mal"}" style="width:${relleno.toFixed(1)}%"></div>
        <div class="marca" style="left:${marca.toFixed(1)}%"></div>
      </div>
      <div class="pies"><span>${porcentaje(r.avance)} del objetivo</span><span>${porcentaje(r.calendario)} del año</span></div>
      <p class="chico" style="margin:10px 0 12px"><b>${r.aRitmo ? "Vas a ritmo." : "Vas atrasado."}</b></p>
      ${tabla([
        [`Objetivo ${anio}`, monto(objetivo)],
        ["Te faltan", monto(r.falta)],
        ["Por mes, para llegar", monto(r.porMes)],
        ["A fin de año, a este paso", monto(r.proyeccion)],
        ["Si cierra toda tu cartera", monto(c.total.facturacion)],
        [nivel.siguiente ? `Falta para ${nivel.siguiente.nombre}` : "Nivel RE/MAX", nivel.siguiente ? monto(nivel.falta) : (nivel.actual ? nivel.actual.nombre : "—")],
      ])}
    </section>`);
  }

  const nombres = (g) => g.detalle.map((x) => x.direccion || x.barrio || x.id).filter(Boolean);
  partes.push(`<section>
    <h2>De dónde sale la plata</h2>
    <div class="capa"><div><b>Cobrado</b><p class="detalle">${c.cobrado.negocios} negocios cerrados</p></div>
      <div style="text-align:right"><b>${monto(c.cobrado.facturacion)}</b><p class="detalle">${monto(c.cobrado.ganancia)} tuyos</p></div></div>
    <div class="capa"><div><b>Reservado</b><p class="detalle">${escapar(nombres(c.reservado).join(", ") || "nada reservado")}</p></div>
      <div style="text-align:right"><b>${monto(c.reservado.facturacion)}</b><p class="detalle">${monto(c.reservado.ganancia)} tuyos</p></div></div>
    <div class="capa"><div><b>En negociación</b><p class="detalle">${escapar(nombres(c.negociacion).join(", ") || "nada en negociación")}</p></div>
      <div style="text-align:right"><b>${monto(c.negociacion.facturacion)}</b><p class="detalle">${monto(c.negociacion.ganancia)} tuyos</p></div></div>
    <div class="capa"><div><b>Publicado</b><p class="detalle">${escapar(nombres(c.publicado).join(", ") || "sin propiedades publicadas")}</p></div>
      <div style="text-align:right"><b>${monto(c.publicado.facturacion)}</b><p class="detalle">${monto(c.publicado.ganancia)} tuyos</p></div></div>
    <div class="capa"><div><b>Si todo cierra</b></div>
      <div style="text-align:right"><b>${monto(c.total.facturacion)}</b><p class="detalle">${monto(c.total.ganancia)} tuyos</p></div></div>
  </section>`);

  partes.push(`<section>
    <h2>Tu ganancia mes a mes en ${escapar(anio)}</h2>
    ${barras(meses.map((x) => ({ nombre: MESES[x.mes - 1], valor: x.ganancia, destacado: true })))}
  </section>`);

  if (anios.length) {
    partes.push(`<section>
      <h2>Tu carrera</h2>
      ${barras(anios.map((a) => ({ nombre: a.anio, valor: a.facturacion, destacado: a.anio === anio })))}
      <p class="chico">${monto(anios.reduce((t, a) => t + a.facturacion, 0))} facturados en total ·
        ${monto(anios.reduce((t, a) => t + a.ganancia, 0))} de ganancia</p>
    </section>`);
  }

  partes.push(`<section>
    <h2>Cómo trabajaste este año</h2>
    ${tabla([
      ["Negocios cerrados", `${m.total} · ${m.ventas} venta / ${m.alquileres} alquiler`],
      /* CUANTAS NEGOCIACIONES SE TE CAYERON. Dos agentes con la misma facturacion no son
         iguales si uno cierra ocho de cada diez negociaciones y el otro cinco. */
      ["Negociaciones que se cayeron", m.terminados
        ? `${m.caidos} de ${m.terminados} · ${porcentaje(m.pctCaidos)}`
        : "—"],
      ["Ticket mediano de venta", monto(m.ticketVenta)],
      ["Ticket mediano de alquiler", monto(m.ticketAlquiler)],
      ["Comisión efectiva sobre el precio", porcentaje(c.ratios.venta.fact)],
      ["Puntas por negocio", m.puntasPromedio.toFixed(2).replace(".", ",")],
      ["De inicio a firma (venta)", m.plazoVenta ? `${m.plazoVenta} días` : "—"],
      ["De inicio a boleto", m.plazoBoleto ? `${m.plazoBoleto} días` : "—"],
      ["Barrio que más te dio", m.barrios[0] ? m.barrios[0].nombre : "—"],
      ["Canal que más te dio", m.origenes[0] ? `${m.origenes[0].nombre} · ${porcentaje(m.origenes[0].porcentaje)}` : "—"],
    ])}
  </section>`);

  if (cats.length) {
    partes.push(`<section>
      <h2>Tu categoría</h2>
      ${tabla(cats.map((x) => [
        `${x.categoria} · ${Math.round(x.split * 100)}%${x.actual ? " (la tuya)" : ""}`,
        `${monto(x.neto)}${x.diferencia ? ` (${x.diferencia > 0 ? "+" : ""}${monto(x.diferencia)})` : ""}`,
      ]))}
      <p class="chico" style="margin-top:10px">Ganancia neta del año, ya descontado el fee mensual.</p>
    </section>`);
  }

  if (consejos.length) {
    partes.push(`<section>
      <h2>Qué hacer para llegar</h2>
      ${consejos.map((x) => `<div class="reco ${ROJAS.has(x.clave) ? "rojo" : ""}">
        <b>${escapar(x.titulo)}</b><span>${escapar(x.detalle)}</span></div>`).join("")}
    </section>`);
  }

  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>¿Cómo venimos? · ${escapar(anio)}</title>
<style>${ESTILO}</style></head>
<body><main>${partes.join("")}
<footer>Generado el ${escapar(hoy)} por “¿Cómo venimos?”</footer>
</main></body></html>`;
}

export const nombreArchivo = (anio, hoy) => `como-venimos-${anio}-${hoy}.html`;
