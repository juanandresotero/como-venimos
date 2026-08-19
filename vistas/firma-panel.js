/* El panel donde se firma con el dedo, y el que recorta la firma de una foto.

   Vive aparte porque lo usan DOS lugares que no se conocen entre si: la pantalla de la
   app y la pagina suelta que abre el cliente desde el enlace.

   Con eventos `pointer` y no `touch`: el mismo codigo sirve para el dedo, para el lapiz
   y para el mouse. Nada de `long-press`, que en el telefono se cancela solo. */

import { deTrazos, aBytes, GRILLA } from "../lib/firma.js";
import { recortar } from "../lib/firma-foto.js";
import { dibujarEn, tintaDePantalla } from "../lib/firma-dibujo.js";
import { telon } from "./ventana.js";

const html = (c, ...v) => c.reduce((t, x, i) => t + x + (v[i] ?? ""), "");

function nodo(marca) {
  const molde = document.createElement("template");
  molde.innerHTML = marca.trim();
  return molde.content;
}

/* Firmar con el dedo. Llama a `alFirmar(bytes)` con la firma lista para guardar. */
export function pedirFirma({ titulo = "Firmá acá", pie = "", alFirmar }) {
  const marca = nodo(html`
    <div class="panel-firma">
      <p class="etiqueta">${titulo}</p>
      ${pie ? `<p class="apunte" style="margin:2px 0 10px">${pie}</p>` : ""}
      <canvas class="lienzo-firma" width="1024" height="512"></canvas>
      <p class="apunte firma-ayuda">Dibujá tu firma con el dedo, como en un papel.</p>
      <div class="botonera" style="justify-content:space-between">
        <button class="boton boton-chico" data-hacer="cancelar">Cancelar</button>
        <span style="display:flex;gap:8px">
          <button class="boton boton-chico" data-hacer="borrar">Borrar</button>
          <button class="boton boton-chico boton-primario" data-hacer="listo" disabled>Listo</button>
        </span>
      </div>
    </div>
  `);

  const panel = telon(marca);
  const lienzo = panel.caja.querySelector(".lienzo-firma");
  const ctx = lienzo.getContext("2d");
  const listo = panel.caja.querySelector('[data-hacer="listo"]');

  const trazos = [];
  let actual = null;

  const limpiar = () => {
    ctx.clearRect(0, 0, lienzo.width, lienzo.height);
    /* Del tema y no fijo: en modo oscuro el negro era el mismo color que el fondo y
       el usuario firmaba sin ver nada. */
    ctx.strokeStyle = tintaDePantalla(lienzo);
    ctx.lineWidth = 5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  };
  limpiar();

  /* El canvas mide 1024x512 por dentro pase lo que pase con el CSS, asi que un punto
     de la pantalla hay que traerlo a esa escala. */
  const donde = (evento) => {
    const caja = lienzo.getBoundingClientRect();
    return {
      x: ((evento.clientX - caja.left) / caja.width) * GRILLA.ancho,
      y: ((evento.clientY - caja.top) / caja.height) * GRILLA.alto,
    };
  };

  lienzo.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    lienzo.setPointerCapture(e.pointerId);
    actual = [donde(e)];
    trazos.push(actual);
    ctx.beginPath();
    ctx.moveTo(actual[0].x, actual[0].y);
    listo.disabled = false;
  });

  lienzo.addEventListener("pointermove", (e) => {
    if (!actual) return;
    e.preventDefault();
    const p = donde(e);
    actual.push(p);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  });

  const soltar = () => { actual = null; };
  lienzo.addEventListener("pointerup", soltar);
  lienzo.addEventListener("pointercancel", soltar);
  lienzo.addEventListener("pointerleave", soltar);

  panel.caja.addEventListener("click", (e) => {
    const que = e.target.dataset ? e.target.dataset.hacer : null;
    if (que === "cancelar") panel.cerrar();
    if (que === "borrar") {
      trazos.length = 0;
      actual = null;
      limpiar();
      listo.disabled = true;
    }
    if (que === "listo") {
      const firma = deTrazos(trazos);
      panel.cerrar();
      if (firma.trazos.length) alFirmar(aBytes(firma));
    }
  });

  return panel;
}

/* Cargar la firma propia desde una foto. Muestra el recorte ANTES de guardarlo: es la
   red de seguridad de todo el metodo — si salio mal, se ve. */
export function pedirFirmaDeFoto({ alFirmar }) {
  const marca = nodo(html`
    <div class="panel-firma">
      <p class="etiqueta">Tu firma, desde una foto</p>
      <p class="apunte" style="margin:2px 0 10px">Firmá en un papel blanco con lapicera
        <strong>azul</strong>, sacale una foto derecha y buscala acá. El truco es el color:
        con lapicera negra el recorte sale peor.</p>
      <input type="file" accept="image/*" class="campo" id="foto-firma">
      <div class="vista-firma" hidden>
        <canvas class="lienzo-recorte" width="600" height="240"></canvas>
        <p class="apunte aviso-brillo" hidden>⚠ No encontré tinta azul, así que la recorté
          por lo oscuro. Mirá bien si quedó limpia; si no, repetila en azul.</p>
      </div>
      <div class="botonera" style="justify-content:space-between">
        <button class="boton boton-chico" data-hacer="cancelar">Cancelar</button>
        <button class="boton boton-chico boton-primario" data-hacer="listo" disabled>Guardar mi firma</button>
      </div>
    </div>
  `);

  const panel = telon(marca);
  const entrada = panel.caja.querySelector("#foto-firma");
  const vista = panel.caja.querySelector(".vista-firma");
  const lienzo = panel.caja.querySelector(".lienzo-recorte");
  const aviso = panel.caja.querySelector(".aviso-brillo");
  const listo = panel.caja.querySelector('[data-hacer="listo"]');
  let mascara = null;

  entrada.addEventListener("change", () => {
    const archivo = entrada.files && entrada.files[0];
    if (!archivo) return;
    const imagen = new Image();
    imagen.onload = () => {
      /* Se achica antes de mirar los pixeles: una foto de celular son 12 millones y
         recorrerlos todos en un telefono se nota. A 1200 de ancho sobra. */
      const escala = Math.min(1, 1200 / imagen.width);
      const auxiliar = document.createElement("canvas");
      auxiliar.width = Math.round(imagen.width * escala);
      auxiliar.height = Math.round(imagen.height * escala);
      const aux = auxiliar.getContext("2d", { willReadFrequently: true });
      aux.drawImage(imagen, 0, 0, auxiliar.width, auxiliar.height);

      mascara = recortar(aux.getImageData(0, 0, auxiliar.width, auxiliar.height));
      URL.revokeObjectURL(imagen.src);

      if (!mascara) {
        vista.hidden = true;
        listo.disabled = true;
        aviso.hidden = false;
        aviso.textContent = "No encontré ninguna firma en esa foto. Probá con más luz "
          + "o con lapicera azul sobre papel blanco.";
        vista.hidden = false;
        return;
      }
      const ctx = lienzo.getContext("2d");
      ctx.clearRect(0, 0, lienzo.width, lienzo.height);
      dibujarEn(ctx, mascara, { x: 10, y: 10, ancho: lienzo.width - 20, alto: lienzo.height - 20 });
      vista.hidden = false;
      aviso.hidden = !mascara.porBrillo;
      listo.disabled = false;
    };
    imagen.src = URL.createObjectURL(archivo);
  });

  panel.caja.addEventListener("click", (e) => {
    const que = e.target.dataset ? e.target.dataset.hacer : null;
    if (que === "cancelar") panel.cerrar();
    if (que === "listo" && mascara) {
      panel.cerrar();
      alFirmar(aBytes(mascara));
    }
  });

  return panel;
}
