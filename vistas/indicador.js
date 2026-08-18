/* La pantalla de UN indicador: todo lo que en Salud no entraba.

   Se llega tocando su tarjeta. Es una vista de verdad y no una ventanita, para que el
   botón de atrás del teléfono la cierre — que es lo que uno hace sin pensar. */

import { aniosDisponibles, cerradosDe, etiquetaDeAnios } from "../lib/indicadores.js";
import * as prefs from "../lib/preferencias.js";
import { armar, cuantos } from "./indicadores.js";
import { escapar } from "../lib/formato.js";

const html = (c, ...v) => c.reduce((t, x, i) => t + x + (v[i] ?? ""), "");

function nodo(marca) {
  const molde = document.createElement("template");
  molde.innerHTML = marca.trim();
  return molde.content;
}

export function dibujarIndicador(estado) {
  const clave = estado.foco;
  const { negocios, cartera, ajustes } = estado.datos;
  const anioActual = estado.hoy.slice(0, 4);
  const disponibles = aniosDisponibles(negocios);
  const preferencias = prefs.leer();
  const elegidos = preferencias.anios === null ? [anioActual] : preferencias.anios;
  const activos = elegidos.length ? elegidos : disponibles;
  const etiqueta = etiquetaDeAnios(
    preferencias.anios === null ? [anioActual] : preferencias.anios, disponibles);

  const ficha = prefs.INDICADORES.find((i) => i.clave === clave);
  const armado = armar(clave, {
    negocios, cartera, ajustes, activos, preferencias, hoy: estado.hoy,
    aniosDisponibles: disponibles,
  });

  const trozo = document.createDocumentFragment();
  trozo.append(cabecera(ficha, armado, etiqueta, activos, negocios, estado));

  if (!armado) {
    trozo.append(nodo(html`
      <section class="tarjeta">
        <p class="apunte">Con los años elegidos no hay datos para este indicador.
        Probá con <strong>Todos</strong> desde Salud.</p>
      </section>
    `));
    return trozo;
  }

  trozo.append(nodo(html`<section class="tarjeta">${armado.detalle()}</section>`));
  return trozo;
}

function cabecera(ficha, armado, etiqueta, activos, negocios, estado) {
  const cerrados = cerradosDe(negocios, activos).length;
  const seccion = nodo(html`
    <section style="margin-bottom:14px">
      <button class="volver" id="volver">‹ Salud</button>
      <p class="etiqueta" style="margin-top:12px">${escapar(etiqueta)} · ${cuantos(
        cerrados, "negocio cerrado", "negocios cerrados")}</p>
      <h1 class="titulo" style="font-size:25px;margin-top:4px">
        ${escapar((armado && armado.titulo) || (ficha && ficha.nombre) || "Indicador")}
      </h1>
      ${ficha ? html`<p class="apunte">${escapar(ficha.pista)}</p>` : ""}
    </section>
  `);
  seccion.getElementById("volver").addEventListener("click", () => estado.irA("salud"));
  return seccion;
}
