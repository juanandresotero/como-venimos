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
  ESTADOS, PIDEN_DETALLE, TIPOS_DE_AMBIENTE, AVISO_RECLAMO, CLAUSULAS, comoSeLee, conCantidad,
  nuevoInventario, nuevoAmbiente, nuevoItem, numerar, comoSeLlama, comoVa, cuenta,
} from "../lib/inventario.js";
import * as guardado from "../lib/inventario-guardado.js";
import { armarPDF, nombreArchivo } from "../lib/inventario-pdf.js";
import { mandarArchivo, bajarArchivo } from "../lib/compartir.js";
import { cargarMembrete } from "../lib/membrete.js";
import * as fotos from "../lib/fotos.js";
import * as drive from "../lib/drive.js";
import * as googleId from "../lib/google-id.js";
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
let clausulasAbiertas = false;
/* Las cosas a las que se les abrio el renglon de escribir con el lapiz. Vive afuera porque la
   pantalla se redibuja entera en cada cambio: adentro, el renglon se cerraria solo. */
const escribiendo = new Set();
/* Los ambientes plegados. Juan: "que cada ambiente se pueda minimizar en una lista desplegable
   así no hay que bajar tanto para poner uno y otro, y que si están todos minimizados se vean
   los títulos de cada uno". Con ocho ambientes y ciento sesenta cosas, la única forma de
   moverse es poder cerrar lo que ya está hecho. */
const plegados = new Set();

/* Las fotos del inventario abierto, leidas una vez del deposito y guardadas acá mientras se
   trabaja. Se leen de IndexedDB, que es asincrónico, y la pantalla se dibuja de una: sin esta
   copia habría que esperar al depósito en cada redibujado, que son decenas por minuto. */
let lasFotos = [];
let subiendo = "";

const fotosDelAmbiente = (ambiente) =>
  lasFotos.filter((f) => f.ambiente === ambiente.nombre);

async function releerFotos(estado) {
  lasFotos = abierto ? await fotos.fotosDelInventario(abierto.id) : [];
  estado.redibujar();
}

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
      lasFotos = [];
      releerFotos(estado);
    });
    trozo.append(fila);
  }

  trozo.querySelector("#nuevo").addEventListener("click", () => {
    abierto = nuevoInventario(estado.hoy);
    lasFotos = [];
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
  if (abierto.ambientes.length > 1) trozo.append(plegarTodos(estado));
  for (const ambiente of abierto.ambientes) trozo.append(elAmbiente(estado, ambiente));
  trozo.append(agregarAmbiente(estado));
  trozo.append(elPie(estado));

  trozo.querySelector("#volver").addEventListener("click", () => {
    abierto = null;
    estado.redibujar();
  });
  return trozo;
}

/* Abrir y cerrar todo de una. Con ocho ambientes, plegarlos de a uno son ocho toques. */
function plegarTodos(estado) {
  const todosPlegados = abierto.ambientes.every((a) => plegados.has(a.id));
  const trozo = nodo(html`
    <div class="botonera" style="margin:-4px 0 12px">
      <button class="filtro" id="plegar-todos">
        ${todosPlegados ? "Abrir todos" : "Plegar todos"}</button>
    </div>`);
  trozo.getElementById("plegar-todos").addEventListener("click", () => {
    if (todosPlegados) plegados.clear();
    else for (const a of abierto.ambientes) plegados.add(a.id);
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
  const plegado = plegados.has(ambiente.id);
  const suyas = fotosDelAmbiente(ambiente);
  /* Cuántas tienen algo escrito: es lo único que hace falta saber de un ambiente cerrado. */
  const conAlgo = ambiente.items.filter(
    (i) => cuenta(i) && (PIDEN_DETALLE.has(i.estado) || (i.detalle || "").trim())).length;

  const seccion = nodo(html`
    <section class="tarjeta">
      <div class="tarjeta-titulo">
        <input class="campo" id="amb-${escapar(ambiente.id)}" type="text"
               value="${escapar(ambiente.nombre)}" placeholder="¿Qué ambiente es?"
               style="font-size:17px;font-weight:700;flex:1">
        <button class="filtro" data-plegar="${escapar(ambiente.id)}"
                style="flex:0 0 auto;margin-left:8px;padding:8px 11px"
                title="${plegado ? "Abrirlo" : "Plegarlo"}">${plegado ? "▾" : "▴"}</button>
      </div>
      <p class="apunte" style="margin:6px 0 0">
        ${usados} ${usados === 1 ? "cosa" : "cosas"}${
          conAlgo ? ` · <strong>${conAlgo} con algo escrito</strong>` : ""}${
          suyas.length ? ` · ${suyas.length} ${suyas.length === 1 ? "foto" : "fotos"}` : ""}</p>

      ${plegado ? "" : html`
        <div id="items-${escapar(ambiente.id)}" style="margin-top:8px"></div>
        <div id="fotos-${escapar(ambiente.id)}"></div>

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
        </div>`}
    </section>
  `);

  seccion.querySelector("[data-plegar]").addEventListener("click", () => {
    if (plegado) plegados.delete(ambiente.id);
    else plegados.add(ambiente.id);
    estado.redibujar();
  });

  seccion.getElementById(`amb-${ambiente.id}`).addEventListener("change", (e) => {
    ambiente.nombre = e.target.value;
    guardarYRedibujar(estado);
  });

  if (plegado) return seccion;

  const caja = seccion.getElementById(`items-${ambiente.id}`);
  for (const item of ambiente.items) caja.append(elItem(estado, item));
  seccion.getElementById(`fotos-${ambiente.id}`).append(lasFotosDe(estado, ambiente, suyas));

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

   El campo de detalle está SIEMPRE a un toque, con el lápiz, pero no siempre abierto: un
   cuadro de texto vacío al lado de cada una de las 165 filas hace una pantalla que no se
   puede leer, y encima invita a escribir donde no hace falta. */
/* QUE DICE EL RENGLON DE ABAJO. Juan: "cuando toco el lápiz abre abajo algo, pero no parece
   que fuera correspondiente de lo que está arriba y confunde por el diseño".

   Dos cosas lo arreglan: que se vea colgado de la fila —la flecha y la sangría, en el CSS— y
   que el texto de adentro NOMBRE la cosa de la que habla. "¿Qué tiene la puerta de entrada?"
   no se puede confundir con otra fila. */
function quePasaCon(item) {
  const cosa = (item.nombre || "").trim();
  return cosa ? `¿Qué tiene ${cosa.toLowerCase()}? Una rayita, un golpe, lo que sea`
    : "¿Qué tiene? Una rayita, un golpe, lo que sea";
}

function elItem(estado, item) {
  const vacia = !(item.nombre || "").trim();
  const cantidad = Number(item.cantidad) || 1;
  /* EL RENGLON PARA ESCRIBIR ESTA SIEMPRE A UN TOQUE. Juan: "capaz que el estado es bueno y
     tiene una rayita y quiero escribir eso".

     Se abre solo con los estados que no se explican solos, y con el lapiz en los que sí. Y no
     se cierra nunca si ya hay algo escrito o una cantidad puesta: cambiar el estado no puede
     esconder un dato cargado. */
  /* OJO CON EL NOMBRE: `abierto` es el inventario que se está editando, y ponerle lo mismo a
     esta bandera la tapaba adentro de esta función. La ✕ le pedía los ambientes a un `true` y
     no borraba nada, sin decir una palabra. Lo encontró Juan probando. */
  const conRenglonDeEscribir = PIDEN_DETALLE.has(item.estado)
    || Boolean((item.detalle || "").trim())
    || cantidad > 1
    || escribiendo.has(item.id);

  /* LA CANTIDAD BAJO AL RENGLON DE ESCRIBIR. Es tan excepcion como el detalle —en todo el
     inventario de Leyenda patria no la usó ni una vez— y arriba le comía cuarenta pixeles al
     nombre, que es lo único que hay que poder leer de un vistazo. */
  const fila = nodo(html`
    <div class="campo-fila${item.estado === "roto" || vacia ? " falta" : ""}"
         style="padding:6px 0">
      <div style="display:flex;gap:6px;align-items:center">
        <input class="campo" id="nom-${escapar(item.id)}" type="text"
               style="flex:1;min-width:0;font-size:14px;padding-left:9px;padding-right:4px"
               placeholder="¿Qué cosa?" value="${escapar(item.nombre)}">
        <select class="campo" id="est-${escapar(item.id)}" style="flex:0 0 124px;font-size:13px">
          ${ESTADOS.map((e) => `<option value="${e.clave}"${
            e.clave === item.estado ? " selected" : ""}>${escapar(e.nombre)}</option>`).join("")}
        </select>
        <button class="filtro" data-escribir="${escapar(item.id)}"
                style="flex:0 0 auto;padding:8px 9px"
                title="Escribir algo de esta cosa">✎</button>
        <button class="filtro" data-sacar="${escapar(item.id)}"
                style="flex:0 0 auto;padding:8px 9px" title="Sacar esta fila">✕</button>
      </div>
      ${conRenglonDeEscribir ? html`
        <div class="renglon-detalle">
          <span class="renglon-detalle-flecha">↳</span>
          <input class="campo" id="det-${escapar(item.id)}" type="text"
                 style="flex:1;min-width:0;font-size:14px"
                 placeholder="${escapar(quePasaCon(item))}"
                 value="${escapar(item.detalle || "")}">
          <input class="campo" id="cant-${escapar(item.id)}" type="number" min="1" step="1"
                 value="${escapar(String(cantidad))}"
                 style="flex:0 0 52px;padding-left:8px;padding-right:2px" title="Cuántos hay">
        </div>` : ""}
      ${vacia ? html`
        <p class="apunte" style="margin:4px 0 0">Sin nombre no sale en el documento.
          Escribilo, o sacalo con la ✕.</p>` : ""}
    </div>
  `);

  fila.querySelector("[data-escribir]").addEventListener("click", () => {
    if (escribiendo.has(item.id)) escribiendo.delete(item.id);
    else escribiendo.add(item.id);
    estado.redibujar();
  });

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

/* LAS FOTOS DE UN AMBIENTE. Se eligen de la galeria del telefono —el <input type=file> con
   `multiple` abre el selector de Android y deja marcar todas las de ese cuarto de una— y se
   guardan achicadas en dos medidas: una para el papel y otra para el Drive.

   Achicar veinte fotos de celular tarda unos segundos y la pantalla se queda quieta: por eso
   avisa por donde va. Una pantalla quieta parece colgada, y lo primero que hace uno es tocar
   el boton otra vez. */
function lasFotosDe(estado, ambiente, suyas) {
  const pesan = fotos.cuantoPesan(suyas);
  const trozo = nodo(html`
    <div style="margin-top:14px">
      <div class="tarjeta-titulo" style="margin-bottom:8px">
        <span class="etiqueta">Fotos${suyas.length ? ` · ${suyas.length}` : ""}</span>
        ${pesan ? html`<span class="apunte">${escapar(fotos.enMegas(pesan))}</span>` : ""}
      </div>
      <div class="tira-fotos" id="tira-${escapar(ambiente.id)}"></div>
      <label class="boton boton-chico" style="display:inline-block;margin-top:8px">
        + Elegir de la galería
        <input type="file" accept="image/*" multiple id="elegir-${escapar(ambiente.id)}"
               style="display:none">
      </label>
      ${subiendo === ambiente.id
        ? html`<p class="apunte" id="yendo-${escapar(ambiente.id)}"
                  style="margin-top:8px">Achicando las fotos...</p>`
        : ""}
      ${fotos.queSalioMal()
        ? html`<p class="apunte" style="margin-top:8px;color:var(--rojo)">
            No se pudieron guardar las fotos: ${escapar(fotos.queSalioMal())}.
            Probá con menos de una vez, o liberá lugar en el teléfono.</p>`
        : ""}
    </div>
  `);

  const tira = trozo.getElementById(`tira-${ambiente.id}`);
  for (const foto of suyas) {
    const cuadro = document.createElement("div");
    cuadro.className = "foto-chica";
    const img = document.createElement("img");
    /* Se dibuja desde el JPEG del papel, que es el chico: cargar el grande para una miniatura
       de 70 pixeles es pedirle al telefono treinta veces mas de lo que hace falta. */
    img.src = URL.createObjectURL(new Blob([foto.papel.bytes], { type: "image/jpeg" }));
    img.alt = `Foto ${foto.orden} de ${ambiente.nombre}`;
    img.loading = "lazy";
    const sacar = document.createElement("button");
    sacar.className = "foto-sacar";
    sacar.textContent = "✕";
    sacar.title = "Sacar esta foto";
    sacar.addEventListener("click", async () => {
      await fotos.borrarFoto(foto.id);
      await releerFotos(estado);
    });
    cuadro.append(img, sacar);
    tira.append(cuadro);
  }

  const elegir = trozo.getElementById(`elegir-${ambiente.id}`);
  elegir.addEventListener("change", async () => {
    const archivos = [...(elegir.files || [])];
    if (!archivos.length) return;
    subiendo = ambiente.id;
    fotos.olvidarElProblema();
    estado.redibujar();
    const cartel = document.getElementById(`yendo-${ambiente.id}`);
    await fotos.sumarFotos(abierto.id, ambiente.nombre, archivos, (hechas, total) => {
      if (cartel) cartel.textContent = `Achicando las fotos... ${hechas} de ${total}`;
    });
    subiendo = "";
    await releerFotos(estado);
  });

  return trozo;
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
    const nuevo = nuevoAmbiente(cual.value, comoSeLlamara.value.trim());
    /* El nuevo entra abierto y los otros se pliegan: lo que vas a llenar es este. */
    for (const a of abierto.ambientes) plegados.add(a.id);
    abierto.ambientes.push(nuevo);
    guardarYRedibujar(estado);
  });
  return seccion;
}

/* ---------- Observaciones, cláusulas y el PDF ---------- */

function elPie(estado) {
  const seccion = nodo(html`
    <section class="tarjeta">
      <h2 class="titulo" style="font-size:17px;margin-bottom:4px">Observaciones</h2>
      <p class="apunte" style="margin-bottom:8px">
        El estado general de la propiedad. Va en la última hoja, arriba de las firmas.
        Escribí lo que corresponda a esta propiedad.
      </p>
      <textarea class="campo" id="observaciones" rows="5"
                style="resize:vertical">${escapar(abierto.observaciones || "")}</textarea>

      <h2 class="titulo" style="font-size:17px;margin:18px 0 4px">Las firmas</h2>
      <p class="apunte" style="margin-bottom:8px">
        Cuántas rayas dejar de cada lado. Si el alquiler lo firman tres propietarios y tres
        inquilinos, poné 3 y 3.
      </p>
      <div style="display:flex;gap:10px">
        <div class="campo-fila" style="padding:0;flex:1">
          <label for="firmas-dor">Arrendador/a</label>
          <input class="campo" id="firmas-dor" type="number" min="1" max="12" step="1"
                 value="${escapar(String(abierto.firmas_arrendador || 1))}">
        </div>
        <div class="campo-fila" style="padding:0;flex:1">
          <label for="firmas-tario">Arrendatario/a</label>
          <input class="campo" id="firmas-tario" type="number" min="1" max="12" step="1"
                 value="${escapar(String(abierto.firmas_arrendatario || 1))}">
        </div>
      </div>
      <div class="tarjeta-titulo" style="margin-top:18px">
        <h2 class="titulo" style="font-size:17px">Las cláusulas del pie</h2>
        <button class="filtro" id="ver-clausulas">${clausulasAbiertas ? "Ocultar" : "Editar"}</button>
      </div>
      ${clausulasAbiertas
        ? html`<div id="las-clausulas"></div>`
        : html`<p class="apunte">Las ${(abierto.clausulas || CLAUSULAS).length} de siempre.
            La cantidad de hojas la cuenta el documento solo.</p>`}
      <div class="botonera" style="margin-top:14px">
        <button class="boton boton-primario" id="mandar">Mandar el PDF</button>
        <button class="boton" id="bajar">Bajarlo</button>
      </div>
      <div class="botonera" style="margin-top:10px">
        <button class="boton" id="al-drive">Subir todo al Drive</button>
      </div>
      <div class="botonera" style="margin-top:10px">
        <button class="boton boton-borrar" id="borrar-inv">Borrar este inventario</button>
      </div>
      <p class="apunte" id="resultado" style="margin-top:10px"></p>
    </section>
  `);

  /* LAS CLAUSULAS SE PUEDEN EDITAR. Juan lo pidió el primer día: "que en esta herramienta
     pueda editar los textos que ves". Son las que le dan valor legal al documento, y viven
     guardadas DENTRO de cada inventario: si mañana su escribano le cambia una, los que ya
     firmó siguen diciendo lo que decían ese día. */
  const cajaClausulas = seccion.getElementById("las-clausulas");
  if (cajaClausulas) {
    (abierto.clausulas || CLAUSULAS).forEach((clausula, i) => {
      const fila = nodo(html`
        <div class="campo-fila">
          <label for="cla-${i}">${i + 1})${
            clausula.includes("{HOJAS}") ? " — {HOJAS} se cambia por el número real" : ""}</label>
          <textarea class="campo" id="cla-${i}" rows="4"
                    style="resize:vertical;font-size:13px">${escapar(clausula)}</textarea>
        </div>`);
      fila.querySelector("textarea").addEventListener("change", (e) => {
        const lista = [...(abierto.clausulas || CLAUSULAS)];
        lista[i] = e.target.value;
        abierto.clausulas = lista;
        guardado.guardar(abierto);
      });
      cajaClausulas.append(fila);
    });
  }
  seccion.getElementById("ver-clausulas").addEventListener("click", () => {
    clausulasAbiertas = !clausulasAbiertas;
    estado.redibujar();
  });

  seccion.getElementById("observaciones").addEventListener("change", (e) => {
    abierto.observaciones = e.target.value;
    guardado.guardar(abierto);
  });

  const cuantasFirmas = (id, clave) => {
    seccion.getElementById(id).addEventListener("change", (e) => {
      abierto[clave] = Math.min(12, Math.max(1, Math.round(Number(e.target.value) || 1)));
      guardarYRedibujar(estado);
    });
  };
  cuantasFirmas("firmas-dor", "firmas_arrendador");
  cuantasFirmas("firmas-tario", "firmas_arrendatario");

  const aviso = seccion.getElementById("resultado");

  /* EL PDF SE MANDA Y SE BAJA. Juan: "cuando termine debe poder descargarse y enviarse al
     whatsapp en formato pdf porque esto luego yo lo imprimo y lo hago firmar el dia de la
     firma del alquiler o venta".

     "Mandar" abre la bandeja del telefono —ahi adentro esta WhatsApp— con el archivo listo.
     "Bajarlo" es para la computadora, que es de donde se imprime. */
  const elPDF = async () => {
    const oficina = ((estado.datos.ajustes || {}).agente || {}).oficina
      || "RE/MAX Único · Avda. Brasil 2986, Montevideo";
    /* El membrete se pide, pero si no está —sin señal y sin caché— el documento sale igual.
       Un inventario no puede depender de que haya internet. */
    return armarPDF({ ...abierto, aviso_reclamo: AVISO_RECLAMO },
      { oficina, membrete: await cargarMembrete(), fotos: lasFotos });
  };

  const contar = (hojas) => `${hojas} ${hojas === 1 ? "hoja" : "hojas"}`;

  const COMO_SALIO = {
    compartido: (h) => `Mandado: ${contar(h)}.`,
    bajado: (h) => `Bajado: ${contar(h)}. Está en tus descargas.`,
    cancelado: () => "No lo mandaste.",
    /* Adentro del navegador de otra app la descarga no pasa nunca, y hay que decirlo en vez
       de dejarlo tocando un boton muerto. */
    bloqueado: () => "Abrilo con Chrome para poder mandarlo: desde acá adentro no se puede.",
  };

  seccion.getElementById("mandar").addEventListener("click", async () => {
    const { doc, hojas } = await elPDF();
    aviso.textContent = "Armando el PDF...";
    const como = await mandarArchivo(
      doc.aBlob(), nombreArchivo(abierto),
      `Inventario de ${comoSeLlama(abierto)} · ${abierto.fecha || ""}`.trim());
    aviso.textContent = (COMO_SALIO[como] || COMO_SALIO.bajado)(hojas);
  });

  seccion.getElementById("bajar").addEventListener("click", async () => {
    const { doc, hojas } = await elPDF();
    const como = await bajarArchivo(doc.aBlob(), nombreArchivo(abierto));
    aviso.textContent = (COMO_SALIO[como] || COMO_SALIO.bajado)(hojas);
  });

  /* SUBIR TODO AL DRIVE: arma en el Drive lo mismo que Juan arma a mano —una carpeta por
     propiedad adentro de INVENTARIOS, una subcarpeta por ambiente, y el PDF terminado— y deja
     el link pegado en el inventario, que es el punto 6 de sus cláusulas.

     LO QUE YA SE SUBIO NO SE VUELVE A SUBIR: si se corta el internet a la mitad, se toca de
     nuevo y sigue de donde quedó. Cien fotos por datos móviles se cortan. */
  seccion.getElementById("al-drive").addEventListener("click", async () => {
    const cliente = googleId.leer();
    if (!cliente) {
      aviso.textContent = "Falta el ID de cliente de Google. Está en Ajustes → Subir al Drive.";
      return;
    }
    try {
      aviso.textContent = "Pidiendo permiso a Google...";
      await drive.cargarGoogle();
      const token = await drive.pedirPermiso(cliente);

      aviso.textContent = "Armando el PDF...";
      const { doc } = await elPDF();
      const pdf = {
        nombre: nombreArchivo(abierto),
        bytes: new Uint8Array(await doc.aBlob().arrayBuffer()),
      };

      const salida = await drive.subirInventario(token, abierto, lasFotos, {
        pdf,
        avisar: (hechas, total, que) => {
          aviso.textContent = `Subiendo... ${hechas} de ${total} (${que})`;
        },
        /* Una foto ya subida tiene anotado su id del Drive. Sin esto, cada intento repetiría
           las cien de la vez anterior. */
        yaSubida: (f) => Boolean(f.subida),
        anotar: async (foto, id) => {
          await fotos.guardarFoto({ ...foto, subida: id });
        },
      });

      /* El link queda pegado en el inventario: es el punto 6 de las cláusulas y hoy lo copia
         a mano del navegador. */
      abierto.link_fotos = salida.link;
      guardado.guardar(abierto);
      await releerFotos(estado);
      aviso.textContent = salida.subidas
        ? `Listo: ${salida.subidas} ${salida.subidas === 1 ? "archivo" : "archivos"} `
          + "en tu Drive, y el link quedó pegado abajo."
        : "Ya estaba todo subido. El link quedó pegado abajo.";
    } catch (error) {
      /* Se dice qué pasó. Un fallo silencioso acá se descubre el día que abrís el Drive y no
         está nada. */
      aviso.textContent = `No se pudo subir: ${error.message}`;
    }
  });

  const borrar = seccion.getElementById("borrar-inv");
  borrar.addEventListener("click", () => {
    if (borrar.dataset.seguro !== "si") {
      borrar.dataset.seguro = "si";
      borrar.textContent = "¿Seguro? Tocá de nuevo";
      return;
    }
    /* Las fotos se van con él: si no, quedan cientos de megas de una casa que ya no existe
       en la app, y nadie las va a ir a buscar. */
    fotos.borrarFotosDe(abierto.id);
    guardado.borrar(abierto.id);
    abierto = null;
    lasFotos = [];
    estado.redibujar();
  });
  return seccion;
}

/* Para que la pantalla no se quede abierta en un inventario al volver desde otro lado. */
export const cerrarInventario = () => { abierto = null; };
