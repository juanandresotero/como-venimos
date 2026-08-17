/* Salud del Negocio: las tres capas, el ritmo contra el calendario y las metricas.

   La barra de ritmo es el elemento central: muestra el avance real contra un marcador
   de calendario. La distancia entre los dos es toda la informacion. */

import { capas, ritmo, metricas, porAnio, comparativaCategorias } from "../lib/salud.js";
import { plata, plataUSD, compacto, pct, escapar } from "../lib/formato.js";

const html = (cadenas, ...valores) =>
  cadenas.reduce((t, c, i) => t + c + (valores[i] ?? ""), "");

function nodo(marca) {
  const molde = document.createElement("template");
  molde.innerHTML = marca.trim();
  return molde.content;
}

export function dibujarSalud(estado) {
  const { negocios, cartera, ajustes } = estado.datos;
  const anio = estado.hoy.slice(0, 4);
  const c = capas(negocios, cartera, ajustes, anio);
  const objetivo = (ajustes.objetivo_personal || {})[anio] || 0;
  const r = ritmo(c.capa1.facturacion, objetivo, anio, estado.hoy);
  const m = metricas(negocios, anio);
  const anios = porAnio(negocios);
  const cats = comparativaCategorias(negocios, ajustes, anio, estado.hoy);

  const trozo = document.createDocumentFragment();
  trozo.append(cabecera(anio, c));
  if (r) trozo.append(barraDeRitmo(r, objetivo, c, anio));
  trozo.append(tresCapas(c));
  if (anios.length) trozo.append(graficaAnual(anios, anio));
  trozo.append(metricasDelAnio(m));
  if (cats.length) trozo.append(comparativa(cats));
  if (c.capa3.detalle.length) trozo.append(propiedadesUsadas(c.capa3));
  return trozo;
}

function cabecera(anio, c) {
  return nodo(html`
    <section class="tarjeta">
      <p class="etiqueta">Cobrado en ${anio}</p>
      <p class="cifra cifra-heroe" style="margin:6px 0 4px">${plata(c.capa1.facturacion)}</p>
      <p class="apunte">
        facturado · <strong>${plataUSD(c.capa1.ganancia)}</strong> a tu bolsillo
        · ${c.capa1.negocios} ${c.capa1.negocios === 1 ? "negocio" : "negocios"}
      </p>
    </section>
  `);
}

function barraDeRitmo(r, objetivo, c, anio) {
  const relleno = Math.min(100, r.avance * 100);
  const marca = Math.min(100, r.calendario * 100);
  const veredicto = r.aRitmo ? "Vas a ritmo" : "Vas atrasado";
  return nodo(html`
    <section class="tarjeta">
      <div class="tarjeta-titulo">
        <h2 class="titulo">Ritmo</h2>
        <span class="ritmo-veredicto ${r.aRitmo ? "bien" : "mal"}">${veredicto}</span>
      </div>
      <div class="ritmo">
        <div class="ritmo-pista ${r.aRitmo ? "" : "atrasado"}">
          <div class="ritmo-relleno" style="width:${relleno}%"></div>
          <div class="ritmo-marca" style="left:${marca}%" data-texto="hoy"></div>
        </div>
        <div class="ritmo-pies">
          <span><strong>${pct(r.avance)}</strong> del objetivo</span>
          <span>${pct(r.calendario)} del año</span>
        </div>
      </div>
      <div class="datos" style="margin-top:16px">
        <div class="dato"><span class="dato-nombre">Objetivo ${anio}</span><span class="dato-valor">${plata(objetivo)}</span></div>
        <div class="dato"><span class="dato-nombre">Te faltan</span><span class="dato-valor">${plata(r.falta)}</span></div>
        <div class="dato"><span class="dato-nombre">Por mes, para llegar</span><span class="dato-valor">${plata(r.porMes)}</span></div>
        <div class="dato"><span class="dato-nombre">A fin de año, a este paso</span><span class="dato-valor">${plata(r.proyeccion)}</span></div>
        <div class="dato"><span class="dato-nombre">Si cierra toda tu cartera</span><span class="dato-valor">${plata(c.total.facturacion)}</span></div>
      </div>
      ${r.falta > 0 && c.total.facturacion < objetivo
        ? html`<p class="aviso">Aun cerrando <strong>todo</strong> lo que tenés hoy llegás a
             ${plata(c.total.facturacion)}. Te faltan <strong>${plata(objetivo - c.total.facturacion)}</strong>
             de negocio nuevo para el objetivo.</p>`
        : ""}
    </section>
  `);
}

function tresCapas(c) {
  const total = c.total.facturacion || 1;
  const ancho = (x) => `${(x / total) * 100}%`;
  const fila = (clase, nombre, sub, monto, ganancia) => html`
    <div class="capa">
      <span class="capa-punto ${clase}"></span>
      <span><span class="capa-nombre">${nombre}</span><br><span class="capa-sub">${sub}</span></span>
      <span class="capa-monto">
        <span class="cifra cifra-media">${plata(monto)}</span><br>
        <span class="capa-sub">${plata(ganancia)} tuyos</span>
      </span>
    </div>`;

  return nodo(html`
    <section class="tarjeta">
      <div class="tarjeta-titulo">
        <h2 class="titulo">De dónde sale la plata</h2>
        <span class="apunte">${plataUSD(c.total.facturacion)}</span>
      </div>
      <div class="capas-barra">
        <div class="capas-tramo uno" style="width:${ancho(c.capa1.facturacion)}"></div>
        <div class="capas-tramo dos" style="width:${ancho(c.capa2.facturacion)}"></div>
        <div class="capas-tramo tres" style="width:${ancho(c.capa3.facturacion)}"></div>
      </div>
      ${fila("uno", "Cobrado", `${c.capa1.negocios} negocios cerrados`, c.capa1.facturacion, c.capa1.ganancia)}
      ${fila("dos", "Casi seguro", `${c.capa2.negocios} en curso · reservadas y en negociación`, c.capa2.facturacion, c.capa2.ganancia)}
      ${fila("tres", "Potencial", `${c.capa3.propiedades} propiedades publicadas`, c.capa3.facturacion, c.capa3.ganancia)}
    </section>
  `);
}

function graficaAnual(anios, anioActual) {
  const tope = Math.max(...anios.map((a) => a.facturacion), 1);
  const columnas = anios
    .map(
      (a) => html`
      <div class="barras-columna ${a.anio === anioActual ? "actual" : ""}">
        <span class="barras-tope">${compacto(a.facturacion)}</span>
        <div class="barras-cana" style="height:${(a.facturacion / tope) * 100}%"></div>
        <span class="barras-pie">${a.anio.slice(2)}</span>
      </div>`
    )
    .join("");
  const totalCarrera = anios.reduce((t, a) => t + a.facturacion, 0);
  return nodo(html`
    <section class="tarjeta">
      <div class="tarjeta-titulo">
        <h2 class="titulo">Tu carrera</h2>
        <span class="apunte">${plataUSD(totalCarrera)} facturados</span>
      </div>
      <div class="barras">${columnas}</div>
    </section>
  `);
}

function metricasDelAnio(m) {
  const barrio = m.barrios[0];
  const origen = m.origenes[0];
  return nodo(html`
    <section class="tarjeta">
      <h2 class="titulo" style="margin-bottom:14px">Cómo trabajás</h2>
      <div class="datos">
        <div class="dato"><span class="dato-nombre">Negocios cerrados</span><span class="dato-valor">${m.total} · ${m.ventas} venta / ${m.alquileres} alquiler</span></div>
        <div class="dato"><span class="dato-nombre">Ticket mediano de venta</span><span class="dato-valor">${plata(m.ticketVenta)}</span></div>
        <div class="dato"><span class="dato-nombre">Puntas por negocio</span><span class="dato-valor">${m.puntasPromedio.toFixed(2).replace(".", ",")}</span></div>
        <div class="dato"><span class="dato-nombre">De inicio a firma (venta)</span><span class="dato-valor">${m.plazoVenta ? `${m.plazoVenta} días` : "—"}</span></div>
        ${barrio ? html`<div class="dato"><span class="dato-nombre">Barrio que más te dio</span><span class="dato-valor">${escapar(barrio.nombre)}</span></div>` : ""}
        ${origen ? html`<div class="dato"><span class="dato-nombre">Canal que más te dio</span><span class="dato-valor">${escapar(origen.nombre)} · ${pct(origen.porcentaje)}</span></div>` : ""}
      </div>
    </section>
  `);
}

function comparativa(cats) {
  const mejor = [...cats].sort((a, b) => b.neto - a.neto)[0];
  const actual = cats.find((c) => c.actual);
  const filas = cats
    .map(
      (c) => html`
      <div class="dato">
        <span class="dato-nombre">${c.categoria} · ${Math.round(c.split * 100)}%${c.actual ? " (tu categoría)" : ""}</span>
        <span class="dato-valor" style="${c.diferencia > 0 ? "color:var(--azul)" : ""}">
          ${plata(c.neto)}${c.diferencia ? ` (${c.diferencia > 0 ? "+" : ""}${plata(c.diferencia)})` : ""}
        </span>
      </div>`
    )
    .join("");
  return nodo(html`
    <section class="tarjeta">
      <div class="tarjeta-titulo">
        <h2 class="titulo">Tu categoría</h2>
        <span class="apunte">ganancia neta del año</span>
      </div>
      <div class="datos">${filas}</div>
      ${mejor && actual && mejor.categoria !== actual.categoria
        ? html`<p class="aviso">Con <strong>${mejor.categoria}</strong> habrías ganado
             <strong>${plata(mejor.neto - actual.neto)}</strong> más en lo que va del año,
             descontando el fee mensual.</p>`
        : ""}
    </section>
  `);
}

function propiedadesUsadas(capa3) {
  const filas = capa3.detalle
    .map(
      (p) => html`
      <div class="dato">
        <span class="dato-nombre">${escapar(p.direccion || "Sin dirección")} · ${p.estado.replace("_", " ")}</span>
        <span class="dato-valor">${plata(p.precio)} × ${Math.round(p.probabilidad * 100)}%</span>
      </div>`
    )
    .join("");
  return nodo(html`
    <section class="tarjeta">
      <div class="tarjeta-titulo">
        <h2 class="titulo">Qué se proyectó</h2>
        <span class="apunte">${capa3.propiedades} propiedades</span>
      </div>
      <div class="datos">${filas}</div>
      <p class="apunte" style="margin-top:12px">
        Cada una vale su precio por la probabilidad de cerrarse según su estado, y por tu
        propio ratio histórico de facturación.
      </p>
    </section>
  `);
}
