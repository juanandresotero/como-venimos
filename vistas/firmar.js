/* La pantalla que ve el cliente cuando toca el enlace de WhatsApp.

   Es una isla: no carga la app, ni la cartera, ni el token. Lee lo que viene despues del
   `#` —que nunca llega a ningun servidor—, muestra la carta, deja completar lo que le
   toca a esta parte, firmar con el dedo, y devolverla.

   Todo pasa en el telefono del cliente. Nada se sube a ningun lado. */

import { CAMPOS, armar, fundir } from "../lib/carta-oferta.js";
import { deEnlace, aEnlace } from "../lib/carta-enlace.js";
import { mandarTexto, bajarArchivo } from "../lib/compartir.js";
import { esNavegadorDeOtraApp, comoSalirDeAca } from "../lib/navegador.js";
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

function dibujar() {
  const vista = document.getElementById("vista");
  const como = COMO_SE_LLAMA[estado.turno];
  const mios = CAMPOS.filter((c) => c.quien === estado.turno
    && !estado.quitadas.includes(c.clave));
  const claveFirma = FIRMA_DEL_TURNO[estado.turno];
  const yaFirmo = Boolean(estado.firmas[claveFirma]);

  const trozo = document.createDocumentFragment();

  /* Adentro del navegador que WhatsApp trae incorporado no anda ni compartir ni bajar
     archivos. Se avisa ARRIBA DE TODO y con los pasos exactos, porque el que lo recibe es
     un cliente que no tiene por que saber que existe esa diferencia. */
  if (esNavegadorDeOtraApp()) {
    trozo.append(nodo(html`
      <section class="tarjeta aviso-fuera" style="margin-bottom:16px">
        <p class="frase"><strong>Abrila en tu navegador.</strong> Estás viéndola adentro de
          WhatsApp, y desde acá no se puede bajar el PDF.</p>
        <p class="apunte" style="margin-top:6px">${escapar(comoSalirDeAca())}</p>
        <p class="apunte" style="margin-top:6px">Firmar y devolverla sí funciona igual desde acá.</p>
      </section>
    `));
  }

  trozo.append(nodo(html`
    <section style="margin-bottom:16px">
      <h1 class="titulo" style="font-size:24px">${como.titulo}</h1>
      <p class="apunte" style="margin-top:4px">Leela entera, completá tus datos y firmá
        abajo con el dedo. Si preferís hacerlo en papel, bajá el PDF e imprimilo.</p>
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
      <section class="tarjeta">
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
  const cierre = nodo(html`
    <section class="tarjeta">
      <h2 class="titulo" style="font-size:16px">Mandarla</h2>
      <p class="apunte" style="margin:2px 0 10px">${yaFirmo
        ? (estado.telefono
          ? `Ya está firmada. Se la devolvés a ${escapar(estado.agente || "quien te la mandó")} por WhatsApp.`
          : "Ya está firmada. Se abre WhatsApp y elegís vos a quién mandársela.")
        : "Firmá arriba antes de mandarla."}</p>
      <div class="botonera">
        <button class="boton boton-chico boton-primario" id="devolver" ${yaFirmo ? "" : "disabled"}>
          ${estado.telefono ? "Devolver la carta firmada" : "Enviar carta oferta"}</button>
        <button class="boton boton-chico" id="pdf">Bajar el PDF</button>
      </div>
      <p class="apunte" id="aviso-mandar" hidden style="margin-top:10px"></p>
    </section>
  `);

  cierre.getElementById("devolver").addEventListener("click", async () => {
    const base = new URL("firmar.html", window.location.href).href;
    // La del agente tampoco vuelve: la repone su propio teléfono. Mantiene el enlace corto.
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
    /* Con el telefono del agente adentro del enlace, WhatsApp abre DERECHO la conversacion
       con el: el cliente no tiene que buscarlo en su agenda. Y si esto se abrio adentro de
       WhatsApp, `mandarTexto` sabe que ahi la bandeja del sistema no anda y navega a wa.me,
       que es lo unico que funciona en esa ventanita. */
    await mandarTexto(`Te paso la carta oferta firmada.

${enlace}`, { telefono: estado.telefono });
  });

  const avisoMandar = cierre.getElementById("aviso-mandar");
  cierre.getElementById("pdf").addEventListener("click", async () => {
    const como = await bajarArchivo(armarPDF(armar(estado.valores, estado.quitadas, {
      agente: estado.agente, firmadas: Object.keys(estado.firmas),
    }), estado.firmas, await cargarMembrete()).aBlob(), nombreDelArchivo(estado.valores));
    if (como === "bloqueado") {
      avisoMandar.hidden = false;
      avisoMandar.textContent = `Para bajar el PDF hay que salir de WhatsApp. ${comoSalirDeAca()}`;
    }
  });
  trozo.append(cierre);

  /* SOLO en el telefono del agente. Es lo que permite mandarles la carta a las dos partes
     AL MISMO TIEMPO: cada una vuelve con lo suyo y esto las junta en una sola. Se puede
     porque las casillas de cada parte son distintas y no se pisan nunca — el comprador
     llena las suyas, el propietario las de la segunda hoja.

     En el telefono del cliente no aparece: no tiene firma guardada. */
  if (leerFirmaPropia()) {
    const traer = nodo(html`
      <section class="tarjeta">
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
    <p class="apunte" style="margin-top:18px;text-align:center">Esta carta viaja dentro
      del enlace, de un teléfono al otro. No se guarda en ningún servidor.</p>
  `));

  vista.replaceChildren(trozo);
  window.scrollTo(0, 0);
}

arrancar();
