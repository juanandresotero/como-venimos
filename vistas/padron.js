/* "¿Qué padrón es?" — de la dirección al padrón.

   Solo Montevideo, y eso se dice de frente. Un padrón equivocado identifica OTRA
   propiedad en un documento que obliga, así que acá no se adivina nunca: o está en la
   tabla oficial de la Intendencia, o se dice que no está y se ofrece el visor de
   Catastro.

   Da el padrón del EDIFICIO. En propiedad horizontal la carta se escribe "padrón NNNN,
   unidad 202": el padrón lo pone esto y la unidad la ponés vos. */

import {
  buscar, sugerir, normalizar, papelesDeCatastro, VISOR_CATASTRO, DEPARTAMENTO_CUBIERTO,
} from "../lib/padrones.js";
import { DEPARTAMENTOS } from "../lib/carta-oferta.js";
import { leerBorrador, guardarBorrador } from "../lib/carta-guardado.js";
import { escapar } from "../lib/formato.js";

const html = (c, ...v) => c.reduce((t, x, i) => t + x + (v[i] ?? ""), "");

function nodo(marca) {
  const molde = document.createElement("template");
  molde.innerHTML = marca.trim();
  return molde.content;
}

const CAMPOS = [
  { clave: "calle", etiqueta: "Calle", pista: "Fermín Ferreira", tipo: "text" },
  { clave: "puerta", etiqueta: "N° de puerta", pista: "1881", tipo: "text" },
  { clave: "apartamento", etiqueta: "N° de apartamento", pista: "202 — opcional", tipo: "text" },
  { clave: "bloque", etiqueta: "Bloque", pista: "B — opcional, para complejos", tipo: "text" },
];

const entradas = { calle: "", puerta: "", apartamento: "", bloque: "", departamento: DEPARTAMENTO_CUBIERTO };
let resultado = null;
let buscando = false;
let calles = null;

async function traerCalles() {
  if (calles) return calles;
  try {
    const r = await fetch(new URL("datos/padrones/calles.json", window.location.href));
    calles = r.ok ? await r.json() : [];
  } catch {
    calles = [];
  }
  return calles;
}

export function dibujarPadron(estado) {
  traerCalles().then(() => {
    if (!calles.length) return;
  });

  const trozo = document.createDocumentFragment();

  trozo.append(nodo(html`
    <section style="margin-bottom:16px">
      <h1 class="titulo" style="font-size:26px">¿Qué padrón es?</h1>
      <p class="apunte" style="margin-top:4px">Sale de la tabla oficial de la Intendencia
        de Montevideo. Es el padrón del edificio: si es un apartamento, la carta se escribe
        “padrón tanto, unidad tanto”.</p>
    </section>
  `));

  trozo.append(formulario(estado));
  if (resultado) trozo.append(dibujarResultado(estado));

  return trozo;
}

function formulario(estado) {
  const marca = nodo(html`
    <section class="tarjeta">
      <div class="campos-carta">
        ${CAMPOS.map((c) => html`
          <div class="fila-carta">
            <label for="p-${c.clave}">${escapar(c.etiqueta)}</label>
            <input class="campo" id="p-${c.clave}" type="${c.tipo}"
                   value="${escapar(entradas[c.clave])}" placeholder="${escapar(c.pista)}"
                   ${c.clave === "calle" ? 'list="lista-calles" autocomplete="off"' : ""}>
          </div>
        `).join("")}
        <datalist id="lista-calles"></datalist>
        <div class="fila-carta">
          <label for="p-departamento">Departamento</label>
          <select class="campo" id="p-departamento">
            ${DEPARTAMENTOS.map((d) => `<option value="${escapar(d)}"`
              + `${d === entradas.departamento ? " selected" : ""}>${escapar(d)}</option>`).join("")}
          </select>
        </div>
      </div>
      <div class="botonera">
        <button class="boton boton-primario" id="buscar" ${buscando ? "disabled" : ""}>
          ${buscando ? "Buscando…" : "Buscar el padrón"}</button>
      </div>
    </section>
  `);

  for (const c of CAMPOS) {
    const campo = marca.getElementById(`p-${c.clave}`);
    campo.addEventListener("input", () => { entradas[c.clave] = campo.value; });
    campo.addEventListener("change", () => { entradas[c.clave] = campo.value; });
  }

  /* El desplegable de calles se llena mientras escribe: son 4.455 nombres y ponerlos
     todos de una hace que el teclado se trabe en el teléfono. */
  const calle = marca.getElementById("p-calle");
  const lista = marca.getElementById("lista-calles");
  calle.addEventListener("input", async () => {
    const opciones = sugerir(await traerCalles(), calle.value, 8);
    lista.innerHTML = opciones.map((o) => `<option value="${escapar(o)}"></option>`).join("");
  });

  const departamento = marca.getElementById("p-departamento");
  departamento.addEventListener("change", () => {
    entradas.departamento = departamento.value;
    resultado = null;
    estado.redibujar();
  });

  marca.getElementById("buscar").addEventListener("click", async () => {
    buscando = true;
    estado.redibujar();
    resultado = await buscar({
      calle: entradas.calle,
      numero: entradas.puerta,
      departamento: entradas.departamento,
    });
    buscando = false;
    estado.redibujar();
  });

  return marca;
}

/* Como se escribe el inmueble, con unidad y bloque si los hay. Es el texto que despues
   va a la carta y el que se manda por WhatsApp. */
function comoSeNombra(padron) {
  const partes = [`Padrón ${padron}`];
  if (entradas.apartamento.trim()) partes.push(`unidad ${entradas.apartamento.trim()}`);
  if (entradas.bloque.trim()) partes.push(`bloque ${entradas.bloque.trim()}`);
  return partes.join(", ");
}

function usarEnLaCarta(estado, padron) {
  const borrador = leerBorrador() || { valores: {}, quitadas: [], firmas: {} };
  borrador.valores.padron = comoSeNombra(padron).replace(/^Padrón /, "");
  if (entradas.calle.trim()) {
    borrador.valores.calle = `${entradas.calle.trim()} ${entradas.puerta.trim()}`.trim();
  }
  borrador.valores.departamento = entradas.departamento;
  guardarBorrador(borrador, estado.hoy);
  estado.irA("carta_oferta");
}

function abrirVisor() {
  window.open(VISOR_CATASTRO, "_blank", "noopener");
}

function dibujarResultado(estado) {
  const r = resultado;

  if (r.estado === "fuera-de-montevideo") {
    const marca = nodo(html`
      <section class="tarjeta">
        <p class="etiqueta">${escapar(r.departamento)}</p>
        <p class="frase" style="margin-top:6px">Solo tengo los padrones de Montevideo. La
          Intendencia de Montevideo publica su tabla de direcciones; las demás no.</p>
        <p class="apunte" style="margin-top:8px">En la carta oferta podés <strong>quitar</strong>
          la casilla del padrón y la frase se cierra sola.</p>
        <div class="botonera">
          <button class="boton boton-chico boton-primario" id="visor">Abrir el visor de Catastro</button>
        </div>
      </section>
    `);
    marca.getElementById("visor").addEventListener("click", abrirVisor);
    return marca;
  }

  if (r.estado === "sin-datos") {
    return nodo(html`
      <section class="tarjeta">
        <p class="frase">No pude abrir la tabla de padrones. Puede ser que estés sin señal
          — probá de nuevo cuando tengas internet.</p>
      </section>
    `);
  }

  if (r.estado === "calle-desconocida") {
    const parecidas = sugerir(calles || [], entradas.calle, 6);
    const marca = nodo(html`
      <section class="tarjeta">
        <p class="frase">No encontré la calle <strong>${escapar(entradas.calle || "—")}</strong>.</p>
        ${parecidas.length
          ? html`<p class="apunte" style="margin-top:8px">¿Alguna de estas?</p>
                 <div class="tags" style="margin-top:8px">
                   ${parecidas.map((c) => `<button class="tag" data-calle="${escapar(c)}">${escapar(c)}</button>`).join("")}
                 </div>`
          : '<p class="apunte" style="margin-top:8px">Fijate cómo está escrita: en la tabla '
            + 'oficial muchas llevan “AV”, “CNO” o “DR” adelante.</p>'}
        <div class="botonera">
          <button class="boton boton-chico" id="visor">Abrir el visor de Catastro</button>
        </div>
      </section>
    `);
    marca.querySelectorAll("[data-calle]").forEach((b) => {
      b.addEventListener("click", () => {
        entradas.calle = b.dataset.calle;
        resultado = null;
        estado.redibujar();
      });
    });
    marca.getElementById("visor").addEventListener("click", abrirVisor);
    return marca;
  }

  if (r.estado === "sin-numero") {
    return nodo(html`
      <section class="tarjeta">
        <p class="frase">Falta el número de puerta. <strong>${escapar(r.calle)}</strong>
          tiene ${r.puertas} direcciones cargadas.</p>
      </section>
    `);
  }

  if (r.estado === "sin-numero-exacto") {
    const marca = nodo(html`
      <section class="tarjeta">
        <p class="frase">En <strong>${escapar(r.calle)}</strong> no existe el número
          <strong>${r.numero}</strong>.</p>
        <p class="apunte" style="margin-top:8px">RE/MAX publica muchas direcciones
          redondeadas a la cuadra. Estos son los más cercanos que sí existen:</p>
        <div class="cercanos">
          ${r.cercanos.map((c) => html`
            <button class="cercano" data-padron="${escapar(c.padron)}" data-numero="${c.numero}">
              <span class="cercano-numero">${c.numero}</span>
              <span class="cercano-padron">padrón ${escapar(c.padron)}</span>
            </button>
          `).join("")}
        </div>
        <div class="botonera">
          <button class="boton boton-chico" id="visor">Abrir el visor de Catastro</button>
        </div>
      </section>
    `);
    marca.querySelectorAll("[data-padron]").forEach((b) => {
      b.addEventListener("click", () => {
        entradas.puerta = b.dataset.numero;
        resultado = { estado: "encontrado", padron: b.dataset.padron, calle: r.calle,
          numero: Number(b.dataset.numero) };
        estado.redibujar();
      });
    });
    marca.getElementById("visor").addEventListener("click", abrirVisor);
    return marca;
  }

  const telefono = ((estado.datos.ajustes || {}).agente || {}).telefono || "";
  const marca = nodo(html`
    <section class="tarjeta">
      <p class="etiqueta">${escapar(r.calle)} ${r.numero}</p>
      <p class="cifra cifra-heroe" style="margin:6px 0 2px">${escapar(r.padron)}</p>
      <p class="apunte">${escapar(comoSeNombra(r.padron))}</p>
      <div class="botonera">
        <button class="boton boton-primario" id="a-la-carta">Usar en la carta oferta</button>
      </div>
      <p class="etiqueta" style="margin-top:16px">Papeles de Catastro</p>
      <div class="papeles"></div>
      <div class="botonera">
        <button class="boton boton-chico" id="mandar">Mandarlos por WhatsApp</button>
      </div>
      <p class="apunte" style="margin-top:10px">Es el padrón del edificio. Si es un
        apartamento, en la carta va “padrón ${escapar(r.padron)}, unidad ${escapar(entradas.apartamento || "…")}”.</p>
    </section>
  `);

  /* Los cuatro papeles oficiales. Los tres primeros bajan un PDF de verdad; el ultimo
     abre el visor, porque el croquis de manzana y el listado de planos no tienen
     direccion directa. */
  const papeles = papelesDeCatastro(r.padron, {
    apartamento: entradas.apartamento, bloque: entradas.bloque,
  });
  const caja = marca.querySelector(".papeles");
  for (const papel of papeles) {
    const a = document.createElement("a");
    a.className = "papel";
    a.href = papel.url;
    a.target = "_blank";
    a.rel = "noopener";
    a.innerHTML = html`<span class="papel-nombre">${escapar(papel.nombre)}</span>`
      + (papel.pdf ? '<span class="papel-tipo">PDF</span>' : '<span class="papel-tipo">web</span>');
    caja.append(a);
  }

  marca.getElementById("a-la-carta").addEventListener("click", () => usarEnLaCarta(estado, r.padron));
  marca.getElementById("mandar").addEventListener("click", () => {
    const texto = [`${comoSeNombra(r.padron)} — ${entradas.calle} ${r.numero}`, ""]
      .concat(papeles.map((p) => `${p.nombre}:\n${p.url}`))
      .join("\n");
    window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, "_blank", "noopener");
  });
  return marca;
}
