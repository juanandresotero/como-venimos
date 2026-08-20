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
   dice el botón; lo que hace es idéntico.

   SE PROBO ABRIR LA CAMARA DESDE ACA Y SE SACO. La idea era esquivar el selector de archivos,
   que adentro del navegador de WhatsApp no abre. No rindio: la camara del navegador no
   prende el flash en varios telefonos —se intento de tres formas distintas— y sin flash la
   sombra del propio telefono sobre la hoja arruinaba la foto. La camara del telefono, en
   cambio, tiene flash de verdad, enfoque y todo lo demas.

   Asi que se pide lo que si funciona: que saque la foto con SU camara, de cerca y con flash,
   y la suba. Y se le muestra con dos dibujos como tiene que quedar, que se entiende sin
   leer. Menos piezas y menos formas de fallar. */
export function pedirFirmaDeFoto({ alFirmar, titulo = "Tu firma, desde una foto",
  botonListo = "Guardar mi firma" }) {
  const marca = nodo(html`
    <div class="panel-firma">
      <p class="etiqueta">${titulo}</p>
      <p class="apunte" style="margin:2px 0 10px">Firmá <strong>grande</strong> en una hoja
        blanca y sacale una foto <strong>de cerca y con flash</strong>, con la cámara de tu
        teléfono, de modo que en la foto se vea sólo la hoja. Sirve lapicera de cualquier color.</p>

      <div class="ejemplos-firma">
        <figure class="ejemplo">
          <svg viewBox="0 0 90 120" aria-hidden="true">
            <rect x="1" y="1" width="88" height="118" rx="3" fill="#fff" stroke="#c9cede"/>
            <path d="M22 84 C 30 30, 52 26, 50 52 C 48 78, 34 74, 40 58 C 47 40, 62 74, 70 40"
                  fill="none" stroke="#2f3ba8" stroke-width="3.2" stroke-linecap="round"/>
          </svg>
          <figcaption class="ejemplo-si">Así: sólo la hoja</figcaption>
        </figure>
        <figure class="ejemplo">
          <svg viewBox="0 0 90 120" aria-hidden="true">
            <rect x="1" y="1" width="88" height="118" rx="3" fill="#6b6f76"/>
            <rect x="20" y="34" width="50" height="56" fill="#fff"/>
            <rect x="20" y="34" width="15" height="56" fill="#2c2f36" opacity=".6"/>
            <path d="M40 74 C 43 52, 52 50, 51 60 C 50 70, 45 68, 47 62 C 50 54, 57 68, 61 56"
                  fill="none" stroke="#2f3ba8" stroke-width="2.2" stroke-linecap="round"/>
          </svg>
          <figcaption class="ejemplo-no">Así no: mesa y sombra</figcaption>
        </figure>
      </div>

      <input type="file" accept="image/*" class="campo" id="foto-firma">
      <div class="vista-firma" hidden>
        <canvas class="lienzo-recorte" width="600" height="240"></canvas>
        <div class="botonera">
          <button class="boton boton-chico" data-hacer="girar-izq" aria-label="Girar a la izquierda">↺ Girar</button>
          <button class="boton boton-chico" data-hacer="girar-der" aria-label="Girar a la derecha">Girar ↻</button>
        </div>
        <p class="apunte aviso-brillo" hidden>⚠ El recorte salió con mucho fondo. Miralo bien
          antes de guardarlo; con más luz y sobre papel blanco sale mejor.</p>
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
  let mascara = null;
  /* La foto tal como llego, para poder volver a recortarla despues de cada giro sin perder
     calidad: se gira SIEMPRE desde el original y no encima de lo ya girado. */
  let original = null;
  let vueltas = 0;

  /* Lo que hace con la imagen es lo mismo venga de un archivo o de la camara: se achica,
     se recorta y se muestra. Por eso esta una sola vez. */
  /* Gira la foto original los grados que haya acumulado y devuelve los pixeles ya girados.

     El lienzo se agranda para que la foto entre entera. Las esquinas que quedan vacias se
     dejan TRANSPARENTES a proposito y NO se pintan de blanco.

     Se probo pintarlas de blanco y salia mal: el borde entre ese blanco y la foto es un
     escalon de brillo, y el recorte —que busca lo que es mas oscuro que su vecindario— leia
     todo el contorno como si fuera un trazo. Quedaba un marco negro alrededor de la firma.
     Dejandolas transparentes, el recorte sabe cuales pixeles no son foto y los ignora. */
  const girada = (imagen, grados) => {
    const rad = (grados * Math.PI) / 180;
    const cos = Math.abs(Math.cos(rad));
    const sen = Math.abs(Math.sin(rad));
    const ancho = Math.round(imagen.width * cos + imagen.height * sen);
    const alto = Math.round(imagen.width * sen + imagen.height * cos);
    const lona = document.createElement("canvas");
    lona.width = ancho;
    lona.height = alto;
    const c = lona.getContext("2d", { willReadFrequently: true });
    c.translate(ancho / 2, alto / 2);
    c.rotate(rad);
    c.drawImage(imagen, -imagen.width / 2, -imagen.height / 2);
    return c.getImageData(0, 0, ancho, alto);
  };

  const procesar = (imagen) => {
    original = imagen;
    vueltas = 0;
    recortarDeNuevo();
  };

  function recortarDeNuevo() {
    if (!original) return;
    /* Se achica antes de mirar los pixeles: una foto de celular son 12 millones y
       recorrerlos todos en un telefono se nota. A 1200 de ancho sobra. */
    const escala = Math.min(1, 1200 / original.width);
    const auxiliar = document.createElement("canvas");
    auxiliar.width = Math.round(original.width * escala);
    auxiliar.height = Math.round(original.height * escala);
    const aux = auxiliar.getContext("2d", { willReadFrequently: true });
    aux.drawImage(original, 0, 0, auxiliar.width, auxiliar.height);

    /* Sin girar se recorta la foto tal cual, y ahi la transparencia sí puede ser el fondo de
       un PNG de firma. Girada, en cambio, la transparencia son las esquinas que quedaron
       afuera: hay que decirselo para que no las confunda con un dibujo. */
    mascara = vueltas
      ? recortar(girada(auxiliar, vueltas), { alfaEsRecorte: true })
      : recortar(aux.getImageData(0, 0, auxiliar.width, auxiliar.height));

    if (!mascara) {
      listo.disabled = true;
      aviso.hidden = false;
      aviso.textContent = "No encontré ninguna firma en esa foto. Probá con más luz, "
        + "sobre papel blanco y con la firma bien centrada.";
      vista.hidden = false;
      return;
    }
    const ctx = lienzo.getContext("2d");
    ctx.clearRect(0, 0, lienzo.width, lienzo.height);
    dibujarEn(ctx, mascara, { x: 10, y: 10, ancho: lienzo.width - 20, alto: lienzo.height - 20 });
    vista.hidden = false;
    aviso.hidden = !mascara.porBrillo;
    listo.disabled = false;
  }

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
    /* De a 20 grados: alcanza para enderezar una foto sacada a mano y no obliga a tocar
       quince veces para dar la vuelta entera. */
    if (que === "girar-izq") { vueltas -= 20; recortarDeNuevo(); }
    if (que === "girar-der") { vueltas += 20; recortarDeNuevo(); }
    if (que === "cancelar") panel.cerrar();
    if (que === "listo" && mascara) {
      panel.cerrar();
      alFirmar(aBytes(mascara));
    }
  });

  return panel;
}
