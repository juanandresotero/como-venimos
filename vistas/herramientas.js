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
/* Una regla, en diagonal para que entre larga en el circulo. Las rayitas van de a una y
   alternadas largo/corto, que es lo que hace que se lea "regla" y no "escalera". */
const REGLA = `<path d="M3.2 15.6 15.6 3.2l5.2 5.2L8.4 20.8z"/>`
  + `<path d="M6.4 12.4l2 2M9 9.8l3 3M11.6 7.2l2 2M14.2 4.6l3 3"/>`;

/* El costo de vender: una torta a la que le sacaron una tajada.

   No es una casa. A 22px una casa con algo al lado se empasta —ya se probaron la flecha y
   la moneda—, y ademas todas las herramientas hablan de casas: el dibujo no distinguiria
   nada. Lo que esta parada dice de verdad es "de lo que sale la venta, esto se va", y eso
   es una porcion separada del resto. Dos formas cerradas, ninguna pieza chica. */
const TAJADA = `<path d="M10.8 6.4A6.8 6.8 0 1 0 17.6 13.2L10.8 13.2Z"/>`
  + `<path d="M13 11L13 4.2A6.8 6.8 0 0 1 19.8 11Z"/>`;

/* Cada parada dice QUE HACER y nada mas. Antes cada una llevaba encima el momento en que
   se usa ("Antes de comprarla", "Al cerrar el negocio"): servia para explicar el concepto
   la primera vez, pero despues es texto que hay que saltear cada vez que se abre el menu
   apurado. El orden de la linea ya cuenta lo mismo sin decirlo. */
export const HERRAMIENTAS = [
  { vista: "renta", nombre: "Calcular renta", dibujo: CASA },
  { vista: "comisiones", nombre: "Calcular comisión", dibujo: PORCIENTO },
  /* Va pegada a la comision: las dos contestan "¿cuanto sale esto?" en el mismo momento de
     la operacion, y el orden de estas paradas es una linea de tiempo. */
  { vista: "costos_cierre", nombre: "Cuánto cuesta cerrar", dibujo: TAJADA },
  { vista: "reajuste", nombre: "Calcular reajuste de alquiler", dibujo: ESCALONES },
  { vista: "carta_oferta", nombre: "Enviar carta oferta", dibujo: HOJA_FIRMADA },
  { vista: "padron", nombre: "Averiguar el padrón", dibujo: CHAPA },
  { vista: "homogeneizacion", nombre: "Homogeneizar los m²", dibujo: REGLA },
];

export function dibujarHerramientas(estado) {
  const trozo = document.createDocumentFragment();

  trozo.append(nodo(html`
    <section style="margin-bottom:20px">
      <h1 class="titulo" style="font-size:29px">¿Qué vamos a hacer?</h1>
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
