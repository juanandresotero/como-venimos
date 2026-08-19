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

/* Cada parada lleva su dibujo en vez de un número. El número decía en qué orden pasan
   las cosas, que es algo que la línea ya cuenta sola; el dibujo dice DE QUÉ se trata,
   que es lo que uno busca cuando abre el menú apurado.

   Van a 22px adentro de un círculo de 40. A ese tamaño no entra cualquier cosa: se
   probaron una casa con flecha y una casa con moneda, y las dos se empastan (la flecha
   queda un borrón en la esquina, la moneda se come el techo). Gana siempre el dibujo
   con menos piezas. `currentColor` para que sirva en claro y en oscuro. */
const CASA = `<path d="M3.5 11.2 12 4l8.5 7.2"/><path d="M6 10.2V20h12v-9.8"/>`;
const PORCIENTO = `<circle cx="7.6" cy="7.6" r="2.6"/><circle cx="16.4" cy="16.4" r="2.6"/>`
  + `<path d="M18 6 6 18"/>`;
const ESCALONES = `<path d="M3.5 20.5v-4h5v-4h5v-4h5v-4"/><path d="M3.5 20.5h16"/>`;
const CHAPA = `<path d="M4 8.5 12 4l8 4.5v7L12 20l-8-4.5z"/>`
  + `<path d="M12 10.2v3.6"/><path d="M10.4 11.4h3.2"/>`;
const HOJA_FIRMADA = `<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/>`
  + `<path d="M8.8 16.6c1.6-3.4 2.6-3.4 3.2-1.4.5 1.7 1.6 1.9 3.2-1"/>`;

/* Cada parada dice QUE HACER y nada mas. Antes cada una llevaba encima el momento en que
   se usa ("Antes de comprarla", "Al cerrar el negocio"): servia para explicar el concepto
   la primera vez, pero despues es texto que hay que saltear cada vez que se abre el menu
   apurado. El orden de la linea ya cuenta lo mismo sin decirlo. */
export const HERRAMIENTAS = [
  { vista: "renta", nombre: "Calcular renta", dibujo: CASA },
  { vista: "comisiones", nombre: "Calcular comisión", dibujo: PORCIENTO },
  { vista: "reajuste", nombre: "Calcular reajuste de alquiler", dibujo: ESCALONES },
  { vista: "carta_oferta", nombre: "Enviar carta oferta", dibujo: HOJA_FIRMADA },
  { vista: "padron", nombre: "Averiguar el padrón", dibujo: CHAPA },
];

export function dibujarHerramientas(estado) {
  const trozo = document.createDocumentFragment();

  trozo.append(nodo(html`
    <section style="margin-bottom:20px">
      <h1 class="titulo" style="font-size:29px">¿Qué vamos a hacer?</h1>
      <p class="apunte" style="margin-top:6px">En el orden en que pasan las cosas.</p>
    </section>
  `));

  const camino = document.createElement("div");
  camino.className = "camino-herramientas";

  HERRAMIENTAS.forEach((h) => {
    const parada = nodo(html`
      <button class="parada" data-ir="${escapar(h.vista)}">
        <span class="parada-hito" aria-hidden="true">
          <svg viewBox="0 0 24 24">${h.dibujo}</svg>
        </span>
        <span class="parada-cuerpo">
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
