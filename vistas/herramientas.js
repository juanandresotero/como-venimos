/* Herramientas: el índice de las calculadoras.

   Antes esta pestaña era "Renta" y tenía una sola cosa adentro. Pasa a ser un índice
   porque van a vivir varias, y una pestaña que se llama como una de sus herramientas
   deja de tener lugar para las otras. */

import { escapar } from "../lib/formato.js";

const html = (c, ...v) => c.reduce((t, x, i) => t + x + (v[i] ?? ""), "");

function nodo(marca) {
  const molde = document.createElement("template");
  molde.innerHTML = marca.trim();
  return molde.content;
}

/* El nombre dice lo que la herramienta HACE, y con eso alcanza.

   Antes cada una llevaba dos renglones de explicacion abajo. Servian el primer dia; despues
   son tres parrafos que hay que saltear para llegar a lo que uno venia a tocar. El titulo
   empieza con el verbo por la misma razon: "Comisiones" es un tema, "Calcula tu comision"
   es lo que vas a hacer al entrar. */
export const HERRAMIENTAS = [
  { vista: "renta", nombre: "Calculá cuánto renta una propiedad" },
  { vista: "comisiones", nombre: "Calculá tu comisión" },
  { vista: "reajuste", nombre: "Averiguá el reajuste de un alquiler" },
];

export function dibujarHerramientas(estado) {
  const trozo = document.createDocumentFragment();

  trozo.append(nodo(html`
    <section style="margin-bottom:16px">
      <h1 class="titulo" style="font-size:27px">Herramientas</h1>
    </section>
  `));

  const lista = document.createElement("div");
  lista.className = "lista";
  for (const h of HERRAMIENTAS) {
    const fila = nodo(html`
      <button class="fila" data-ir="${escapar(h.vista)}">
        <span class="fila-cuerpo">
          <span class="fila-titulo">${escapar(h.nombre)}</span>
        </span>
        <span class="fila-derecha"><span class="apunte">›</span></span>
      </button>
    `);
    fila.querySelector(".fila").addEventListener("click", () => estado.irA(h.vista));
    lista.append(fila);
  }
  trozo.append(lista);
  return trozo;
}
