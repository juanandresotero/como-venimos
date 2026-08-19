/* La pantalla que ve el cliente cuando toca el enlace de WhatsApp.

   Es una isla: no carga la app, ni la cartera, ni el token. Lee lo que viene despues del
   `#` —que nunca llega a ningun servidor—, muestra la carta, deja completar lo que le
   toca a esta parte, firmar con el dedo, y devolverla.

   Todo pasa en el telefono del cliente. Nada se sube a ningun lado. */

import { CAMPOS, armar, fundir } from "../lib/carta-oferta.js";
import { deEnlace, aEnlace } from "../lib/carta-enlace.js";
import { paraMandar, copiarAlToque, copiarTexto } from "../lib/compartir.js";
import { esNavegadorDeOtraApp } from "../lib/navegador.js";
import { armarPDF, nombreDelArchivo } from "../lib/carta-pdf.js";
import { cargarMembrete } from "../lib/membrete.js";
import { deBytes } from "../lib/firma.js";
import { dibujarEn, tintaDePantalla } from "../lib/firma-dibujo.js";
import { pedirFirma, pedirFirmaDeFoto } from "./firma-panel.js";
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
async function prepararSalidas({ devolver, bajar }) {
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

  const crudo = document.getElementById("enlace-crudo");
  if (crudo) crudo.value = enlace;

  /* UN SOLO TOQUE QUE SIEMPRE AVANZA.

     El botón es un enlace de verdad a `whatsapp://`, y además copia el mensaje al tocarlo.
     Los dos caminos se intentan juntos porque no hay forma de saber desde acá cuál va a
     funcionar: en un navegador normal se abre WhatsApp y listo; adentro del navegador que
     WhatsApp trae incorporado la navegación no ocurre —el sistema la bloquea sin avisar—
     pero el JavaScript sí corre, así que el mensaje queda copiado igual.

     Pase lo que pase, el cliente termina con el mensaje en el portapapeles y con un cartel
     que le dice qué hacer con él. Copiar es lo único que ese navegador deja hacer, y por eso
     es sobre lo que se apoya todo. */
  devolver.href = paraMandar(texto, estado.telefono);
  devolver.addEventListener("click", () => {
    /* Se copia y se contesta EN EL MOMENTO, sin esperar ninguna promesa: el pedido de
       portapapeles del navegador puede quedarse colgado sin contestar nunca, y ahí el botón
       se toca y no pasa nada — que es justo el problema que se está resolviendo. */
    const listo = copiarAlToque(texto);
    const paso = document.getElementById("paso-a-mano");
    if (!paso) return;
    paso.hidden = false;
    const titulo = paso.querySelector(".paso-a-mano-hecho");
    titulo.textContent = listo ? "✓ Ya copié el mensaje." : "Copiá el enlace de abajo.";
    /* Si el camino viejo no pudo, se intenta igual el nuevo por atrás y se corrige el
       cartel si llega a andar. Sin bloquear nada. */
    if (!listo) {
      /* Y se abre el plegado donde está el enlace: decirle "copialo de abajo" sin que se
         vea el enlace sería mandarlo a buscar. */
      const plegado = document.querySelector(".paso-a-mano ~ * details, details.plegable");
      if (plegado) plegado.open = true;
      copiarTexto(texto).then((pudo) => {
        if (pudo) titulo.textContent = "✓ Ya copié el mensaje.";
      });
    }
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
          ${yaFirmo ? "Firmar de nuevo" : "Firmar con el dedo"}</button>
        <button class="boton boton-chico" id="firmar-foto">Subir foto de mi firma</button>
      </div>
      <p class="apunte" style="margin-top:8px">Si preferís, firmá en un papel blanco con
        lapicera <strong>azul</strong>, sacale una foto y subila: le saco el fondo sola.</p>
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

  /* Dos caminos para lo mismo, porque a mucha gente le sale mal firmar con el dedo en un
     vidrio: o se dibuja acá, o se saca una foto de la firma hecha en papel y el recorte la
     deja limpia y en negro parejo. El resto del sistema no distingue una de otra. */
  const quedarse = (bytes) => {
    estado.firmas[claveFirma] = bytes;
    dibujar();
  };
  cajaFirma.getElementById("firmar").addEventListener("click", () => {
    pedirFirma({ titulo: "Firmá con el dedo", alFirmar: quedarse });
  });
  cajaFirma.getElementById("firmar-foto").addEventListener("click", () => {
    pedirFirmaDeFoto({
      titulo: "Subí una foto de tu firma",
      botonListo: "Usar esta firma",
      alFirmar: quedarse,
    });
  });
  trozo.append(cajaFirma);

  // -------- devolverla
  const comoSeLlamaLaParte = estado.turno === "comprador" ? "comprador" : "propietario";
  const aQuien = escapar(estado.agente || "quien te la mandó");
  const cierre = nodo(html`
    <section class="tarjeta no-imprimir">
      <h2 class="titulo" style="font-size:16px">Mandarla</h2>
      <p class="apunte" style="margin:2px 0 10px">${yaFirmo
        ? `Ya está firmada. Tocá el botón y se la devolvés a ${aQuien}.`
        : "Firmá arriba antes de mandarla."}</p>

      <a class="boton boton-primario boton-ancho ${yaFirmo ? "" : "boton-apagado"}" id="devolver">
        Devolver la carta firmada</a>

      <div class="paso-a-mano" id="paso-a-mano" hidden>
        <p class="paso-a-mano-hecho">✓ Ya copié el mensaje.</p>
        <p class="apunte">Si WhatsApp no se abrió solo, volvé al chat de ${aQuien},
          mantené el dedo apretado donde se escribe y elegí <strong>Pegar</strong>.</p>
      </div>

      <p class="apunte" style="margin-top:12px">Cuando la firmen todas las partes te llega
        el documento final. No hace falta que guardes nada ahora.</p>

      <details class="plegable" style="margin-top:12px">
        <summary class="plegable-cabeza">
          <span>¿Lo querés en papel?</span>
          <span class="plegable-flecha" aria-hidden="true">›</span>
        </summary>
        <div class="plegable-cuerpo">
          <div class="botonera">
            <a class="boton boton-chico ${yaFirmo ? "" : "boton-apagado"}" id="bajar">Guardar el PDF</a>
            <button class="boton boton-chico" id="imprimir">Imprimir</button>
          </div>
          <p class="apunte" id="aviso-papel" hidden style="margin-top:8px"></p>
          <p class="apunte" style="margin-top:8px">El enlace, por si lo necesitás suelto:</p>
          <textarea class="enlace-a-mano" id="enlace-crudo" readonly rows="2"></textarea>
        </div>
      </details>
    </section>
  `);

  const devolver = cierre.getElementById("devolver");
  const bajar = cierre.getElementById("bajar");

  /* Guardar e imprimir no funcionan adentro del navegador de WhatsApp: no es que fallen,
     el sistema no los deja. Se dice de frente y se apunta a algo que SÍ va a pasar, en vez
     de dejar un botón que no reacciona. */
  const avisoPapel = cierre.getElementById("aviso-papel");
  const noSePuedeAca = () => {
    avisoPapel.hidden = false;
    avisoPapel.textContent = `Desde acá WhatsApp no deja guardar archivos. Pedile el PDF a `
      + `${estado.agente || "quien te la mandó"} por el chat, o abrí este enlace en Chrome.`;
  };
  cierre.getElementById("imprimir").addEventListener("click", () => {
    if (esNavegadorDeOtraApp()) { noSePuedeAca(); return; }
    window.print();
  });
  if (esNavegadorDeOtraApp()) bajar.addEventListener("click", noSePuedeAca);

  if (yaFirmo) prepararSalidas({ devolver, bajar, avisoPapel });
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
