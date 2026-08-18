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

export const HERRAMIENTAS = [
  {
    vista: "renta",
    nombre: "¿Cuánto renta?",
    pista: "Lo que deja de verdad una propiedad para alquilar, con todos los costos "
      + "descontados. Con ficha para mandarle al cliente.",
    icono: "%",
  },
  {
    vista: "comisiones",
    nombre: "Comisiones",
    pista: "Tu comisión con descuentos, con la diferencia que ponés vos para cerrar, o "
      + "con la comisión ya incluida en lo que paga el comprador.",
    icono: "≡",
  },
];

export function dibujarHerramientas(estado) {
  const trozo = document.createDocumentFragment();

  trozo.append(nodo(html`
    <section style="margin-bottom:16px">
      <p class="etiqueta">Herramientas</p>
      <h1 class="titulo" style="font-size:27px;margin-top:4px">Para usar con el cliente</h1>
      <p class="apunte">Cuentas que se hacen adelante de la otra persona.</p>
    </section>
  `));

  const lista = document.createElement("div");
  lista.className = "lista";
  for (const h of HERRAMIENTAS) {
    const fila = nodo(html`
      <button class="fila" data-ir="${escapar(h.vista)}">
        <span class="fila-cuerpo">
          <span class="fila-titulo">${escapar(h.nombre)}</span>
          <span class="fila-sub">${escapar(h.pista)}</span>
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
