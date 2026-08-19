/* Mirar una carta oferta que está en tránsito, sin abrirla.

   Sirve para controlar lo que llenó el cliente antes de seguir: se lee el documento tal
   como quedó, y lo que falta se ve solo, con su rayita en el medio de la frase.

   Hubo antes un resumen parte por parte con lo que cada uno puso y lo que le faltaba. Juan
   lo hizo sacar: *"es medio al santo botón, puedo ver el documento y ahí entender"*. Tenía
   razón — repetía en una lista lo que el documento ya muestra.

   Se abre encima de lo que se esté haciendo y se cierra sin tocar nada. */

import { armar } from "../lib/carta-oferta.js";
import { comoVaLaCarta, estadoDeCarta, estaPronta } from "../lib/carta-transito.js";
import { comoSeLlamaLaCarta } from "../lib/carta-guardado.js";
import { telon } from "./ventana.js";
import { mandarCartaA, mandarCartaCompleta, bajarCarta } from "./carta-acciones.js";
import { escapar } from "../lib/formato.js";

const html = (c, ...v) => c.reduce((t, x, i) => t + x + (v[i] ?? ""), "");

function nodo(marca) {
  const molde = document.createElement("template");
  molde.innerHTML = marca.trim();
  return molde.content;
}

/* Abre la ventanita.

   Desde acá se puede hacer TODO lo que se puede hacer con una carta, esté en el tablero o en
   el historial: bajarla, abrirla para editarla, volver a mandársela a cualquiera de las dos
   partes, y borrarla. Juan lo pidió así después de quedarse con una carta archivada que sólo
   le dejaba borrarla. */
export function mirarCarta(carta, {
  agente = "", telefono = "", hoy = null,
  alAbrir, alDesarchivar, alMandar, alEntregar,
} = {}) {
  const archivada = estadoDeCarta(carta) === "completa";
  const pronta = estaPronta(carta);
  const marca = nodo(html`
    <div class="panel-firma">
      <p class="etiqueta">${escapar(comoSeLlamaLaCarta(carta))}</p>
      <p class="mirada-estado">${escapar(comoVaLaCarta(carta))}</p>

      <p class="etiqueta" style="margin-top:12px">Cómo quedó el documento</p>
      <div class="previa-carta mirada-previa"></div>

      ${alMandar && pronta ? html`
        <div class="botonera" style="margin-top:14px">
          <button class="boton boton-primario boton-ancho" data-hacer="completa">
            Enviar carta oferta completa</button>
        </div>
        <p class="apunte mirada-aviso" hidden></p>` : ""}

      ${alMandar && !pronta ? html`
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

      <div class="botonera" style="margin-top:12px">
        <button class="boton boton-chico" data-hacer="cerrar">Cerrar</button>
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
  const aviso = ventana.caja.querySelector(".mirada-aviso");

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
      /* Cuando ya firmaron los dos, el documento final es UNO SOLO y es el mismo para las
         dos partes. Por eso acá no hay a quién elegir. */
      case "completa": {
        boton.disabled = true;
        const pudo = await mandarCartaCompleta(carta, { agente });
        boton.disabled = false;
        if (!pudo) {
          aviso.hidden = false;
          aviso.textContent = "No pude compartir el PDF desde acá. Abrí la app desde su "
            + "ícono en la pantalla de inicio y probá de nuevo.";
          return;
        }
        ventana.cerrar();
        alEntregar();
        break;
      }
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
