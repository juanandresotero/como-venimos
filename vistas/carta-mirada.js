/* Mirar una carta oferta que está en tránsito, sin abrirla.

   Sirve para lo que pidió Juan: controlar lo que llenó el cliente antes de seguir. Ver qué
   puso, y sobre todo **qué le falta** — que en el papel se ve como una rayita y es fácil que
   se pase de largo.

   Es de sólo mirar a propósito: se abre encima de lo que se esté haciendo y se cierra sin
   tocar nada. Si hay que corregir algo, el botón de abajo abre la carta de verdad. */

import { CAMPOS, armar } from "../lib/carta-oferta.js";
import { comoVaLaCarta, mandadas, vueltas, estadoDeCarta } from "../lib/carta-transito.js";
import { comoSeLlamaLaCarta } from "../lib/carta-guardado.js";
import { telon } from "./ventana.js";
import { mandarCartaA, bajarCarta } from "./carta-acciones.js";
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

/* Abre la ventanita.

   Desde acá se puede hacer TODO lo que se puede hacer con una carta, esté en el tablero o en
   el historial: bajarla, abrirla para editarla, volver a mandársela a cualquiera de las dos
   partes, y borrarla. Juan lo pidió así después de quedarse con una carta archivada que sólo
   le dejaba borrarla. */
export function mirarCarta(carta, {
  agente = "", telefono = "", hoy = null,
  alAbrir, alDesarchivar, alMandar, alBorrar,
} = {}) {
  const archivada = estadoDeCarta(carta) === "completa";
  const marca = nodo(html`
    <div class="panel-firma">
      <p class="etiqueta">${escapar(comoSeLlamaLaCarta(carta))}</p>
      <p class="mirada-estado">${escapar(comoVaLaCarta(carta))}</p>

      <div class="mirada-partes">
        ${PARTES.map((p) => renglonDeParte(carta, p)).join("")}
      </div>

      <p class="etiqueta" style="margin-top:14px">Cómo quedó el documento</p>
      <div class="previa-carta mirada-previa"></div>

      ${alMandar ? html`
        <p class="etiqueta" style="margin-top:14px">Mandársela de nuevo</p>
        <div class="botonera">
          <button class="boton boton-chico" data-hacer="mandar" data-turno="comprador">Al comprador</button>
          <button class="boton boton-chico" data-hacer="mandar" data-turno="propietario">Al propietario</button>
        </div>
        <p class="apunte mirada-aviso" hidden></p>` : ""}

      <div class="botonera" style="margin-top:12px">
        <button class="boton boton-chico boton-primario" data-hacer="abrir">Abrir y editar</button>
        <button class="boton boton-chico" data-hacer="bajar">Bajar el PDF</button>
        ${archivada && alDesarchivar
          ? '<button class="boton boton-chico" data-hacer="desarchivar">Volver al tablero</button>'
          : ""}
      </div>

      <div class="botonera" style="justify-content:space-between;margin-top:12px">
        <button class="boton boton-chico" data-hacer="cerrar">Cerrar</button>
        ${alBorrar ? '<button class="boton boton-chico boton-borrar" data-hacer="borrar">Borrar</button>' : ""}
      </div>

      ${alBorrar ? html`
        <div class="mirada-borrar" hidden>
          <p class="apunte" style="color:var(--rojo-tinta);margin:0 0 8px">
            ¿Seguro? Se borra la carta y todo lo que las partes completaron.</p>
          <div class="botonera">
            <button class="boton boton-chico boton-borrar" data-hacer="borrar-si">Sí, borrar</button>
            <button class="boton boton-chico" data-hacer="borrar-no">No</button>
          </div>
        </div>` : ""}
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
  const aviso = ventana.caja.querySelector(".mirada-aviso");
  const cajaBorrar = ventana.caja.querySelector(".mirada-borrar");

  ventana.caja.addEventListener("click", async (evento) => {
    const boton = evento.target.closest ? evento.target.closest("[data-hacer]") : null;
    if (!boton) return;

    switch (boton.dataset.hacer) {
      case "cerrar":
        ventana.cerrar();
        break;
      case "abrir":
        ventana.cerrar();
        if (alAbrir) alAbrir();
        break;
      case "bajar":
        await bajarCarta(carta, { agente });
        break;
      case "desarchivar":
        ventana.cerrar();
        alDesarchivar();
        break;
      /* Borrar pregunta acá adentro y no en otra ventana encima: dos telones apilados en un
         teléfono es un lío, y esto no se puede deshacer. */
      case "borrar":
        cajaBorrar.hidden = false;
        break;
      case "borrar-no":
        cajaBorrar.hidden = true;
        break;
      case "borrar-si":
        ventana.cerrar();
        alBorrar();
        break;
      case "mandar": {
        boton.disabled = true;
        const mandada = await mandarCartaA(carta, boton.dataset.turno,
          { agente, telefono }, hoy);
        boton.disabled = false;
        if (!mandada) {
          aviso.hidden = false;
          aviso.textContent = "No pude compartir el PDF desde acá. Abrí la app desde su "
            + "ícono en la pantalla de inicio y probá de nuevo.";
          return;
        }
        ventana.cerrar();
        alMandar(mandada);
        break;
      }
      default:
        break;
    }
  });

  return ventana;
}
