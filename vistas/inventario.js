/* Inventarios: el estado de una propiedad el día que se entrega.

   Se usa PARADO EN EL MEDIO DE UN APARTAMENTO, con el teléfono en una mano. Eso manda sobre
   todo lo demás:

     - Todo arranca en "buen estado" y sólo se tocan las excepciones. En el inventario de
       Leyenda patria son 165 casilleros y más de tres de cada cuatro dicen lo mismo.
     - Se guarda solo en cada cambio. No hay ningún momento razonable para acordarse de
       apretar "guardar" con un cliente esperando.
     - El detalle sólo aparece cuando hace falta escribirlo. Un campo de texto vacío al lado
       de cada una de las 165 filas es una pantalla imposible de leer.

   La lista de arriba son los inventarios ya hechos. Viven en el teléfono, nunca en el
   repositorio: es la casa de un cliente. */

import {
  ESTADOS, TIPOS_DE_AMBIENTE, AVISO_RECLAMO, comoSeLee, conCantidad,
  nuevoInventario, nuevoAmbiente, nuevoItem, numerar, comoSeLlama, comoVa, cuenta,
} from "../lib/inventario.js";
import * as guardado from "../lib/inventario-guardado.js";
import { armarPDF, nombreArchivo } from "../lib/inventario-pdf.js";
import { bajarArchivo } from "../lib/compartir.js";
import { escapar } from "../lib/formato.js";

const html = (c, ...v) => c.reduce((t, x, i) => t + x + (v[i] ?? ""), "");

function nodo(marca) {
  const molde = document.createElement("template");
  molde.innerHTML = marca.trim();
  return molde.content;
}

/* Cuál se está editando. Vive afuera porque la pantalla se redibuja entera en cada cambio y
   perder el inventario abierto en cada tecla no sería usable. */
let abierto = null;
let cabeceraAbierta = false;

const guardarYRedibujar = (estado) => {
  guardado.guardar(abierto);
  estado.redibujar();
};

export function dibujarInventario(estado) {
  const trozo = document.createDocumentFragment();
  if (abierto) return editor(estado, trozo);
  return lista(estado, trozo);
}

/* ---------- La lista ---------- */

function lista(estado, trozo) {
  const hechos = guardado.leer();

  trozo.append(nodo(html`
    <section style="margin-bottom:16px">
      <p class="etiqueta">Herramientas</p>
      <h1 class="titulo" style="font-size:27px;margin-top:4px">Inventarios</h1>
      <p class="apunte" style="margin-top:6px">
        El estado de la propiedad el día que se entrega. Todo arranca en buen estado: sólo
        marcás lo que tiene algo.
      </p>
    </section>

    <div class="botonera" style="margin-bottom:16px">
      <button class="boton boton-primario" id="nuevo">+ Nuevo inventario</button>
    </div>
  `));

  if (!hechos.length) {
    trozo.append(nodo(html`
      <section class="tarjeta">
        <p class="apunte">Todavía no hiciste ninguno. Tocá <strong>+ Nuevo inventario</strong>
        y elegí los ambientes que tiene la propiedad.</p>
      </section>`));
  }

  for (const inv of hechos) {
    const va = comoVa(inv);
    const fila = nodo(html`
      <button class="fila" data-abrir="${escapar(inv.id)}">
        <span class="fila-cuerpo">
          <span class="fila-titulo">${escapar(comoSeLlama(inv) || "Sin dirección")}</span>
          <span class="fila-marca">
            <span class="fila-sub">${escapar(inv.fecha || "sin fecha")} ·
              ${va.ambientes} ambientes · ${va.items} cosas</span>
          </span>
        </span>
        <span class="fila-derecha fila-plata">
          <span class="cifra cifra-media">${va.conDetalle}</span>
          <span class="fila-sub">con detalle</span>
        </span>
      </button>
    `);
    fila.querySelector("[data-abrir]").addEventListener("click", () => {
      abierto = inv;
      estado.redibujar();
    });
    trozo.append(fila);
  }

  trozo.querySelector("#nuevo").addEventListener("click", () => {
    abierto = nuevoInventario(estado.hoy);
    cabeceraAbierta = true;
    guardarYRedibujar(estado);
  });
  return trozo;
}

/* ---------- El editor ---------- */

function editor(estado, trozo) {
  abierto.ambientes = numerar(abierto.ambientes);
  const va = comoVa(abierto);

  trozo.append(nodo(html`
    <section style="margin-bottom:12px">
      <button class="filtro" id="volver">‹ Todos los inventarios</button>
      <h1 class="titulo" style="font-size:23px;margin-top:10px">
        ${escapar(comoSeLlama(abierto) || "Inventario nuevo")}</h1>
      <p class="apunte" style="margin-top:4px">
        ${escapar(abierto.fecha || "sin fecha")} · ${va.ambientes} ambientes ·
        ${va.items} cosas · <strong>${va.conDetalle} con detalle</strong>
      </p>
    </section>
  `));

  trozo.append(cabecera(estado));
  for (const ambiente of abierto.ambientes) trozo.append(elAmbiente(estado, ambiente));
  trozo.append(agregarAmbiente(estado));
  trozo.append(elPie(estado));

  trozo.querySelector("#volver").addEventListener("click", () => {
    abierto = null;
    estado.redibujar();
  });
  return trozo;
}

/* La cabecera vive plegada: se llena una vez al empezar y después estorba. */
function cabecera(estado) {
  const campos = [
    ["fecha", "Fecha", "date"],
    ["direccion", "Dirección y número", "text"],
    ["unidad", "Apartamento / bloque", "text"],
    ["edificio", "Nombre del edificio", "text"],
    ["barrio", "Barrio o balneario", "text"],
    ["link_fotos", "Link a las fotos", "text"],
  ];

  const seccion = nodo(html`
    <section class="tarjeta">
      <div class="tarjeta-titulo">
        <h2 class="titulo" style="font-size:17px">La propiedad</h2>
        <button class="filtro" id="plegar">${cabeceraAbierta ? "Ocultar" : "Editar"}</button>
      </div>
      ${cabeceraAbierta ? html`<div id="campos-cabecera"></div>` : html`
        <p class="apunte">${escapar(comoSeLlama(abierto) || "Falta la dirección")}</p>`}
    </section>
  `);

  const caja = seccion.getElementById("campos-cabecera");
  if (caja) {
    for (const [clave, etiqueta, tipo] of campos) {
      const fila = nodo(html`
        <div class="campo-fila">
          <label for="inv-${clave}">${etiqueta}</label>
          <input class="campo" id="inv-${clave}" type="${tipo}"
                 value="${escapar(abierto[clave] || "")}">
        </div>`);
      fila.querySelector("input").addEventListener("change", (e) => {
        abierto[clave] = e.target.value;
        guardarYRedibujar(estado);
      });
      caja.append(fila);
    }
  }
  seccion.getElementById("plegar").addEventListener("click", () => {
    cabeceraAbierta = !cabeceraAbierta;
    estado.redibujar();
  });
  return seccion;
}

/* ---------- Un ambiente ---------- */

function elAmbiente(estado, ambiente) {
  const usados = ambiente.items.filter(cuenta).length;

  /* EL NOMBRE DEL AMBIENTE SE ESCRIBE. Es lo que pidió Juan para poder poner "Cochera",
     "Depósito" o lo que tenga esa propiedad, y de paso sirve para renombrar: "Dormitorio 1"
     puede ser "Dormitorio del fondo". */
  const seccion = nodo(html`
    <section class="tarjeta">
      <div class="tarjeta-titulo">
        <input class="campo" id="amb-${escapar(ambiente.id)}" type="text"
               value="${escapar(ambiente.nombre)}" placeholder="¿Qué ambiente es?"
               style="font-size:17px;font-weight:700;flex:1">
        <span class="apunte" style="white-space:nowrap;margin-left:10px">
          ${usados} ${usados === 1 ? "cosa" : "cosas"}</span>
      </div>
      <div id="items-${escapar(ambiente.id)}"></div>

      <div class="campo-fila" style="padding:10px 0 0">
        <label for="sumar-${escapar(ambiente.id)}">Agregar algo a este ambiente</label>
        <div style="display:flex;gap:8px">
          <input class="campo" id="sumar-${escapar(ambiente.id)}" type="text" style="flex:1"
                 placeholder="Estufa, calefón, mosquitero...">
          <button class="boton boton-chico boton-primario"
                  data-sumar-item="${escapar(ambiente.id)}">Sumar</button>
        </div>
      </div>

      <div class="botonera" style="margin-top:12px">
        <button class="filtro" data-borrar-amb="${escapar(ambiente.id)}">Sacar el ambiente</button>
      </div>
    </section>
  `);

  const caja = seccion.getElementById(`items-${ambiente.id}`);
  for (const item of ambiente.items) caja.append(elItem(estado, item));

  seccion.getElementById(`amb-${ambiente.id}`).addEventListener("change", (e) => {
    ambiente.nombre = e.target.value;
    guardarYRedibujar(estado);
  });

  /* SE ESCRIBE EL NOMBRE Y SE SUMA. Antes aparecía una fila en blanco que después había que
     encontrar entre las otras veinte para escribirle adentro. */
  const comoSeLlamaLoNuevo = seccion.getElementById(`sumar-${ambiente.id}`);
  const sumar = () => {
    const nombre = comoSeLlamaLoNuevo.value.trim();
    if (!nombre) return;
    ambiente.items.push(nuevoItem(nombre));
    guardarYRedibujar(estado);
  };
  comoSeLlamaLoNuevo.addEventListener("keydown", (e) => {
    // Enter suma: escribís, Enter, escribís, Enter. Sin sacar la vista del teclado.
    if (e.key === "Enter") { e.preventDefault(); sumar(); }
  });
  seccion.querySelector("[data-sumar-item]").addEventListener("click", sumar);
  seccion.querySelector("[data-borrar-amb]").addEventListener("click", (e) => {
    const boton = e.currentTarget;
    if (boton.dataset.seguro !== "si") {
      boton.dataset.seguro = "si";
      boton.textContent = "¿Seguro? Tocá de nuevo";
      return;
    }
    abierto.ambientes = abierto.ambientes.filter((a) => a.id !== ambiente.id);
    guardarYRedibujar(estado);
  });
  return seccion;
}

/* UNA FILA POR COSA, y lo más corta posible: son 165.

   El campo de detalle SOLO aparece cuando el estado lo pide. Un cuadro de texto vacío al lado
   de cada una de las 165 filas hace una pantalla que no se puede leer, y encima invita a
   escribir donde no hace falta. */
function elItem(estado, item) {
  const pideDetalle = item.estado === "detalles" || item.estado === "malo"
    || Boolean((item.detalle || "").trim());

  const vacia = !(item.nombre || "").trim();

  /* UNA FILA, UN RENGLON. Son 165: cada renglon de mas son ciento sesenta y cinco renglones
     de mas, y el dedo tiene que recorrerlos todos parado en el medio de un apartamento.

     Con el nombre arriba y el estado abajo el inventario media dieciocho mil pixeles de
     scroll. Asi mide menos de la mitad. Se vio sacandole una foto a la pantalla: en las
     pruebas no aparece, porque las pruebas no miden.

     El detalle SI va abajo, en su propio renglon, pero solo cuando hay algo que escribir. */
  const fila = nodo(html`
    <div class="campo-fila${item.estado === "malo" || vacia ? " falta" : ""}"
         style="padding:6px 0">
      <div style="display:flex;gap:6px;align-items:center">
        <input class="campo" id="nom-${escapar(item.id)}" type="text" style="flex:1;min-width:0;font-size:14px"
               placeholder="¿Qué cosa?" value="${escapar(item.nombre)}">
        <select class="campo" id="est-${escapar(item.id)}" style="flex:0 0 112px">
          ${ESTADOS.map((e) => `<option value="${e.clave}"${
            e.clave === item.estado ? " selected" : ""}>${escapar(e.nombre)}</option>`).join("")}
        </select>
        <input class="campo" id="cant-${escapar(item.id)}" type="number" min="1" step="1"
               value="${escapar(String(item.cantidad || 1))}"
               style="flex:0 0 42px;padding-left:6px;padding-right:2px" title="Cuántos hay">
        <button class="filtro" data-sacar="${escapar(item.id)}"
                style="flex:0 0 auto;padding:8px 10px" title="Sacar esta fila">✕</button>
      </div>
      ${pideDetalle ? html`
        <input class="campo" id="det-${escapar(item.id)}" type="text" style="margin-top:6px"
               placeholder="¿Qué tiene? Escribilo como se lo contarías al inquilino"
               value="${escapar(item.detalle || "")}">` : ""}
      ${vacia ? html`
        <p class="apunte" style="margin:4px 0 0">Sin nombre no sale en el documento.
          Escribilo, o sacalo con la ✕.</p>` : ""}
    </div>
  `);

  const cuando = (id, hacer) => {
    const campo = fila.getElementById(id);
    if (campo) campo.addEventListener("change", (e) => { hacer(e.target.value); });
  };
  cuando(`nom-${item.id}`, (v) => { item.nombre = v; guardarYRedibujar(estado); });
  cuando(`est-${item.id}`, (v) => { item.estado = v; guardarYRedibujar(estado); });
  cuando(`cant-${item.id}`, (v) => {
    item.cantidad = Math.max(1, Number(v) || 1);
    guardarYRedibujar(estado);
  });
  cuando(`det-${item.id}`, (v) => { item.detalle = v; guardarYRedibujar(estado); });

  fila.querySelector("[data-sacar]").addEventListener("click", () => {
    for (const a of abierto.ambientes) a.items = a.items.filter((x) => x.id !== item.id);
    guardarYRedibujar(estado);
  });
  return fila;
}

function agregarAmbiente(estado) {
  const seccion = nodo(html`
    <section class="tarjeta">
      <h2 class="titulo" style="font-size:17px;margin-bottom:10px">Agregar un ambiente</h2>
      <div class="campo-fila" style="padding:0">
        <select class="campo" id="que-ambiente">
          ${TIPOS_DE_AMBIENTE.map((t) =>
            `<option value="${t.clave}">${escapar(t.nombre)}</option>`).join("")}
        </select>
      </div>
      <div class="campo-fila" style="padding:8px 0 0">
        <input class="campo" id="nombre-ambiente" type="text"
               placeholder="Cómo se llama (opcional: Cochera 2, Cuarto de máquinas...)">
      </div>
      <div class="botonera" style="margin-top:10px">
        <button class="boton boton-primario boton-chico" id="sumar-amb">Agregarlo</button>
      </div>
    </section>
  `);
  /* EL DESPLEGABLE SE AGARRA ANTES DE INSERTAR LA TARJETA, no adentro del click.

     `nodo()` devuelve un fragmento, y un fragmento se VACIA al insertarlo: sus hijos se mudan
     a la pantalla. Buscarlo después con `seccion.getElementById` devuelve null y el botón no
     hace nada — que es exactamente lo que pasaba. La referencia al nodo, en cambio, sigue
     valiendo después de la mudanza. */
  const cual = seccion.getElementById("que-ambiente");
  const comoSeLlamara = seccion.getElementById("nombre-ambiente");
  seccion.getElementById("sumar-amb").addEventListener("click", () => {
    /* El nombre escrito manda sobre el del tipo: es lo que deja poner "Cochera 2" o
       "Cuarto de máquinas" sin tener que renombrarlo después. */
    abierto.ambientes.push(nuevoAmbiente(cual.value, comoSeLlamara.value.trim()));
    guardarYRedibujar(estado);
  });
  return seccion;
}

/* ---------- Observaciones, cláusulas y el PDF ---------- */

function elPie(estado) {
  const seccion = nodo(html`
    <section class="tarjeta">
      <h2 class="titulo" style="font-size:17px;margin-bottom:8px">Observaciones</h2>
      <textarea class="campo" id="observaciones" rows="4"
                style="resize:vertical">${escapar(abierto.observaciones || "")}</textarea>
      <p class="apunte" style="margin-top:10px">
        Las siete cláusulas del pie van tal cual las usás hoy. La cantidad de hojas la cuenta
        el documento solo.
      </p>
      <div class="botonera" style="margin-top:14px">
        <button class="boton boton-primario" id="bajar">Bajar el PDF</button>
        <button class="boton boton-borrar" id="borrar-inv">Borrar este inventario</button>
      </div>
      <p class="apunte" id="resultado" style="margin-top:10px"></p>
    </section>
  `);

  seccion.getElementById("observaciones").addEventListener("change", (e) => {
    abierto.observaciones = e.target.value;
    guardado.guardar(abierto);
  });

  const aviso = seccion.getElementById("resultado");
  seccion.getElementById("bajar").addEventListener("click", () => {
    const oficina = ((estado.datos.ajustes || {}).agente || {}).oficina
      || "RE/MAX Único · Avda. Brasil 2986, Montevideo";
    const { doc, hojas } = armarPDF(
      { ...abierto, aviso_reclamo: AVISO_RECLAMO }, { oficina });
    bajarArchivo(doc.aBlob(), nombreArchivo(abierto));
    aviso.textContent = `Listo: ${hojas} ${hojas === 1 ? "hoja" : "hojas"}.`;
  });

  const borrar = seccion.getElementById("borrar-inv");
  borrar.addEventListener("click", () => {
    if (borrar.dataset.seguro !== "si") {
      borrar.dataset.seguro = "si";
      borrar.textContent = "¿Seguro? Tocá de nuevo";
      return;
    }
    guardado.borrar(abierto.id);
    abierto = null;
    estado.redibujar();
  });
  return seccion;
}

/* Para que la pantalla no se quede abierta en un inventario al volver desde otro lado. */
export const cerrarInventario = () => { abierto = null; };
