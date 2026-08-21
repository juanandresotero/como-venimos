/* La pantalla suelta de anotar un gasto.

   Se abre desde su propio icono y no sabe nada del negocio: ni cartera, ni negocios, ni
   GitHub. Lee y escribe lo mismo que la cara personal de la app, asi que un gasto cargado
   aca aparece alla y al reves.

   Todo el archivo tiene que poder correr antes de que el usuario termine de mirar la
   pantalla: por eso no hay nada que esperar, ni una sola llamada a la red. */

import {
  leer, guardar, proximoId, categoriasDe, conElCambioDeducido,
} from "./lib/personal.js";
import { leerAvisos } from "./lib/sms-banco.js";
import { plata, escapar, numeroDesde, formatearMientrasEscribe } from "./lib/formato.js";
import * as tema from "./lib/tema.js";

const html = (c, ...v) => c.reduce((t, x, i) => t + x + (v[i] ?? ""), "");

function nodo(marca) {
  const molde = document.createElement("template");
  molde.innerHTML = marca.trim();
  return molde.content;
}

/* El mismo modo claro u oscuro que la app: es la misma app, entrada por otra puerta. */
tema.aplicar(tema.vigente());

const hoy = new Date().toISOString().slice(0, 10);

/* Con los centavos cuando los hay. `plata` redondea, que va bien para mostrar un total y mal
   para un campo que se puede editar: si el banco dice 255,74 y el campo dice 256, al tocarlo
   se pierden los centavos sin que nadie lo note. */
const comoSeEscribe = (n) => (Number.isInteger(n)
  ? plata(n)
  : n.toLocaleString("es-UY", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const puesto = { monto: null, moneda: "UYU", categoria: null };

const vista = document.getElementById("vista");

/* Si se comparte un aviso del banco CON esta pantalla, se anota sin preguntar nada más que
   la categoría. Es el mismo camino que en la app, pero sin pasar por ninguna otra pantalla. */
function loCompartido() {
  const texto = new URLSearchParams(location.search).get("texto")
    || new URLSearchParams(location.search).get("text") || "";
  return texto.trim() ? leerAvisos(texto) : [];
}

function dibujar() {
  const datos = leer();
  const categorias = categoriasDe(datos);
  if (!puesto.categoria || !categorias.includes(puesto.categoria)) {
    [puesto.categoria] = categorias;
  }

  const avisos = loCompartido();
  const delBanco = avisos.filter((a) => !a.devuelve);

  vista.replaceChildren(nodo(html`
    <h1 class="titulo" style="font-size:26px;margin-bottom:16px">¿Cuánto gastaste?</h1>
    <div class="tarjeta" style="padding:0;overflow:hidden" id="caja"></div>
    <div class="botonera" style="margin-top:10px">
      <button class="filtro ${puesto.moneda === "UYU" ? "prendido" : ""}" data-moneda="UYU">Pesos</button>
      <button class="filtro ${puesto.moneda === "USD" ? "prendido" : ""}" data-moneda="USD">Dólares</button>
    </div>
    <div class="menu-categorias" id="cats"></div>
    <div class="botonera" style="margin-top:18px">
      <button class="boton boton-primario" id="anotar">Anotarlo</button>
      <a class="boton" href="index.html#personal_variables">Ver todo</a>
    </div>
    <p class="apunte" id="aviso" style="margin-top:14px"></p>
  `));

  /* El campo del monto, enfocado: el usuario abrió esto para escribir un número. */
  const fila = document.createElement("div");
  fila.className = "campo-fila";
  fila.innerHTML = html`
    <label for="monto">Monto</label>
    <input class="campo" id="monto" type="text" inputmode="decimal" placeholder="0"
           value="${puesto.monto === null ? "" : comoSeEscribe(puesto.monto)}">
  `;
  const campo = fila.querySelector(".campo");
  formatearMientrasEscribe(campo);
  campo.addEventListener("input", () => { puesto.monto = numeroDesde(campo.value); });
  document.getElementById("caja").append(fila);

  for (const boton of vista.querySelectorAll("[data-moneda]")) {
    boton.addEventListener("click", () => {
      puesto.moneda = boton.dataset.moneda;
      for (const otro of vista.querySelectorAll("[data-moneda]")) {
        otro.classList.toggle("prendido", otro === boton);
      }
    });
  }

  const menu = document.getElementById("cats");
  for (const categoria of categorias) {
    const boton = document.createElement("button");
    boton.className = `filtro ${puesto.categoria === categoria ? "prendido" : ""}`;
    boton.textContent = categoria;
    boton.addEventListener("click", () => {
      puesto.categoria = categoria;
      for (const otro of menu.querySelectorAll(".filtro")) {
        otro.classList.toggle("prendido", otro === boton);
      }
    });
    menu.append(boton);
  }

  /* Si vino compartido un aviso del banco, el monto ya está puesto y sólo falta la
     categoría. Se avisa de dónde salió para que no parezca que la app lo inventó. */
  if (delBanco.length === 1) {
    const [a] = delBanco;
    puesto.monto = a.monto;
    puesto.moneda = a.moneda;
    campo.value = comoSeEscribe(a.monto);
    document.getElementById("aviso").textContent = `Del banco: ${a.comercio || "sin comercio"}`;
  } else if (delBanco.length > 1) {
    document.getElementById("aviso").innerHTML =
      'Vinieron varios avisos juntos. <a href="index.html#personal_variables">Abrí la app</a> '
      + "para cargarlos todos.";
  }

  document.getElementById("anotar").addEventListener("click", () => anotar(datos));
  campo.addEventListener("keydown", (evento) => {
    if (evento.key === "Enter") { evento.preventDefault(); anotar(leer()); }
  });

  setTimeout(() => campo.focus(), 50);
}

function anotar(datos) {
  if (!puesto.monto) {
    document.getElementById("aviso").textContent = "Falta el monto.";
    return;
  }
  const variables = [...datos.variables, {
    id: proximoId(datos.variables),
    fecha: hoy,
    monto: puesto.monto,
    moneda: puesto.moneda,
    categoria: puesto.categoria,
    nota: "",
  }];
  /* El cambio de moneda se deduce igual que en la app: si los pesos quedan en rojo y hay
     dólares, se cambiaron. Sin la cotización a mano no se deduce nada, que es lo correcto:
     esta pantalla no habla con la red. */
  const { datos: conCambio } = conElCambioDeducido(
    { ...datos, variables }, [], hoy, null);
  guardar(conCambio);
  mostrarListo();
}

/* Anotado y afuera. La pantalla se cierra sola si se puede —cuando se abrió como app— y si
   no, queda el número grande y la puerta para anotar otro. */
function mostrarListo() {
  const cuanto = `${puesto.moneda === "USD" ? "USD " : "$ "}${comoSeEscribe(puesto.monto)}`;
  vista.replaceChildren(nodo(html`
    <div class="listo">
      <p class="renta-nombre">Anotado</p>
      <p class="cifra cifra-heroe">${escapar(cuanto)}</p>
      <p class="apunte">${escapar(puesto.categoria || "")}</p>
      <div class="botonera" style="margin-top:24px;justify-content:center">
        <button class="boton boton-primario" id="otro">Anotar otro</button>
        <a class="boton" href="index.html#personal_variables">Ver todo</a>
      </div>
    </div>
  `));
  document.getElementById("otro").addEventListener("click", () => {
    puesto.monto = null;
    /* La dirección se limpia: si vino un aviso del banco, no se vuelve a cargar el mismo. */
    if (location.search) history.replaceState(null, "", location.pathname);
    dibujar();
  });
}

dibujar();
