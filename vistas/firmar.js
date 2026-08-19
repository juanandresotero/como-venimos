/* La pantalla que ve el cliente cuando toca el enlace de WhatsApp.

   Es una isla: no carga la app, ni la cartera, ni el token. Lee lo que viene despues del
   `#` —que nunca llega a ningun servidor—, muestra la carta, deja completar lo que le
   toca a esta parte, firmar con el dedo, y devolverla.

   Todo pasa en el telefono del cliente. Nada se sube a ningun lado. */

import { CAMPOS, armar, fundir } from "../lib/carta-oferta.js";
import { deEnlace, aEnlace } from "../lib/carta-enlace.js";
import { paraMandar, copiarTexto } from "../lib/compartir.js";
import { armarPDF, nombreDelArchivo } from "../lib/carta-pdf.js";
import { cargarMembrete } from "../lib/membrete.js";
import { deBytes } from "../lib/firma.js";
import { dibujarEn, tintaDePantalla } from "../lib/firma-dibujo.js";
import { pedirFirma } from "./firma-panel.js";
import {
  leerFirmaPropia, leerBorrador, guardarBorrador, leerDelHistorial, guardarEnHistorial,
  comoSeLlamaLaCarta,
} from "../lib/carta-guardado.js";
import { anotarVuelta } from "../lib/carta-transito.js";
import { escapar, plata } from "../lib/formato.js";

const html = (c, ...v) => c.reduce((t, x, i) => t + x + (v[i] ?? ""), "");

function nodo(marca) {
  const molde = document.createElement("template");
  molde.innerHTML = marca.trim();
  return molde.content;
}

/* Quien firma segun a quien le toque el turno. */
const FIRMA_DEL_TURNO = { comprador: "oferente", propietario: "propietario" };

const COMO_SE_LLAMA = {
  comprador: { titulo: "Oferta de compra", quien: "comprador" },
  propietario: { titulo: "Aceptación de la oferta", quien: "propietario" },
};

let estado = null;

/* La direccion del PDF que se ofrece bajar. Se guarda para poder soltarla: cada firma
   redibuja la pantalla y armaria un PDF nuevo, y los viejos quedarian ocupando memoria. */
let urlDelPdf = null;

/* La fecha del teléfono del cliente. Sirve para que Juan vea cuándo le contestó cada uno. */
const hoy = () => new Date().toISOString().slice(0, 10);

async function arrancar() {
  const leido = await deEnlace(window.location.href);
  const vista = document.getElementById("vista");

  if (!leido) {
    vista.replaceChildren(nodo(html`
      <section class="tarjeta">
        <h1 class="titulo" style="font-size:20px">No pude abrir la carta</h1>
        <p class="apunte" style="margin-top:8px">Puede que el enlace se haya cortado al
          copiarlo. Pedile a quien te lo mandó que te lo reenvíe entero, sin recortarlo.</p>
      </section>
    `));
    return;
  }

  estado = leido;
  if (!FIRMA_DEL_TURNO[estado.turno]) estado.turno = "comprador";

  /* La firma del agente NO viaja en el enlace: es lo que lo mantiene corto. Pero esta
     pagina vive en el mismo dominio que la app, asi que en SU teléfono —y solo en el
     suyo— se puede recuperar de donde la dejo guardada. Cuando le devuelven la carta y
     baja el PDF, sale completa. En el teléfono del cliente esto no encuentra nada. */
  if (!estado.firmas.depositario) {
    const mia = leerFirmaPropia();
    if (mia) estado.firmas.depositario = mia.bytes;
  }

  dibujar();
}

/* Deja listos, ANTES de que el usuario toque nada, el enlace para devolver la carta y el
   archivo para bajarla. Los dos son enlaces de verdad: ver la nota de arriba. */
async function prepararSalidas({ devolver, bajar, copiar, copiado }) {
  const base = new URL("firmar.html", window.location.href).href;
  // La firma del agente tampoco vuelve: la repone su propio teléfono. Mantiene el enlace corto.
  const firmas = { ...estado.firmas };
  delete firmas.depositario;

  const enlace = await aEnlace(base, {
    valores: estado.valores,
    quitadas: estado.quitadas,
    turno: estado.turno,
    agente: estado.agente,
    firmas,
    id: estado.id,
    telefono: estado.telefono,
  });
  const texto = `Te paso la carta oferta firmada.\n\n${enlace}`;

  /* Con el teléfono del agente adentro, WhatsApp abre DERECHO la conversación con él. */
  devolver.href = paraMandar(texto, estado.telefono);

  const crudo = document.getElementById("enlace-crudo");
  if (crudo) crudo.value = enlace;

  copiar.addEventListener("click", async () => {
    const listo = await copiarTexto(texto);
    copiado.hidden = false;
    copiado.textContent = listo
      ? "✓ Copiado. Abrí el chat y pegalo."
      : "No pude copiarlo solo. Marcá el texto de abajo con el dedo y copialo.";
  });

  const pdf = armarPDF(armar(estado.valores, estado.quitadas, {
    agente: estado.agente, firmadas: Object.keys(estado.firmas),
  }), estado.firmas, await cargarMembrete()).aBlob();
  if (urlDelPdf) URL.revokeObjectURL(urlDelPdf);
  urlDelPdf = URL.createObjectURL(pdf);
  bajar.href = urlDelPdf;
  bajar.download = nombreDelArchivo(estado.valores);
}

function dibujar() {
  const vista = document.getElementById("vista");
  const como = COMO_SE_LLAMA[estado.turno];
  const mios = CAMPOS.filter((c) => c.quien === estado.turno
    && !estado.quitadas.includes(c.clave));
  const claveFirma = FIRMA_DEL_TURNO[estado.turno];
  const yaFirmo = Boolean(estado.firmas[claveFirma]);

  const trozo = document.createDocumentFragment();

  trozo.append(nodo(html`
    <section class="no-imprimir" style="margin-bottom:16px">
      <h1 class="titulo" style="font-size:24px">${como.titulo}</h1>
      <p class="apunte" style="margin-top:4px">Leela entera, completá tus datos y firmá
        abajo con el dedo. Si preferís hacerlo en papel, tocá “Guardar o imprimir”.</p>
    </section>
  `));

  // -------- la carta, para leerla
  const bloques = armar(estado.valores, estado.quitadas, {
    agente: estado.agente,
    firmadas: Object.keys(estado.firmas),
  });
  const lectura = nodo('<section class="tarjeta"><div class="previa-carta"></div></section>');
  const donde = lectura.querySelector(".previa-carta");
  for (const bloque of bloques) {
    if (bloque.tipo === "salto-de-hoja") {
      donde.append(nodo('<hr class="previa-salto">'));
      continue;
    }
    if (bloque.tipo === "firmas") continue;
    const p = document.createElement("p");
    p.className = bloque.tipo === "titulo" ? "previa-titulo" : "previa-parrafo";
    for (const parte of bloque.partes) {
      const span = document.createElement("span");
      span.className = `previa-${parte.clase}`;
      span.textContent = parte.texto;
      p.append(span);
    }
    donde.append(p);
  }
  trozo.append(lectura);

  // -------- lo que tiene que completar esta parte
  if (mios.length) {
    const caja = nodo(html`
      <section class="tarjeta no-imprimir">
        <h2 class="titulo" style="font-size:16px">Tus datos</h2>
        <p class="apunte" style="margin:2px 0 10px">Lo que dejes vacío queda con la rayita
          para completar a mano.</p>
        <div class="campos-carta"></div>
      </section>
    `);
    const lista = caja.querySelector(".campos-carta");

    for (const campo of mios) {
      const id = `f-${campo.clave}`;
      const valor = estado.valores[campo.clave];
      const fila = document.createElement("div");
      fila.className = "fila-carta";
      fila.innerHTML = html`
        <label for="${id}">${escapar(campo.etiqueta)}</label>
        ${campo.tipo === "fecha"
          ? `<input class="campo" id="${id}" type="date" value="${escapar(valor ?? "")}">`
          : campo.tipo === "monto"
            ? `<input class="campo" id="${id}" type="text" inputmode="decimal" value="${valor ? plata(valor) : ""}">`
            : `<input class="campo" id="${id}" type="text" value="${escapar(valor ?? "")}">`}
      `;
      const entrada = fila.querySelector(".campo");
      entrada.addEventListener("change", () => {
        estado.valores[campo.clave] = entrada.value || null;
        dibujar();
      });
      lista.append(fila);
    }
    trozo.append(caja);
  }

  // -------- la firma
  const firma = yaFirmo ? deBytes(estado.firmas[claveFirma]) : null;
  const cajaFirma = nodo(html`
    <section class="tarjeta">
      <h2 class="titulo" style="font-size:16px">Tu firma</h2>
      <div class="caja-firma" style="margin-top:8px">
        <canvas class="caja-firma-lienzo" width="420" height="150"></canvas>
      </div>
      <div class="botonera">
        <button class="boton boton-chico boton-primario" id="firmar">
          ${yaFirmo ? "Firmar de nuevo" : "Firmar acá"}</button>
      </div>
    </section>
  `);

  const lienzo = cajaFirma.querySelector("canvas");
  const ctx = lienzo.getContext("2d");
  if (firma) {
    dibujarEn(ctx, firma, { x: 8, y: 8, ancho: lienzo.width - 16, alto: lienzo.height - 16 },
      { grosor: 4 });
  } else {
    ctx.strokeStyle = tintaDePantalla(lienzo);
      ctx.globalAlpha = .3;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(20, lienzo.height - 28);
    ctx.lineTo(lienzo.width - 20, lienzo.height - 28);
    ctx.stroke();
  }

  cajaFirma.getElementById("firmar").addEventListener("click", () => {
    pedirFirma({
      titulo: "Firmá con el dedo",
      alFirmar: (bytes) => {
        estado.firmas[claveFirma] = bytes;
        dibujar();
      },
    });
  });
  trozo.append(cajaFirma);

  // -------- devolverla
  const comoSeLlamaLaParte = estado.turno === "comprador" ? "comprador" : "propietario";
  const cierre = nodo(html`
    <section class="tarjeta no-imprimir">
      <h2 class="titulo" style="font-size:16px">Mandarla</h2>
      <p class="apunte" style="margin:2px 0 10px">${yaFirmo
        ? (estado.telefono
          ? `Ya está firmada. Se la devolvés a ${escapar(estado.agente || "quien te la mandó")} por WhatsApp.`
          : "Ya está firmada. Se abre WhatsApp y elegís a quién mandársela.")
        : "Firmá arriba antes de mandarla."}</p>
      <div class="botonera">
        <a class="boton boton-chico boton-primario ${yaFirmo ? "" : "boton-apagado"}" id="devolver">
          Devolver la carta firmada</a>
        <a class="boton boton-chico ${yaFirmo ? "" : "boton-apagado"}" id="bajar">Guardar el PDF</a>
        <button class="boton boton-chico" id="imprimir">Imprimir</button>
      </div>

      <div class="salida-a-mano" ${yaFirmo ? "" : "hidden"}>
        <p class="apunte">¿No se abrió WhatsApp? Copiá el enlace y pegalo vos en el chat.</p>
        <div class="botonera">
          <button class="boton boton-chico" id="copiar">Copiar el enlace</button>
        </div>
        <p class="apunte" id="copiado" hidden></p>
        <!-- El enlace a la vista y seleccionable. Es el último recurso: si ni el botón de
             copiar funciona, siempre se puede marcar con el dedo y copiar a mano. -->
        <textarea class="enlace-a-mano" id="enlace-crudo" readonly rows="2"></textarea>
      </div>

      <p class="apunte" style="margin-top:10px">Cuando la firmen todas las partes te llega
        el documento final por WhatsApp. No hace falta que guardes nada ahora.</p>
    </section>
  `);

  const devolver = cierre.getElementById("devolver");
  const bajar = cierre.getElementById("bajar");
  const copiar = cierre.getElementById("copiar");
  const copiado = cierre.getElementById("copiado");

  cierre.getElementById("imprimir").addEventListener("click", () => window.print());

  /* Todo lo que tiene que SALIR de esta página va en el `href` de un enlace de verdad y no
     en un `onclick`. Adentro del navegador que WhatsApp trae incorporado, el sistema bloquea
     sin avisar todo lo que la página intenta hacer sola —compartir, abrir una ventana, o un
     click disparado por código— y el botón queda muerto. Un enlace que toca una persona no
     se bloquea nunca. Por eso los `href` se preparan acá, apenas se dibuja la pantalla. */
  if (yaFirmo) {
    prepararSalidas({ devolver, bajar, copiar, copiado });
  }
  trozo.append(cierre);

  /* SOLO en el telefono del agente. Es lo que permite mandarles la carta a las dos partes
     AL MISMO TIEMPO: cada una vuelve con lo suyo y esto las junta en una sola. Se puede
     porque las casillas de cada parte son distintas y no se pisan nunca — el comprador
     llena las suyas, el propietario las de la segunda hoja.

     En el telefono del cliente no aparece: no tiene firma guardada. */
  if (leerFirmaPropia()) {
    const traer = nodo(html`
      <section class="tarjeta no-imprimir">
        <h2 class="titulo" style="font-size:16px">Es tuya esta carta</h2>
        <p class="apunte" style="margin:2px 0 10px">Traela a la app y se junta con lo que ya
          tenés cargado. Si se la mandaste a las dos partes a la vez, traé las dos: cada una
          aporta lo suyo y no se pisan.</p>
        <div class="botonera">
          <button class="boton boton-chico boton-primario" id="traer">Traer a mi carta</button>
        </div>
        <p class="apunte" id="traido" hidden style="margin-top:10px"></p>
      </section>
    `);
    traer.getElementById("traer").addEventListener("click", () => {
      /* La vuelta cae en SU carta, no en la que este abierta. Antes se juntaba siempre con
         el borrador, y con dos cartas oferta a la vez eso mezclaba a un cliente con otro.
         El numero de carta viaja en el enlace justamente para esto. */
      const abierta = leerBorrador() || { valores: {}, quitadas: [], firmas: {} };
      const suya = estado.id ? leerDelHistorial(estado.id) : null;
      const base = suya || abierta;

      const junta = fundir(base, estado, estado.turno);
      junta.id = base.id || estado.id || "";
      junta.nombre = base.nombre || "";
      junta.mandadas = base.mandadas || {};
      junta.quitadas = estado.quitadas.length ? estado.quitadas : junta.quitadas;
      const anotada = anotarVuelta(junta, estado.turno, hoy());

      guardarEnHistorial(anotada, base.cuando || null);
      /* Si la carta que volvio es justo la que tiene abierta, tambien se le refresca ahi. */
      if (!suya || abierta.id === anotada.id) guardarBorrador(anotada, null);

      const aviso = document.getElementById("traido");
      aviso.hidden = false;
      aviso.textContent = suya
        ? `✓ Guardada en “${comoSeLlamaLaCarta(anotada)}”. Miralas en Herramientas → Enviar carta oferta → En tránsito.`
        : "✓ Guardada. Abrí la app en Herramientas → Enviar carta oferta.";
    });
    trozo.append(traer);
  }

  trozo.append(nodo(html`
    <p class="apunte no-imprimir" style="margin-top:18px;text-align:center">Esta carta viaja dentro
      del enlace, de un teléfono al otro. No se guarda en ningún servidor.</p>
  `));

  vista.replaceChildren(trozo);
  window.scrollTo(0, 0);
}

arrancar();

/* Abrir un segundo enlace NO recarga la página: cuando lo único que cambia es lo que va
   después del `#`, el navegador se queda en la página que ya tenía. Por eso, después de
   abrir la carta del comprador, tocar la del propietario seguía mostrando la del comprador
   — y al traerla se anotaba la parte equivocada. Hay que releerlo a mano. */
window.addEventListener("hashchange", () => { arrancar(); });
