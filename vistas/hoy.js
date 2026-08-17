/* Hoy: la bandeja de pendientes. Lo primero que se ve al abrir la app.

   Si no hay nada pendiente, no muestra una lista vacia: muestra como viene el mes. */

import { derivar } from "../lib/pendientes.js";
import { capas, ritmo } from "../lib/salud.js";
import { marcarAtendido } from "../lib/guardado.js";
import { plataUSD, pct, fechaCorta, escapar } from "../lib/formato.js";

const html = (cadenas, ...valores) =>
  cadenas.reduce((t, c, i) => t + c + (valores[i] ?? ""), "");

function nodo(marca) {
  const molde = document.createElement("template");
  molde.innerHTML = marca.trim();
  return molde.content;
}

export function dibujarHoy(estado) {
  // Los eventos que el usuario ya despacho no se vuelven a mostrar.
  const atendidos = new Set((estado.datos.mis_datos || {}).eventos_atendidos || []);
  const eventos = (estado.datos.eventos || []).filter((e) => !atendidos.has(e.id));
  const grupos = derivar(estado.datos.negocios, eventos, estado.hoy);
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
  const marca = nodo(html`
    <details class="grupo ${grupo.urgente ? "urgente" : ""}">
      <summary class="grupo-cabeza">
        <span class="grupo-cuenta">${grupo.items.length}</span>
        <span class="grupo-nombre">${escapar(grupo.nombre)}</span>
        <span class="grupo-flecha" aria-hidden="true">›</span>
      </summary>
      <ul class="grupo-lista"></ul>
    </details>
  `);

  const lista = marca.querySelector(".grupo-lista");
  for (const item of grupo.items) {
    const li = document.createElement("li");
    li.className = "grupo-item";
    li.innerHTML = html`
      <p class="grupo-item-titulo">${escapar(item.titulo)}${
        item.fecha ? ` <span class="capa-sub">· ${fechaCorta(item.fecha, anio)}</span>` : ""
      }</p>
      <p class="grupo-item-detalle">${escapar(item.detalle)}</p>
      <div class="botonera">
        ${item.negocio_id
          ? `<button class="boton" data-ir="${item.negocio_id}" style="padding:8px 13px;font-size:13px">Abrir y completar</button>`
          : `<button class="boton" data-listo="${item.evento_id}" style="padding:8px 13px;font-size:13px">Ya lo resolví</button>`}
      </div>
    `;
    const abrir = li.querySelector("[data-ir]");
    if (abrir) abrir.addEventListener("click", () => estado.irA("ficha", abrir.dataset.ir));
    const listo = li.querySelector("[data-listo]");
    if (listo) {
      listo.addEventListener("click", () => {
        marcarAtendido(estado, listo.dataset.listo);
        estado.redibujar();
      });
    }
    lista.append(li);
  }
  return marca;
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
