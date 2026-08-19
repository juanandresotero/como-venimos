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
/* El mismo panel lo usan dos pantallas: Ajustes, donde el usuario carga SU firma para que
   quede guardada, y la carta que abre el cliente, donde firma una sola vez. Cambia lo que
   dice el botón; lo que hace es idéntico. */
export function pedirFirmaDeFoto({ alFirmar, titulo = "Tu firma, desde una foto",
  botonListo = "Guardar mi firma" }) {
  const marca = nodo(html`
    <div class="panel-firma">
      <p class="etiqueta">${titulo}</p>
      <p class="apunte" style="margin:2px 0 10px">Firmá en un papel blanco con lapicera
        <strong>azul</strong>, sacale una foto derecha y buscala acá. El truco es el color:
        con lapicera negra el recorte sale peor.</p>
      <div class="botonera" style="margin-bottom:10px">
        <button class="boton boton-chico boton-primario" data-hacer="camara">Sacar la foto ahora</button>
      </div>
      <input type="file" accept="image/*" class="campo" id="foto-firma">
      <div class="camara-firma" hidden>
        <video class="camara-video" playsinline muted></video>
        <div class="botonera">
          <button class="boton boton-chico boton-primario" data-hacer="capturar">Capturar</button>
          <button class="boton boton-chico" data-hacer="cortar-camara">Cerrar la cámara</button>
        </div>
      </div>
      <p class="apunte camara-error" hidden></p>
      <div class="vista-firma" hidden>
        <canvas class="lienzo-recorte" width="600" height="240"></canvas>
        <p class="apunte aviso-brillo" hidden>⚠ No encontré tinta azul, así que la recorté
          por lo oscuro. Mirá bien si quedó limpia; si no, repetila en azul.</p>
      </div>
      <div class="botonera" style="justify-content:space-between">
        <button class="boton boton-chico" data-hacer="cancelar">Cancelar</button>
        <button class="boton boton-chico boton-primario" data-hacer="listo" disabled>${botonListo}</button>
      </div>
    </div>
  `);

  const panel = telon(marca);
  const entrada = panel.caja.querySelector("#foto-firma");
  const vista = panel.caja.querySelector(".vista-firma");
  const lienzo = panel.caja.querySelector(".lienzo-recorte");
  const aviso = panel.caja.querySelector(".aviso-brillo");
  const listo = panel.caja.querySelector('[data-hacer="listo"]');
  const cajaCamara = panel.caja.querySelector(".camara-firma");
  const video = panel.caja.querySelector(".camara-video");
  const errorCamara = panel.caja.querySelector(".camara-error");
  let mascara = null;
  let corriente = null;

  /* Lo que hace con la imagen es lo mismo venga de un archivo o de la camara: se achica,
     se recorta y se muestra. Por eso esta una sola vez. */
  const procesar = (imagen) => {
    /* Se achica antes de mirar los pixeles: una foto de celular son 12 millones y
       recorrerlos todos en un telefono se nota. A 1200 de ancho sobra. */
    const escala = Math.min(1, 1200 / imagen.width);
    const auxiliar = document.createElement("canvas");
    auxiliar.width = Math.round(imagen.width * escala);
    auxiliar.height = Math.round(imagen.height * escala);
    const aux = auxiliar.getContext("2d", { willReadFrequently: true });
    aux.drawImage(imagen, 0, 0, auxiliar.width, auxiliar.height);

    mascara = recortar(aux.getImageData(0, 0, auxiliar.width, auxiliar.height));

    if (!mascara) {
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

  const apagarCamara = () => {
    if (corriente) corriente.getTracks().forEach((pista) => pista.stop());
    corriente = null;
    cajaCamara.hidden = true;
  };

  /* La camara por JavaScript y no por el campo de archivo.

     No es un lujo: adentro del navegador que WhatsApp trae incorporado el selector de
     archivos NO ABRE —la aplicacion que lo hospeda tiene que implementarlo y WhatsApp no
     lo hace—, asi que el boton de subir una foto no reacciona. Pedir la camara es otro
     camino distinto, y donde este permitido funciona sin selector de archivos.

     Si tampoco se puede, se dice por que y queda el campo de archivo, que en un navegador
     normal anda perfecto. */
  const prenderCamara = async () => {
    /* Se avisa ANTES de pedir nada: pedir la cámara puede tardar, o quedarse esperando una
       respuesta que no llega nunca, y un botón que no reacciona es exactamente el problema
       que se está tratando de resolver. */
    errorCamara.hidden = false;
    errorCamara.textContent = "Pidiendo permiso para usar la cámara…";

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      errorCamara.textContent = "Este navegador no me deja usar la cámara. "
        + "Sacá la foto con la cámara del teléfono y buscala con el botón de abajo.";
      return;
    }

    try {
      /* Con reloj: el pedido de cámara puede no contestar NUNCA —pasa adentro de los
         navegadores que vienen dentro de otra app— y sin esto la pantalla se queda esperando
         para siempre. Diez segundos y se ofrece el otro camino. */
      corriente = await Promise.race([
        navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } }, audio: false,
        }),
        new Promise((_, rechazar) => {
          setTimeout(() => rechazar(new Error("sin respuesta")), 10000);
        }),
      ]);
      video.srcObject = corriente;
      await video.play();
      cajaCamara.hidden = false;
      errorCamara.hidden = true;
    } catch (error) {
      apagarCamara();
      errorCamara.hidden = false;
      errorCamara.textContent = error && error.name === "NotAllowedError"
        ? "No me diste permiso para usar la cámara. Sacá la foto con la cámara del teléfono "
          + "y buscala con el botón de abajo."
        : "No pude abrir la cámara desde acá. Sacá la foto con la cámara del teléfono y "
          + "buscala con el botón de abajo.";
    }
  };

  const capturar = () => {
    if (!corriente) return;
    const foto = document.createElement("canvas");
    foto.width = video.videoWidth;
    foto.height = video.videoHeight;
    foto.getContext("2d").drawImage(video, 0, 0);
    apagarCamara();
    const imagen = new Image();
    imagen.onload = () => procesar(imagen);
    imagen.src = foto.toDataURL("image/png");
  };

  entrada.addEventListener("change", () => {
    const archivo = entrada.files && entrada.files[0];
    if (!archivo) return;
    const imagen = new Image();
    imagen.onload = () => {
      procesar(imagen);
      URL.revokeObjectURL(imagen.src);
    };
    imagen.src = URL.createObjectURL(archivo);
  });

  panel.caja.addEventListener("click", (e) => {
    const boton = e.target.closest ? e.target.closest("[data-hacer]") : null;
    const que = boton ? boton.dataset.hacer : null;
    if (que === "camara") prenderCamara();
    if (que === "capturar") capturar();
    if (que === "cortar-camara") apagarCamara();
    if (que === "cancelar") {
      apagarCamara();
      panel.cerrar();
    }
    if (que === "listo" && mascara) {
      apagarCamara();
      panel.cerrar();
      alFirmar(aBytes(mascara));
    }
  });

  return panel;
}
