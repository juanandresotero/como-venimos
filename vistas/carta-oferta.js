/* La carta oferta: llenarla, firmarla y mandarla.

   Lo que manda acá es que cada casilla tiene TRES puertas y no dos: la lleno, la dejo
   vacía para que la complete el otro, o la saco y la frase se cierra sola. Por eso cada
   fila tiene su botón de quitar, y por eso hay una vista previa: es el único lugar donde
   se ve el efecto de haber sacado algo.

   Los datos de la carta NO van al repositorio, que es público. Van al teléfono, igual que
   las cuentas bancarias. */

import { CAMPOS, POR_CLAVE, armar } from "../lib/carta-oferta.js";
import { aEnlace } from "../lib/carta-enlace.js";
import { mandarArchivo, bajarArchivo } from "../lib/compartir.js";
import {
  nuevoId, anotarMandada, anotarEntregada, estadoDeCarta, comoVaLaCarta, estaPronta,
  mandadas, vueltas, ordenarParaElHistorial,
} from "../lib/carta-transito.js";
import { armarPDF, nombreDelArchivo } from "../lib/carta-pdf.js";
import { cargarMembrete } from "../lib/membrete.js";
import { deBytes } from "../lib/firma.js";
import { dibujarEn, tintaDePantalla } from "../lib/firma-dibujo.js";
import { pedirFirma } from "./firma-panel.js";
import { mirarCarta } from "./carta-mirada.js";
import {
  leerBorrador, guardarBorrador, borrarBorrador,
  leerFirmaPropia, leerPadron, guardarPadron,
  leerHistorial, guardarEnHistorial, borrarDelHistorial, comoSeLlamaLaCarta,
} from "../lib/carta-guardado.js";
import { nombrePropio } from "../lib/motor.js";
import { escapar, numeroDesde, plata } from "../lib/formato.js";

const html = (c, ...v) => c.reduce((t, x, i) => t + x + (v[i] ?? ""), "");

function nodo(marca) {
  const molde = document.createElement("template");
  molde.innerHTML = marca.trim();
  return molde.content;
}

const GRUPOS = [
  {
    quien: "usuario",
    nombre: "La propiedad y las condiciones",
    pista: "Esto lo cargás vos.",
  },
  {
    quien: "comprador",
    nombre: "El comprador",
    pista: "Lo que no sepas, dejalo vacío: lo completa él desde el enlace o a mano en el papel.",
  },
  {
    quien: "propietario",
    nombre: "El propietario",
    pista: "Va en la segunda hoja. Normalmente lo completa el dueño al aceptar.",
  },
];

const FIRMAS = [
  { clave: "oferente", nombre: "Comprador" },
  { clave: "depositario", nombre: "Vos, por RE/MAX" },
  { clave: "propietario", nombre: "Propietario" },
];

/* Lo que se está llenando ahora. Se lee del teléfono al abrir la pantalla: al usuario le
   importa encontrar la última carta como la dejó, no una hoja en blanco. */
let carta = null;
let mostrandoPrevia = false;
let mostrandoHistorial = false;
let preguntandoNueva = false;
let mostrandoTransito = false;

/* Los pedazos que cambian mientras se escribe. Se guardan las referencias para poder
   refrescarlos SOLOS.

   Antes cada dato cargado redibujaba la pantalla entera, y con la vista previa abierta eso
   pasaba en cada tecla: la pagina cambiaba de alto, el scroll quedaba en cualquier lado y
   habia que buscar de nuevo donde uno estaba. Rehacer toda la pantalla para cambiar un
   renglon es siempre demasiado. */
const vivos = { nombre: null, previa: null };

/* Junta las repintadas seguidas en una sola, un cuarto de segundo despues de la ultima
   tecla. Escribiendo normal eso es UNA repintada por casilla en vez de una por letra. */
let reloj = null;
function conCalma(hacer) {
  clearTimeout(reloj);
  reloj = setTimeout(hacer, 250);
}

function refrescarLoQueCambia(agente) {
  /* Se anota donde estaba la pagina y se devuelve ahi. Cambiar el nombre de arriba o la
     vista previa mueve el alto de lo que hay alrededor, y sin esto el renglon que se estaba
     llenando se corre solo. */
  const altura = window.scrollY;
  if (vivos.nombre) vivos.nombre.textContent = comoSeLlamaLaCarta(carta);
  if (vivos.previa) pintarPrevia(vivos.previa, agente);
  if (window.scrollY !== altura) window.scrollTo(0, altura);
}

/* Lo que deja la herramienta del padrón para que esta pantalla lo levante.

   Juan arranca una carta nueva desde el padrón: busca la dirección, saca el número y
   recién ahí empieza a llenar. Antes esto se hacía escribiendo el borrador en el teléfono
   y navegando, pero no servía: `carta` vive en memoria y sólo se lee lo guardado cuando
   está vacía, así que si ya había abierto la carta alguna vez el padrón se perdía. */
let semilla = null;

export function empezarConPadron(datos) {
  semilla = datos;
}

/* Lo que viene puesto de fabrica no cuenta como "hay algo cargado". Se mira AL TOCAR y no
   al dibujar: si se mirara al dibujar, lo que se escribio despues no contaria y el boton
   borraria el trabajo sin preguntar. Paso en la prueba. */
const DE_FABRICA = ["dias_reserva", "dias_validez", "fecha_oferta"];

const hayAlgoCargado = () =>
  Boolean(carta) && (
    Object.keys(carta.valores).some((k) => !DE_FABRICA.includes(k) && carta.valores[k])
    || Object.keys(carta.firmas).length > 0);

function plantarSemilla(estado) {
  Object.assign(carta.valores, semilla);
  semilla = null;
  guardar(estado);
}

function arrancar(estado) {
  const guardado = leerBorrador();
  carta = guardado || { valores: {}, quitadas: [], firmas: {} };
  for (const campo of CAMPOS) {
    if (campo.porDefecto !== undefined && carta.valores[campo.clave] === undefined) {
      carta.valores[campo.clave] = campo.porDefecto;
    }
  }
  if (!carta.valores.fecha_oferta) carta.valores.fecha_oferta = estado.hoy;
}

const guardar = (estado) => guardarBorrador(carta, estado.hoy);

export function dibujarCartaOferta(estado) {
  if (!carta) arrancar(estado);

  /* Vino un padrón de la otra herramienta. Si no hay nada escrito se planta y listo; si
     hay una carta a medio hacer NO se pisa sin avisar: se abre el mismo cartel de siempre,
     que ya pregunta si guardarla. */
  if (semilla) {
    if (hayAlgoCargado()) preguntandoNueva = true;
    else plantarSemilla(estado);
  }

  // Las referencias de la pantalla anterior ya no sirven: se vuelven a tomar abajo.
  vivos.nombre = null;
  vivos.previa = null;

  const agente = nombrePropio(estado.datos.ajustes);
  const trozo = document.createDocumentFragment();

  trozo.append(nodo(html`
    <section style="margin-bottom:16px">
      <h1 class="titulo" style="font-size:26px">Carta oferta</h1>
      <p class="apunte" style="margin-top:4px">Llená lo que sepas. Lo que dejes vacío sale
        con la rayita para completar; lo que saques desaparece de la frase.</p>
    </section>
  `));

  trozo.append(barraDeCartas(estado));
  trozo.append(elegirPropiedad(estado));
  for (const grupo of GRUPOS) trozo.append(dibujarGrupo(grupo, estado));
  trozo.append(dibujarFirmas(estado, agente));
  trozo.append(dibujarPrevia(estado, agente));
  trozo.append(dibujarBotones(estado, agente));

  return trozo;
}

/* Traer la dirección y el precio de una propiedad de la cartera ahorra tipeo y evita
   errores. El padrón no viene de RE/MAX (§12 del diseño) pero sí se recuerda el que se
   escribió antes para esa misma propiedad. */
function elegirPropiedad(estado) {
  const propiedades = Object.values(estado.datos.cartera || {})
    .filter((p) => p.activa)
    .sort((a, b) => String(a.direccion || "").localeCompare(String(b.direccion || "")));

  /* Plegado: la mayoria de las cartas oferta son de propiedades AJENAS, asi que esto es
     un atajo que se usa poco y no tiene por que ocupar lugar arriba de todo. */
  const marca = nodo(html`
    <details class="plegable">
      <summary class="plegable-cabeza">
        <span>Traer una propiedad de tu cartera</span>
        <span class="plegable-flecha" aria-hidden="true">›</span>
      </summary>
      <div class="plegable-cuerpo">
        <select class="campo" id="de-cartera">
          <option value="">Elegí una…</option>
          ${propiedades.map((p) => `<option value="${escapar(p.entity_id)}">`
            + `${escapar(p.direccion || "sin dirección")}</option>`).join("")}
        </select>
      </div>
    </details>
  `);

  marca.getElementById("de-cartera").addEventListener("change", (e) => {
    const p = (estado.datos.cartera || {})[e.target.value];
    if (!p) return;
    carta.valores.calle = p.direccion || "";
    carta.valores.barrio = p.barrio || "";
    if (!carta.valores.departamento) carta.valores.departamento = "Montevideo";
    if (p.precio) carta.valores.precio = Math.round(p.precio);
    const guardadoPadron = leerPadron(p.entity_id);
    if (guardadoPadron) carta.valores.padron = guardadoPadron;
    carta.propiedad = p.entity_id;
    guardar(estado);
    estado.redibujar();
  });

  return marca;
}

function dibujarGrupo(grupo, estado) {
  const campos = CAMPOS.filter((c) => c.quien === grupo.quien);
  const marca = nodo(html`
    <section class="tarjeta">
      <h2 class="titulo" style="font-size:16px">${grupo.nombre}</h2>
      <p class="apunte" style="margin:2px 0 10px">${grupo.pista}</p>
      <div class="campos-carta"></div>
    </section>
  `);

  const caja = marca.querySelector(".campos-carta");
  for (const campo of campos) caja.append(dibujarCampo(campo, estado));
  return marca;
}

function dibujarCampo(campo, estado) {
  const quitada = carta.quitadas.includes(campo.clave);
  const valor = carta.valores[campo.clave];
  const id = `carta-${campo.clave}`;

  const fila = document.createElement("div");
  fila.className = `fila-carta${quitada ? " quitada" : ""}`;

  if (quitada) {
    fila.innerHTML = html`
      <span class="fila-carta-nombre">${escapar(campo.etiqueta)}</span>
      <span class="fila-carta-fuera">no aparece en la carta</span>
      <button class="boton-mini" data-volver="1">Volver a poner</button>
    `;
    fila.querySelector("[data-volver]").addEventListener("click", () => {
      carta.quitadas = carta.quitadas.filter((c) => c !== campo.clave);
      guardar(estado);
      estado.redibujar();
    });
    return fila;
  }

  const control = campo.opciones
    ? html`<select class="campo" id="${id}">
        <option value="">—</option>
        ${campo.opciones.map((o) => `<option value="${escapar(o)}"`
          + `${o === valor ? " selected" : ""}>${escapar(o)}</option>`).join("")}
      </select>`
    : campo.tipo === "fecha"
      ? html`<input class="campo" id="${id}" type="date" value="${escapar(valor ?? "")}">`
      : campo.tipo === "monto"
        ? html`<input class="campo" id="${id}" type="text" inputmode="decimal"
            value="${valor ? plata(valor) : ""}" placeholder="0">`
        : campo.tipo === "entero"
          ? html`<input class="campo" id="${id}" type="number" min="1" value="${escapar(valor ?? "")}">`
          : html`<input class="campo" id="${id}" type="text" value="${escapar(valor ?? "")}">`;

  fila.innerHTML = html`
    <label for="${id}">${escapar(campo.etiqueta)}</label>
    ${control}
    ${campo.pista ? `<p class="apunte fila-carta-pista">${escapar(campo.pista)}</p>` : ""}
    ${campo.quitable ? '<button class="boton-mini fila-carta-quitar" data-quitar="1">Quitar</button>' : ""}
  `;

  const entrada = fila.querySelector(".campo");

  /* Se anota MIENTRAS SE ESCRIBE, no al salir de la casilla.

     Juan se quejó dos veces de que al confirmar un dato la pantalla se le iba al principio.
     En la computadora no pasa; en el teléfono sí, y no es la app: es el teclado. Al cerrarse
     el teclado el navegador rehace el alto de la página y devuelve el scroll donde puede.

     La salida no es pelearle al navegador: es que no haga falta confirmar nada. Si el dato
     ya quedó guardado tecla por tecla, tocar afuera no tiene que hacer nada, y da igual
     dónde termine el scroll porque no se perdió ningún trabajo. */
  const anotar = () => {
    const crudo = entrada.value;
    if (campo.tipo === "monto") carta.valores[campo.clave] = numeroDesde(crudo);
    else if (campo.tipo === "entero") carta.valores[campo.clave] = crudo === "" ? null : Number(crudo);
    else carta.valores[campo.clave] = crudo || null;

    if (campo.clave === "padron" && carta.propiedad) {
      guardarPadron(carta.propiedad, carta.valores.padron);
    }
    guardar(estado);
  };

  entrada.addEventListener("input", () => {
    anotar();
    /* La vista previa se repinta con calma: rehacerla en cada tecla cambia el alto de la
       página mientras se escribe, y eso es justamente lo que corre el scroll. */
    conCalma(() => refrescarLoQueCambia(nombrePropio(estado.datos.ajustes)));
  });

  /* `change` queda para los desplegables y las fechas, que no disparan `input` en todos
     los navegadores. Anota lo mismo, asi que repetirlo no cuesta nada. */
  entrada.addEventListener("change", () => {
    anotar();
    refrescarLoQueCambia(nombrePropio(estado.datos.ajustes));
  });

  const quitar = fila.querySelector("[data-quitar]");
  if (quitar) {
    quitar.addEventListener("click", () => {
      carta.quitadas.push(campo.clave);
      guardar(estado);
      estado.redibujar();
    });
  }
  return fila;
}

function dibujarFirmas(estado, agente) {
  const marca = nodo(html`
    <section class="tarjeta">
      <h2 class="titulo" style="font-size:16px">Las firmas</h2>
      <p class="apunte" style="margin:2px 0 10px">El que esté con vos firma acá mismo. El
        que no, firma desde el enlace. Las que queden en blanco se firman en el papel.</p>
      <div class="cajas-firma"></div>
    </section>
  `);

  const caja = marca.querySelector(".cajas-firma");
  for (const cual of FIRMAS) {
    const bytes = carta.firmas[cual.clave];
    const firma = bytes ? deBytes(bytes) : null;

    const item = document.createElement("div");
    item.className = "caja-firma";
    item.innerHTML = html`
      <span class="caja-firma-nombre">${cual.nombre}</span>
      <canvas class="caja-firma-lienzo" width="420" height="150"></canvas>
      <div class="botonera" style="margin-top:6px">
        <button class="boton-mini" data-firmar="${cual.clave}">
          ${firma ? "Firmar de nuevo" : "Firmar acá"}</button>
        ${cual.clave === "depositario"
          ? '<button class="boton-mini" data-mifirma="1">Usar mi firma</button>'
          : ""}
        ${firma ? `<button class="boton-mini" data-borrar="${cual.clave}">Sacar</button>` : ""}
      </div>
    `;

    const lienzo = item.querySelector("canvas");
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
    caja.append(item);
  }

  caja.addEventListener("click", (e) => {
    const boton = e.target.closest("button");
    if (!boton) return;

    if (boton.dataset.firmar) {
      const cual = FIRMAS.find((f) => f.clave === boton.dataset.firmar);
      pedirFirma({
        titulo: `Firma de ${cual.nombre.toLowerCase()}`,
        pie: cual.clave === "depositario" ? `${agente}, en representación de RE/MAX` : "",
        alFirmar: (bytes) => {
          carta.firmas[cual.clave] = bytes;
          guardar(estado);
          estado.redibujar();
        },
      });
    }

    /* Usa SIEMPRE la que esta guardada en Ajustes. Antes se cargaba la primera vez desde
       aca y despues no habia forma de cambiarla: quedaba pegada la vieja para siempre.
       Es un dato tuyo, no de esta carta, asi que se administra en un solo lugar. */
    if (boton.dataset.mifirma) {
      const mia = leerFirmaPropia();
      if (mia) {
        carta.firmas.depositario = mia.bytes;
        guardar(estado);
        estado.redibujar();
        return;
      }
      estado.irA("ajustes");
    }

    if (boton.dataset.borrar) {
      delete carta.firmas[boton.dataset.borrar];
      guardar(estado);
      estado.redibujar();
    }
  });

  return marca;
}

function dibujarPrevia(estado, agente) {
  const marca = nodo(html`
    <section class="tarjeta">
      <div class="tarjeta-titulo">
        <h2 class="titulo" style="font-size:16px">Cómo va quedando</h2>
        <button class="boton-mini" id="ver-previa">${mostrandoPrevia ? "Ocultar" : "Ver"}</button>
      </div>
      ${mostrandoPrevia ? '<div class="previa-carta"></div>' : ""}
    </section>
  `);

  marca.getElementById("ver-previa").addEventListener("click", () => {
    mostrandoPrevia = !mostrandoPrevia;
    estado.redibujar();
  });

  const donde = marca.querySelector(".previa-carta");
  if (donde) {
    vivos.previa = donde;   // para poder refrescarla sola, sin rehacer la pantalla
    pintarPrevia(donde, agente);
  }
  return marca;
}

/* Vuelca la carta adentro de un contenedor. Se llama al dibujar y otra vez cada vez que
   se carga un dato — pintar de nuevo un solo `<div>` no mueve el scroll de la pagina. */
function pintarPrevia(donde, agente) {
  const bloques = armar(carta.valores, carta.quitadas, {
    agente,
    firmadas: Object.keys(carta.firmas),
  });
  donde.replaceChildren();
  for (const bloque of bloques) {
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
}

function dibujarBotones(estado, agente) {
  const telefono = ((estado.datos.ajustes || {}).agente || {}).telefono || "";
  const marca = nodo(html`
    <section class="tarjeta">
      <h2 class="titulo" style="font-size:16px">Mandarla</h2>
      <p class="apunte" style="margin:2px 0 10px">Se manda el PDF, que en WhatsApp se ve
        como un archivo prolijo. Adentro trae un botón <strong>“Firmar en el celular”</strong>:
        el que lo recibe elige si firma en la pantalla o si lo imprime y firma a mano.</p>
      <div class="botonera">
        <button class="boton boton-chico boton-primario" data-mandar="comprador">
          Mandar al comprador</button>
        <button class="boton boton-chico boton-primario" data-mandar="propietario">
          Mandar al propietario</button>
        <button class="boton boton-chico" id="bajar-pdf">Bajar el PDF</button>
      </div>
      ${telefono ? "" : '<p class="apunte" style="margin-top:8px">⚠ Cargá tu teléfono en '
        + "Ajustes: sin eso, el que reciba la carta no te la puede devolver de un toque.</p>"}
      <p class="apunte" id="aviso-mandar" hidden style="margin-top:10px"></p>
    </section>
  `);

  /* Se agarra AHORA: `marca` es un fragmento y al insertarlo queda vacío. */
  const avisoMandar = marca.getElementById("aviso-mandar");
  const avisar = (texto) => {
    avisoMandar.hidden = false;
    avisoMandar.textContent = texto;
  };

  marca.querySelectorAll("[data-mandar]").forEach((boton) => {
    boton.addEventListener("click", async () => {
      const base = new URL("firmar.html", window.location.href).href;

      /* TU firma NO viaja en el enlace, y es lo que lo mantiene corto: sola pesa el 80%
         —1.761 caracteres contra 419 sin ella— y un enlace gigante en WhatsApp queda
         feo y da desconfianza. Tu teléfono la tiene guardada, y como firmar.html vive en
         el mismo dominio que la app, cuando te devuelven la carta tu propio celular la
         vuelve a poner. En el celular del cliente no hay nada guardado. */
      const firmas = { ...carta.firmas };
      delete firmas.depositario;

      /* Desde que sale del teléfono, la carta tiene número propio: es lo que hace que la
         vuelta de cada parte caiga en SU carta y no en la que esté abierta. */
      if (!carta.id) carta.id = nuevoId();

      const enlace = await aEnlace(base, {
        valores: carta.valores,
        quitadas: carta.quitadas,
        turno: boton.dataset.mandar,
        agente,
        firmas,
        id: carta.id,
        telefono,
      });

      /* Se manda el PDF y no el enlace pelado: en WhatsApp un archivo se ve prolijo y un
         enlace de doscientos caracteres se ve como un manotazo. El enlace va ADENTRO del
         PDF, en el boton "Firmar en el celular". */
      const bloques = armar(carta.valores, carta.quitadas, {
        agente, firmadas: Object.keys(carta.firmas),
      });
      const pdf = armarPDF(bloques, carta.firmas, await cargarMembrete(), enlace,
        boton.dataset.mandar).aBlob();
      const como = await mandarArchivo(pdf, nombreDelArchivo(carta.valores),
        "Te paso la oferta de compra. El PDF va aparte.");
      if (como === "bloqueado") {
        avisar("No pude compartir el PDF desde acá. Abrí la app desde su ícono en la "
          + "pantalla de inicio y probá de nuevo.");
        return;
      }
      /* Queda anotada en "En tránsito": a quién se le mandó y qué día. */
      carta = anotarMandada(carta, boton.dataset.mandar, estado.hoy);
      guardarEnHistorial(carta, carta.cuando || estado.hoy);
      guardar(estado);
      estado.redibujar();
    });
  });

  marca.getElementById("bajar-pdf").addEventListener("click", async () => {
    const bloques = armar(carta.valores, carta.quitadas, {
      agente, firmadas: Object.keys(carta.firmas),
    });
    /* Sin enlace adentro: este PDF es para imprimir o archivar, y un boton "Firmar en el
       celular" impreso en un papel no sirve para nada. */
    await bajarArchivo(armarPDF(bloques, carta.firmas, await cargarMembrete()).aBlob(),
      nombreDelArchivo(carta.valores));
  });

  return marca;
}

/* Los dos botones de arriba, y al lado el nombre de la carta que está abierta.

   Antes decía "Estás en" con la dirección debajo. El usuario lo sacó: lo que quiere ver
   es CÓMO SE LLAMA la carta y nada más. Manda el nombre que le puso al guardarla; si no
   le puso ninguno, la dirección — dos cartas sobre la misma propiedad, una por cada
   comprador, se distinguen solo por el nombre.

   Empezar una nueva PREGUNTA si guardar la de ahora, y con qué nombre. Sin preguntar,
   tocar el botón sin querer se lleva media hora de trabajo. */
function barraDeCartas(estado) {
  /* Las cartas mandadas y las guardadas viven en la MISMA lista: lo que las separa es en
     qué momento están. Tener dos listas paralelas era pedir que se desincronizaran. */
  const todas = leerHistorial();
  const enTransito = todas.filter((c) => estadoDeCarta(c) === "transito");
  const guardadas = ordenarParaElHistorial(todas.filter((c) => estadoDeCarta(c) !== "transito"));

  const marca = nodo(html`
    <section class="tarjeta tarjeta-apretada">
      <div class="cabeza-carta">
        <button class="boton boton-chico boton-primario" id="nueva">Nueva</button>
        ${enTransito.length
          ? html`<button class="boton boton-chico" id="ver-transito">
              En tránsito (${enTransito.length}) ${mostrandoTransito ? "▴" : "▾"}</button>`
          : ""}
        ${guardadas.length
          ? html`<button class="boton boton-chico" id="ver-historial">
              Historial (${guardadas.length}) ${mostrandoHistorial ? "▴" : "▾"}</button>`
          : ""}
        <span class="cabeza-carta-nombre">${escapar(comoSeLlamaLaCarta(carta))}</span>
      </div>

      ${preguntandoNueva ? html`
        <div class="aviso-nueva">
          ${semilla ? html`<p class="frase" style="margin-bottom:8px">Ya tenés una carta
            empezada y venís con el padrón <strong>${escapar(semilla.padron || "")}</strong>.</p>` : ""}
          <label class="etiqueta" for="nombre-guardado">¿Con qué nombre la guardo?</label>
          <input class="campo" id="nombre-guardado" type="text"
                 value="${escapar(carta.nombre || carta.valores.calle || "")}"
                 placeholder="Rivera 3393 — Acosta">
          <div class="botonera">
            <button class="boton boton-chico boton-primario" id="guardar-y-nueva">Guardar y empezar</button>
            <button class="boton boton-chico" id="solo-nueva">Empezar sin guardar</button>
            <button class="boton boton-chico" id="cancelar-nueva">${
              semilla ? "Agregarlo a esta carta" : "Cancelar"}</button>
          </div>
        </div>` : ""}

      ${mostrandoTransito ? html`
        <p class="apunte" style="margin:10px 0 6px">Las que ya mandaste. Cuando una parte te
          devuelve la suya y la traés, se marca sola acá.</p>
        <ul class="transito"></ul>` : ""}

      ${mostrandoHistorial ? html`<ul class="historial"></ul>` : ""}
    </section>
  `);

  vivos.nombre = marca.querySelector(".cabeza-carta-nombre");

  marca.getElementById("nueva").addEventListener("click", () => {
    if (!hayAlgoCargado()) {
      empezarDeCero(estado);
      return;
    }
    preguntandoNueva = true;
    estado.redibujar();
  });

  const conectar = (id, hacer) => {
    const boton = marca.getElementById(id);
    if (boton) boton.addEventListener("click", hacer);
  };
  /* Se agarra AHORA y no adentro del handler: `marca` es un fragmento, y al insertarlo
     en la pantalla queda vacío — buscar ahí adentro después devuelve null. */
  const campoNombre = marca.getElementById("nombre-guardado");
  conectar("guardar-y-nueva", () => {
    guardarEnHistorial({ ...carta, nombre: campoNombre.value.trim() }, estado.hoy);
    empezarDeCero(estado);
  });
  conectar("solo-nueva", () => empezarDeCero(estado));
  /* Sin padrón esperando es "Cancelar"; con padrón esperando es "Agregarlo a esta carta",
     porque tocó el botón para algo y dejarlo en la nada sería peor que no hacer nada. */
  conectar("cancelar-nueva", () => {
    preguntandoNueva = false;
    if (semilla) plantarSemilla(estado);
    estado.redibujar();
  });
  conectar("ver-transito", () => {
    mostrandoTransito = !mostrandoTransito;
    mostrandoHistorial = false;
    estado.redibujar();
  });
  conectar("ver-historial", () => {
    mostrandoHistorial = !mostrandoHistorial;
    mostrandoTransito = false;
    estado.redibujar();
  });

  const abrir = (guardada) => {
    carta = { ...guardada };
    mostrandoHistorial = false;
    mostrandoTransito = false;
    guardar(estado);
    estado.redibujar();
  };

  const cajaTransito = marca.querySelector(".transito");
  if (cajaTransito) {
    for (const guardada of enTransito) {
      cajaTransito.append(filaDeTransito(guardada, estado, abrir));
    }
  }

  const lista = marca.querySelector(".historial");
  if (lista) {
    for (const guardada of guardadas) {
      const li = document.createElement("li");
      li.className = "historial-fila";
      const cuantasFirmas = Object.keys(guardada.firmas).length;
      /* Las que ya se mandaron van marcadas: no se tocan mas, son el registro. */
      const cerrada = estadoDeCarta(guardada) === "completa";
      li.innerHTML = html`
        <button class="historial-abrir ${cerrada ? "historial-cerrada" : ""}" data-abrir="1">
          <span class="historial-nombre">${escapar(comoSeLlamaLaCarta(guardada))}</span>
          <span class="historial-cuando">${escapar(guardada.cuando || "")}${
            cuantasFirmas ? ` · ${cuantasFirmas} firma${cuantasFirmas > 1 ? "s" : ""}` : ""}${
            guardada.entregada ? " · enviada a las partes" : ""}</span>
        </button>
        <button class="boton-mini" data-borrar="1">Borrar</button>
      `;
      li.querySelector("[data-abrir]").addEventListener("click", () => abrir(guardada));
      li.querySelector("[data-borrar]").addEventListener("click", () => {
        borrarDelHistorial(guardada.id);
        estado.redibujar();
      });
      lista.append(li);
    }
  }

  return marca;
}

/* Un renglón del tablero: quién la tiene, quién ya contestó y qué falta hacer. */
function filaDeTransito(guardada, estado, abrir) {
  const li = document.createElement("li");
  li.className = "historial-fila transito-fila";
  const pronta = estaPronta(guardada);
  const partes = ["comprador", "propietario"]
    .filter((t) => mandadas(guardada)[t])
    .map((t) => {
      const nombre = t === "comprador" ? "Comprador" : "Propietario";
      return vueltas(guardada)[t]
        ? `<span class="transito-parte transito-listo">✓ ${nombre}</span>`
        : `<span class="transito-parte transito-espera">⋯ ${nombre}</span>`;
    }).join("");

  li.innerHTML = html`
    <button class="historial-abrir" data-abrir="1">
      <span class="historial-nombre">${escapar(comoSeLlamaLaCarta(guardada))}</span>
      <span class="historial-cuando ${pronta ? "transito-pronta" : ""}">${
        escapar(comoVaLaCarta(guardada))}</span>
      <span class="transito-partes">${partes}</span>
    </button>
    ${pronta ? html`<button class="boton-mini boton-mini-urgente" data-cerrar="1">Ya la envié</button>` : ""}
  `;
  /* Tocarla NO la abre: muestra una ventanita para controlar lo que llenó el cliente sin
     perder lo que se esté haciendo. Adentro está el botón para abrirla de verdad. */
  li.querySelector("[data-abrir]").addEventListener("click", () => {
    mirarCarta(guardada, {
      agente: nombrePropio(estado.datos.ajustes),
      alAbrir: () => abrir(guardada),
    });
  });

  /* "Ya la envié" es el final del camino: la carta deja el tablero y pasa al historial como
     completa. Se abre además, porque lo que sigue es mandarles el PDF final con el botón
     de abajo, que ya sabe armarlo con las dos firmas. */
  const cerrar = li.querySelector("[data-cerrar]");
  if (cerrar) {
    cerrar.addEventListener("click", () => {
      const cerrada = anotarEntregada(guardada, estado.hoy);
      guardarEnHistorial(cerrada, cerrada.cuando || estado.hoy);
      carta = { ...cerrada };
      mostrandoTransito = false;
      guardar(estado);
      estado.redibujar();
    });
  }
  return li;
}

function empezarDeCero(estado) {
  preguntandoNueva = false;
  mostrandoHistorial = false;
  mostrandoTransito = false;
  borrarBorrador();
  carta = null;
  arrancar(estado);
  if (semilla) plantarSemilla(estado);
  guardar(estado);
  estado.redibujar();
}
