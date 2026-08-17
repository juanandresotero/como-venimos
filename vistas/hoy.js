/* Hoy: la bandeja de pendientes. Lo primero que se ve al abrir la app.

   Si no hay nada pendiente, no muestra una lista vacia: muestra como viene el mes. */

import { derivar } from "../lib/pendientes.js";
import { capas, ritmo } from "../lib/salud.js";
import { plataUSD, pct, fechaCorta, escapar } from "../lib/formato.js";

const html = (cadenas, ...valores) =>
  cadenas.reduce((t, c, i) => t + c + (valores[i] ?? ""), "");

function nodo(marca) {
  const molde = document.createElement("template");
  molde.innerHTML = marca.trim();
  return molde.content;
}

export function dibujarHoy(estado) {
  const { negocios, eventos } = estado.datos;
  const grupos = derivar(negocios, eventos, estado.hoy);
  const total = grupos.reduce((t, g) => t + g.items.length, 0);

  const trozo = document.createDocumentFragment();
  trozo.append(encabezado(total));
  if (!total) {
    trozo.append(todoAlDia(estado));
    return trozo;
  }
  for (const grupo of grupos) trozo.append(dibujarGrupo(grupo, estado));
  return trozo;
}

function encabezado(total) {
  return nodo(html`
    <section style="margin-bottom:16px">
      <p class="etiqueta">Pendientes</p>
      <h1 class="titulo" style="font-size:27px;margin-top:4px">
        ${total ? `${total} cosas para revisar` : "Todo al día"}
      </h1>
    </section>
  `);
}

function dibujarGrupo(grupo, estado) {
  const anio = Number(estado.hoy.slice(0, 4));
  const items = grupo.items
    .map(
      (item) => html`
      <li class="grupo-item">
        <p class="grupo-item-titulo">${escapar(item.titulo)}${
          item.fecha ? html` <span class="capa-sub">· ${fechaCorta(item.fecha, anio)}</span>` : ""
        }</p>
        <p class="grupo-item-detalle">${escapar(item.detalle)}</p>
      </li>`
    )
    .join("");

  return nodo(html`
    <details class="grupo ${grupo.urgente ? "urgente" : ""}">
      <summary class="grupo-cabeza">
        <span class="grupo-cuenta">${grupo.items.length}</span>
        <span class="grupo-nombre">${escapar(grupo.nombre)}</span>
        <span class="grupo-flecha" aria-hidden="true">›</span>
      </summary>
      <ul class="grupo-lista">${items}</ul>
    </details>
  `);
}

function todoAlDia(estado) {
  const { negocios, cartera, ajustes } = estado.datos;
  const anio = estado.hoy.slice(0, 4);
  const c = capas(negocios, cartera, ajustes, anio);
  const objetivo = (ajustes.objetivo_personal || {})[anio] || 0;
  const r = ritmo(c.capa1.facturacion, objetivo, anio, estado.hoy);

  return nodo(html`
    <section class="vacio">
      <p class="vacio-signo">✓</p>
      <p class="vacio-texto">No hay nada esperándote.</p>
    </section>
    <section class="tarjeta">
      <p class="etiqueta">Cobrado en ${anio}</p>
      <p class="cifra cifra-grande" style="margin:6px 0 4px">${plataUSD(c.capa1.facturacion)}</p>
      ${r ? html`<p class="apunte">${pct(r.avance)} del objetivo · ${r.aRitmo ? "vas a ritmo" : "vas atrasado"}</p>` : ""}
    </section>
  `);
}
