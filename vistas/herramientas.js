/* Herramientas: por dónde se entra a cada calculadora.

   Un solo concepto, no tres. El intento anterior le daba a cada herramienta su propio
   dibujito, y eso son tres cosas sueltas puestas una abajo de la otra — exactamente lo
   que ya era la lista, con más tinta.

   Lo que de verdad las une es CUÁNDO se usan. Las tres contestan "¿cuánto?" en tres
   momentos distintos de la misma propiedad:

     antes de comprarla     ¿cuánto renta?
     al cerrar el negocio   ¿cuánto es tu comisión?
     cada año del contrato  ¿cuánto sube el alquiler?

   O sea que no son tres herramientas: es una línea de tiempo con tres paradas. Por eso el
   dibujo es UNO —la línea que las atraviesa— y las tres opciones viven encima.

   Y va con texto: un menú de puros dibujos obliga a acordarse de cuál era cuál, y esto se
   abre apurado y delante de alguien. */

import { escapar } from "../lib/formato.js";

const html = (c, ...v) => c.reduce((t, x, i) => t + x + (v[i] ?? ""), "");

function nodo(marca) {
  const molde = document.createElement("template");
  molde.innerHTML = marca.trim();
  return molde.content;
}

export const HERRAMIENTAS = [
  {
    vista: "renta",
    momento: "Antes de comprarla",
    nombre: "¿Cuánto renta una propiedad?",
  },
  {
    vista: "comisiones",
    momento: "Al cerrar el negocio",
    nombre: "¿Cuánto es tu comisión?",
  },
  {
    vista: "reajuste",
    momento: "Cada año del contrato",
    nombre: "¿Cuánto sube el alquiler?",
  },
];

export function dibujarHerramientas(estado) {
  const trozo = document.createDocumentFragment();

  trozo.append(nodo(html`
    <section style="margin-bottom:20px">
      <h1 class="titulo" style="font-size:29px">¿Qué vamos a calcular?</h1>
      <p class="apunte" style="margin-top:6px">Las tres preguntas de una propiedad,
        en el orden en que aparecen.</p>
    </section>
  `));

  const camino = document.createElement("div");
  camino.className = "camino-herramientas";

  HERRAMIENTAS.forEach((h, i) => {
    const parada = nodo(html`
      <button class="parada" data-ir="${escapar(h.vista)}">
        <span class="parada-hito" aria-hidden="true">${i + 1}</span>
        <span class="parada-cuerpo">
          <span class="parada-momento">${escapar(h.momento)}</span>
          <span class="parada-nombre">${escapar(h.nombre)}</span>
        </span>
        <span class="parada-flecha" aria-hidden="true">›</span>
      </button>
    `);
    parada.querySelector(".parada").addEventListener("click", () => estado.irA(h.vista));
    camino.append(parada);
  });

  trozo.append(camino);
  return trozo;
}
