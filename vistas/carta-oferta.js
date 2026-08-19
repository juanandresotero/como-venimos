/* La carta oferta: llenarla, firmarla y mandarla.

   Lo que manda acá es que cada casilla tiene TRES puertas y no dos: la lleno, la dejo
   vacía para que la complete el otro, o la saco y la frase se cierra sola. Por eso cada
   fila tiene su botón de quitar, y por eso hay una vista previa: es el único lugar donde
   se ve el efecto de haber sacado algo.

   Los datos de la carta NO van al repositorio, que es público. Van al teléfono, igual que
   las cuentas bancarias. */

import { CAMPOS, POR_CLAVE, armar } from "../lib/carta-oferta.js";
import { aEnlace, comoWhatsApp } from "../lib/carta-enlace.js";
import { armarPDF, nombreDelArchivo } from "../lib/carta-pdf.js";
import { cargarMembrete } from "../lib/membrete.js";
import { deBytes } from "../lib/firma.js";
import { dibujarEn, tintaDePantalla } from "../lib/firma-dibujo.js";
import { pedirFirma } from "./firma-panel.js";
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

  const agente = nombrePropio(estado.datos.ajustes);
  const trozo = document.createDocumentFragment();

  trozo.append(nodo(html`
    <section style="margin-bottom:16px">
      <button class="boton boton-chico" id="volver">‹ Herramientas</button>
      <h1 class="titulo" style="font-size:26px;margin-top:12px">Carta oferta</h1>
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

  trozo.getElementById("volver").addEventListener("click", () => estado.irA("herramientas"));
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
  entrada.addEventListener("change", () => {
    const crudo = entrada.value;
    if (campo.tipo === "monto") carta.valores[campo.clave] = numeroDesde(crudo);
    else if (campo.tipo === "entero") carta.valores[campo.clave] = crudo === "" ? null : Number(crudo);
    else carta.valores[campo.clave] = crudo || null;

    if (campo.clave === "padron" && carta.propiedad) {
      guardarPadron(carta.propiedad, carta.valores.padron);
    }
    guardar(estado);
    /* La direccion es el nombre de la carta y sale en la barra de arriba: si no se
       redibuja, la barra sigue diciendo "Carta sin dirección" con la carta ya llena. */
    if (mostrandoPrevia || campo.clave === "calle") estado.redibujar();
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
  const bloques = armar(carta.valores, carta.quitadas, {
    agente,
    firmadas: Object.keys(carta.firmas),
  });

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
  return marca;
}

function dibujarBotones(estado, agente) {
  const telefono = ((estado.datos.ajustes || {}).agente || {}).telefono || "";
  const marca = nodo(html`
    <section class="tarjeta">
      <h2 class="titulo" style="font-size:16px">Mandarla</h2>
      <p class="apunte" style="margin:2px 0 10px">El enlace abre la carta en el celular
        del otro para que la complete y la firme. El PDF es para imprimir o archivar.</p>
      <div class="botonera">
        <button class="boton boton-chico boton-primario" data-mandar="comprador">
          Enviar al comprador</button>
        <button class="boton boton-chico boton-primario" data-mandar="propietario">
          Enviar al propietario</button>
        <button class="boton boton-chico" id="bajar-pdf">Bajar el PDF</button>
      </div>
      ${telefono ? "" : '<p class="apunte" style="margin-top:8px">⚠ Cargá tu teléfono en '
        + "Ajustes: sin eso, el que reciba la carta no te la puede devolver de un toque.</p>"}
    </section>
  `);

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

      const enlace = await aEnlace(base, {
        valores: carta.valores,
        quitadas: carta.quitadas,
        turno: boton.dataset.mandar,
        agente,
        firmas,
      });
      window.open(comoWhatsApp(enlace, {
        texto: "Te paso la oferta de compra. Se lee y se firma en el celular; si preferís, "
          + "también la podés bajar en PDF e imprimirla.",
      }), "_blank", "noopener");
    });
  });

  marca.getElementById("bajar-pdf").addEventListener("click", async () => {
    const bloques = armar(carta.valores, carta.quitadas, {
      agente, firmadas: Object.keys(carta.firmas),
    });
    const blob = armarPDF(bloques, carta.firmas, await cargarMembrete()).aBlob();
    const url = URL.createObjectURL(blob);
    const enlace = document.createElement("a");
    enlace.href = url;
    enlace.download = nombreDelArchivo(carta.valores);
    enlace.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  });

  return marca;
}

/* Qué carta está abierta, y el cajón con las anteriores.

   Al principio no habia historial a proposito: el estado viaja en el enlace y WhatsApp
   hace de seguimiento. El usuario lo pidio despues de usarlo — que es cuando se sabe — y
   tenia razon: la carta que uno mando ayer se quiere volver a mirar.

   Empezar una nueva PREGUNTA si guardar la de ahora. Sin preguntar, tocar el boton sin
   querer se lleva media hora de trabajo. */
function barraDeCartas(estado) {
  const historial = leerHistorial();
  const titulo = comoSeLlamaLaCarta(carta);

  /* Lo que viene puesto de fabrica no cuenta como "hay algo cargado". */
  const DE_FABRICA = ["dias_reserva", "dias_validez", "fecha_oferta"];
  const hayAlgoCargado = () =>
    Object.keys(carta.valores).some((k) => !DE_FABRICA.includes(k) && carta.valores[k])
    || Object.keys(carta.firmas).length > 0;

  const marca = nodo(html`
    <section class="tarjeta tarjeta-apretada">
      <div class="tarjeta-titulo" style="margin-bottom:0">
        <div style="min-width:0">
          <p class="etiqueta">Estás en</p>
          <p class="frase" style="font-weight:650">${escapar(titulo)}</p>
        </div>
        <button class="boton-mini" id="nueva">+ Nueva</button>
      </div>

      ${preguntandoNueva ? html`
        <div class="aviso-nueva">
          <p class="apunte">¿Guardo esta carta en el historial antes de empezar otra?</p>
          <div class="botonera">
            <button class="boton boton-chico boton-primario" id="guardar-y-nueva">Guardar y empezar</button>
            <button class="boton boton-chico" id="solo-nueva">Empezar sin guardar</button>
            <button class="boton boton-chico" id="cancelar-nueva">Cancelar</button>
          </div>
        </div>` : ""}

      ${historial.length ? html`
        <button class="boton-mini" id="ver-historial" style="margin-top:10px">
          ${mostrandoHistorial ? "Ocultar" : `Historial (${historial.length})`}</button>` : ""}

      ${mostrandoHistorial ? html`<ul class="historial"></ul>` : ""}
    </section>
  `);

  marca.getElementById("nueva").addEventListener("click", () => {
    /* Se mira AHORA y no cuando se dibujo la pantalla: si se mirara al dibujar, lo que
       el usuario escribio despues no contaria y el boton le borraria el trabajo sin
       preguntar. Paso en la prueba. */
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
  conectar("guardar-y-nueva", () => {
    guardarEnHistorial(carta, estado.hoy);
    empezarDeCero(estado);
  });
  conectar("solo-nueva", () => empezarDeCero(estado));
  conectar("cancelar-nueva", () => {
    preguntandoNueva = false;
    estado.redibujar();
  });
  conectar("ver-historial", () => {
    mostrandoHistorial = !mostrandoHistorial;
    estado.redibujar();
  });

  const lista = marca.querySelector(".historial");
  if (lista) {
    for (const guardada of historial) {
      const li = document.createElement("li");
      li.className = "historial-fila";
      li.innerHTML = html`
        <button class="historial-abrir" data-abrir="${escapar(guardada.id)}">
          <span class="historial-nombre">${escapar(comoSeLlamaLaCarta(guardada))}</span>
          <span class="historial-cuando">${escapar(guardada.cuando || "")}${
            Object.keys(guardada.firmas).length
              ? ` · ${Object.keys(guardada.firmas).length} firma${Object.keys(guardada.firmas).length > 1 ? "s" : ""}`
              : ""}</span>
        </button>
        <button class="boton-mini" data-borrar="${escapar(guardada.id)}">Borrar</button>
      `;
      li.querySelector("[data-abrir]").addEventListener("click", () => {
        carta = { ...guardada };
        mostrandoHistorial = false;
        guardar(estado);
        estado.redibujar();
      });
      li.querySelector("[data-borrar]").addEventListener("click", () => {
        borrarDelHistorial(guardada.id);
        estado.redibujar();
      });
      lista.append(li);
    }
  }

  return marca;
}

function empezarDeCero(estado) {
  preguntandoNueva = false;
  mostrandoHistorial = false;
  borrarBorrador();
  carta = null;
  arrancar(estado);
  guardar(estado);
  estado.redibujar();
}
