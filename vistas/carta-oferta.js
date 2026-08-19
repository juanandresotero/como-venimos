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
import { deBytes } from "../lib/firma.js";
import { dibujarEn } from "../lib/firma-dibujo.js";
import { pedirFirma, pedirFirmaDeFoto } from "./firma-panel.js";
import {
  leerBorrador, guardarBorrador, borrarBorrador,
  leerFirmaPropia, guardarFirmaPropia, leerPadron, guardarPadron,
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

/* Lo que se está llenando ahora. Se lee del teléfono al abrir la pantalla. */
let carta = null;
let mostrandoPrevia = false;

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

  const marca = nodo(html`
    <section class="tarjeta">
      <label class="etiqueta" for="de-cartera">Traer de tu cartera</label>
      <select class="campo" id="de-cartera">
        <option value="">Otra propiedad (la escribo yo)</option>
        ${propiedades.map((p) => `<option value="${escapar(p.entity_id)}">`
          + `${escapar(p.direccion || "sin dirección")}</option>`).join("")}
      </select>
      <p class="apunte" style="margin-top:6px">La mayoría de las cartas oferta son de
        propiedades ajenas, así que esto es un atajo, no el camino.</p>
    </section>
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
    if (mostrandoPrevia) estado.redibujar();
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
        { color: "#0b0f1a", grosor: 4 });
    } else {
      ctx.strokeStyle = "#c9d2e4";
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

    if (boton.dataset.mifirma) {
      const mia = leerFirmaPropia();
      if (mia) {
        carta.firmas.depositario = mia.bytes;
        guardar(estado);
        estado.redibujar();
        return;
      }
      pedirFirmaDeFoto({
        alFirmar: (bytes) => {
          guardarFirmaPropia(bytes, estado.hoy);
          carta.firmas.depositario = bytes;
          guardar(estado);
          estado.redibujar();
        },
      });
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
      <div class="botonera" style="margin-top:14px">
        <button class="boton boton-chico boton-borrar" id="vaciar">Empezar de nuevo</button>
      </div>
    </section>
  `);

  marca.querySelectorAll("[data-mandar]").forEach((boton) => {
    boton.addEventListener("click", async () => {
      const base = new URL("firmar.html", window.location.href).href;
      const enlace = await aEnlace(base, {
        valores: carta.valores,
        quitadas: carta.quitadas,
        turno: boton.dataset.mandar,
        telefono_agente: telefono,
        agente,
        firmas: carta.firmas,
      });
      const quien = boton.dataset.mandar === "comprador" ? "comprador" : "propietario";
      window.open(comoWhatsApp(enlace, {
        texto: `Te paso la oferta de compra para que la leas y la firmes desde el celular. `
          + `Si preferís, también la podés imprimir y firmarla a mano.`,
      }), "_blank", "noopener");
      if (!quien) return;
    });
  });

  marca.getElementById("bajar-pdf").addEventListener("click", () => {
    const bloques = armar(carta.valores, carta.quitadas, {
      agente, firmadas: Object.keys(carta.firmas),
    });
    const blob = armarPDF(bloques, carta.firmas).aBlob();
    const url = URL.createObjectURL(blob);
    const enlace = document.createElement("a");
    enlace.href = url;
    enlace.download = nombreDelArchivo(carta.valores);
    enlace.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  });

  marca.getElementById("vaciar").addEventListener("click", () => {
    if (!window.confirm("¿Vaciar la carta y empezar de nuevo?")) return;
    borrarBorrador();
    carta = null;
    arrancar(estado);
    estado.redibujar();
  });

  return marca;
}
