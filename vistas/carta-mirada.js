/* Mirar una carta oferta que está en tránsito, sin abrirla.

   Sirve para lo que pidió Juan: controlar lo que llenó el cliente antes de seguir. Ver qué
   puso, y sobre todo **qué le falta** — que en el papel se ve como una rayita y es fácil que
   se pase de largo.

   Es de sólo mirar a propósito: se abre encima de lo que se esté haciendo y se cierra sin
   tocar nada. Si hay que corregir algo, el botón de abajo abre la carta de verdad. */

import { CAMPOS, armar } from "../lib/carta-oferta.js";
import { comoVaLaCarta, mandadas, vueltas } from "../lib/carta-transito.js";
import { comoSeLlamaLaCarta } from "../lib/carta-guardado.js";
import { telon } from "./ventana.js";
import { escapar, fechaCorta } from "../lib/formato.js";

const html = (c, ...v) => c.reduce((t, x, i) => t + x + (v[i] ?? ""), "");

function nodo(marca) {
  const molde = document.createElement("template");
  molde.innerHTML = marca.trim();
  return molde.content;
}

const PARTES = [
  { quien: "usuario", nombre: "Lo que cargás vos" },
  { quien: "comprador", nombre: "El comprador" },
  { quien: "propietario", nombre: "El propietario" },
];

/* Lo que a cada parte le toca llenar, separado en lo que puso y lo que falta.

   Las casillas quitadas no cuentan: no están en la carta, así que no faltan. */
export function comoVieneLlenando(carta, quien) {
  const fuera = new Set(carta.quitadas || []);
  const puestos = [];
  const faltan = [];
  for (const campo of CAMPOS) {
    if (campo.quien !== quien || fuera.has(campo.clave)) continue;
    const valor = (carta.valores || {})[campo.clave];
    const escrito = valor !== null && valor !== undefined && String(valor).trim() !== "";
    (escrito ? puestos : faltan).push(campo.etiqueta);
  }
  return { puestos, faltan };
}

function renglonDeParte(carta, parte) {
  const { puestos, faltan } = comoVieneLlenando(carta, parte.quien);
  if (!puestos.length && !faltan.length) return "";

  const contesto = parte.quien !== "usuario" && vueltas(carta)[parte.quien];
  const mandada = parte.quien !== "usuario" && mandadas(carta)[parte.quien];
  const estado = parte.quien === "usuario" ? ""
    : contesto ? `<span class="mirada-si">✓ contestó el ${escapar(fechaCorta(contesto))}</span>`
      : mandada ? '<span class="mirada-no">⋯ sin contestar</span>'
        : '<span class="mirada-no">no se le mandó</span>';

  return html`
    <div class="mirada-parte">
      <p class="mirada-quien">${escapar(parte.nombre)} ${estado}</p>
      ${faltan.length
        ? `<p class="mirada-falta"><strong>Falta:</strong> ${escapar(faltan.join(", "))}</p>`
        : '<p class="mirada-completo">Está todo puesto.</p>'}
      ${puestos.length
        ? `<p class="mirada-puesto">Puso: ${escapar(puestos.join(", "))}</p>`
        : ""}
    </div>`;
}

/* Abre la ventanita. `alAbrir` es lo que pasa si decide trabajar sobre esta carta. */
export function mirarCarta(carta, { agente = "", alAbrir } = {}) {
  const marca = nodo(html`
    <div class="panel-firma">
      <p class="etiqueta">${escapar(comoSeLlamaLaCarta(carta))}</p>
      <p class="mirada-estado">${escapar(comoVaLaCarta(carta))}</p>

      <div class="mirada-partes">
        ${PARTES.map((p) => renglonDeParte(carta, p)).join("")}
      </div>

      <p class="etiqueta" style="margin-top:14px">Cómo quedó el documento</p>
      <div class="previa-carta mirada-previa"></div>

      <div class="botonera" style="justify-content:space-between;margin-top:14px">
        <button class="boton boton-chico" data-hacer="cerrar">Cerrar</button>
        <button class="boton boton-chico boton-primario" data-hacer="abrir">Abrir esta carta</button>
      </div>
    </div>
  `);

  /* La carta armada, igual que en la vista previa de la pantalla: lo que está vacío sale con
     su rayita, y eso es justamente lo que hay que mirar. */
  const donde = marca.querySelector(".mirada-previa");
  for (const bloque of armar(carta.valores, carta.quitadas, {
    agente, firmadas: Object.keys(carta.firmas || {}),
  })) {
    if (bloque.tipo === "salto-de-hoja") {
      donde.append(nodo('<hr class="previa-salto">'));
      continue;
    }
    if (bloque.tipo === "firmas") continue;
    const p = document.createElement("p");
    p.className = bloque.tipo === "titulo" ? "previa-titulo" : "previa-parrafo";
    for (const parte of bloque.partes) {
      const trozo = document.createElement("span");
      trozo.className = `previa-${parte.clase}`;
      trozo.textContent = parte.texto;
      p.append(trozo);
    }
    donde.append(p);
  }

  const ventana = telon(marca);
  ventana.caja.querySelector('[data-hacer="cerrar"]').addEventListener("click", ventana.cerrar);
  ventana.caja.querySelector('[data-hacer="abrir"]').addEventListener("click", () => {
    ventana.cerrar();
    if (alAbrir) alAbrir();
  });
  return ventana;
}
