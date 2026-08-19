/* Herramientas: por dónde se entra a cada calculadora.

   Antes era una lista de tres renglones con dos líneas de explicación cada uno. Con las
   explicaciones afuera quedaba media pantalla vacía y tres renglones flacos arriba.

   El concepto: cada herramienta NO es un ítem de menú, es una cuenta distinta, y cada
   cuenta tiene forma propia. Una propiedad que produce un porcentaje. Una comisión que se
   parte en pedazos. Un alquiler que sube un escalón por año. Los tres dibujos son eso —
   no son adornos ni íconos prestados de una librería: son la cuenta que hay adentro,
   dibujada. Por eso se distinguen de lejos aunque no se lea el nombre, que es lo que se
   quiere de un menú de tres cosas que se usan mil veces. */

import { escapar } from "../lib/formato.js";

const html = (c, ...v) => c.reduce((t, x, i) => t + x + (v[i] ?? ""), "");

function nodo(marca) {
  const molde = document.createElement("template");
  molde.innerHTML = marca.trim();
  return molde.content;
}

/* Los dibujos van a mano y con `currentColor`: así se dan vuelta solos en modo oscuro y
   no hay que mantener dos juegos. Nada de imágenes: son cuatro trazos. */
const DIBUJOS = {
  /* Una casa que produce: el techo, las paredes y el porcentaje adentro. */
  renta: `
    <path d="M6 20 L24 7 L42 20" />
    <path d="M11 19 V40 h26 V19" />
    <circle cx="19" cy="27" r="2.6" />
    <circle cx="29" cy="35" r="2.6" />
    <path d="M31 25 L17 37" />`,

  /* La torta repartida. Los cortes NO van a tercios: van en las proporciones de verdad
     —45 tuyo, 35 del colega, 20 de la oficina—, que ademas es lo que la aleja de parecer
     el logo de un auto, que es lo que pasaba con tres pedazos iguales. */
  comisiones: `
    <circle cx="24" cy="24" r="16" />
    <path d="M24 24 L24.0 8.0" />
    <path d="M24 24 L28.9 39.2" />
    <path d="M24 24 L8.8 19.1" />`,

  /* El escalón que sube: un peldaño por año, y la flecha que dice para dónde va. */
  reajuste: `
    <path d="M6 40 h11 V29 h11 V18 h11 V7" />
    <path d="M33 13 L39 7 L45 13" />`,
};

export const HERRAMIENTAS = [
  { vista: "renta", nombre: "Calculá cuánto renta una propiedad" },
  { vista: "comisiones", nombre: "Calculá tu comisión" },
  { vista: "reajuste", nombre: "Averiguá el reajuste de un alquiler" },
];

export function dibujarHerramientas(estado) {
  const trozo = document.createDocumentFragment();

  trozo.append(nodo(html`
    <section style="margin-bottom:18px">
      <h1 class="titulo" style="font-size:29px">¿Qué vamos a calcular?</h1>
    </section>
  `));

  const caja = document.createElement("div");
  caja.className = "herramientas";

  for (const h of HERRAMIENTAS) {
    const tarjeta = nodo(html`
      <button class="herramienta" data-ir="${escapar(h.vista)}">
        <span class="herramienta-dibujo" aria-hidden="true">
          <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.4"
               stroke-linecap="round" stroke-linejoin="round">${DIBUJOS[h.vista] || ""}</svg>
        </span>
        <span class="herramienta-nombre">${escapar(h.nombre)}</span>
        <span class="herramienta-flecha" aria-hidden="true">›</span>
      </button>
    `);
    tarjeta.querySelector(".herramienta").addEventListener("click", () => estado.irA(h.vista));
    caja.append(tarjeta);
  }

  trozo.append(caja);
  return trozo;
}
