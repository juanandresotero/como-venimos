/* Gastos variables: lo que se gasta en el día.

   CARGAR UNO TIENE QUE SER DOS TOQUES. Es lo que se hace parado en la caja del supermercado,
   con una mano: si lleva más de cinco segundos, a la semana se deja de hacer y la app entera
   pierde sentido. Por eso el monto está arriba de todo y ya enfocado, las categorías son
   botones grandes y la fecha es hoy salvo que se cambie.

   Abajo, lo del mes: para poder mirar en qué se fue la plata sin salir de la pantalla. */

import {
  leer, guardar, mesDe, proximoId, mesAnterior, CATEGORIAS,
} from "../lib/personal.js";
import { escapar, plata, numeroDesde, formatearMientrasEscribe } from "../lib/formato.js";
import { monto, nombreDelMes } from "./personal-resumen.js";

const html = (c, ...v) => c.reduce((t, x, i) => t + x + (v[i] ?? ""), "");

function nodo(marca) {
  const molde = document.createElement("template");
  molde.innerHTML = marca.trim();
  return molde.content;
}

/* Lo que se está por cargar. Vive fuera de la función para que un redibujado no lo borre a
   mitad de camino. */
const puesto = { monto: null, moneda: "UYU", categoria: "Comida", nota: "" };

/* Qué mes se está mirando abajo. Arranca en el actual y vuelve solo al cargar un gasto: sin
   esto, un error del mes pasado no se podía corregir nunca — la lista mostraba únicamente el
   mes en curso y no había ninguna otra pantalla donde apareciera. */
let mesMirado = null;

export function dibujarPersonalVariables(estado) {
  const datos = leer();
  if (!mesMirado) mesMirado = mesDe(estado.hoy);
  const delMes = (datos.variables || [])
    .filter((v) => mesDe(v.fecha) === mesMirado)
    .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)) || b.id - a.id);

  const trozo = document.createDocumentFragment();
  trozo.append(elCargador(estado, datos));
  trozo.append(loDelMes(estado, datos, delMes, mesDe(estado.hoy)));
  return trozo;
}

/* ---------- Cargar uno ---------- */

function elCargador(estado, datos) {
  const seccion = nodo(html`
    <section style="margin-bottom:18px">
      <h1 class="titulo" style="font-size:26px;margin-bottom:14px">¿Cuánto gastaste?</h1>
      <div class="tarjeta" style="padding:0;overflow:hidden" data-campos></div>
      <div class="botonera" style="margin-top:10px">
        <button class="filtro ${puesto.moneda === "UYU" ? "prendido" : ""}" data-moneda="UYU">Pesos</button>
        <button class="filtro ${puesto.moneda === "USD" ? "prendido" : ""}" data-moneda="USD">Dólares</button>
      </div>
      <div class="menu-categorias" data-categorias></div>
      <div class="botonera" style="margin-top:14px">
        <button class="boton boton-primario" data-guardar>Anotarlo</button>
      </div>
    </section>
  `);

  const campos = seccion.querySelector("[data-campos]");
  const campoDelMonto = campoMonto("var-monto", "Monto", "", puesto.monto,
    (v) => { puesto.monto = v; });
  campos.append(campoDelMonto);

  for (const boton of seccion.querySelectorAll("[data-moneda]")) {
    boton.addEventListener("click", () => {
      puesto.moneda = boton.dataset.moneda;
      for (const otro of seccion.querySelectorAll("[data-moneda]")) {
        otro.classList.toggle("prendido", otro === boton);
      }
    });
  }

  /* Las categorías son botones y no una lista desplegable: un desplegable son tres toques
     (abrir, buscar, elegir) y encima tapa la pantalla. Acá se ven todas juntas. */
  const menu = seccion.querySelector("[data-categorias]");
  for (const categoria of CATEGORIAS) {
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

  seccion.querySelector("[data-guardar]").addEventListener("click", () => {
    if (!puesto.monto) return;
    const variables = [...datos.variables, {
      id: proximoId(datos.variables),
      fecha: estado.hoy,
      monto: puesto.monto,
      moneda: puesto.moneda,
      categoria: puesto.categoria,
      nota: "",
    }];
    guardar({ ...datos, variables });
    /* El monto se limpia y la categoría NO: el que carga tres gastos de comida seguidos no
       tiene que volver a elegirla cada vez. */
    puesto.monto = null;
    mesMirado = estado.hoy.slice(0, 7);
    estado.redibujar();
  });

  return seccion;
}

/* ---------- Lo del mes ---------- */

function loDelMes(estado, datos, delMes, mesDeHoy) {
  const porMoneda = { UYU: 0, USD: 0 };
  for (const v of delMes) porMoneda[v.moneda === "USD" ? "USD" : "UYU"] += Number(v.monto) || 0;
  const esEsteMes = mesMirado === mesDeHoy;

  const seccion = nodo(html`
    <section>
      <div class="tarjeta-titulo" style="margin-bottom:10px">
        <h2 class="titulo" style="font-size:17px">
          <button class="chip-apagado" data-atras aria-label="Mes anterior">‹</button>
          ${escapar(esEsteMes ? "Este mes" : nombreDelMes(mesMirado))}
          ${esEsteMes
            ? ""
            : html`<button class="chip-apagado" data-adelante aria-label="Mes siguiente">›</button>`}
        </h2>
        <span class="apunte">${["UYU", "USD"]
          .filter((m) => porMoneda[m] > 0)
          .map((m) => monto(porMoneda[m], m))
          .join(" · ") || "nada"}</span>
      </div>
      <div class="lista" data-lista></div>
    </section>
  `);

  /* Se puede ir para atrás sin límite y para adelante sólo hasta el mes en curso: no hay
     gastos en el futuro y una flecha que no lleva a ningún lado es una flecha rota. */
  seccion.querySelector("[data-atras]").addEventListener("click", () => {
    mesMirado = mesAnterior(mesMirado);
    estado.redibujar();
  });
  const adelante = seccion.querySelector("[data-adelante]");
  if (adelante) {
    adelante.addEventListener("click", () => {
      const [a, m] = mesMirado.split("-").map(Number);
      mesMirado = m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, "0")}`;
      estado.redibujar();
    });
  }

  const lista = seccion.querySelector("[data-lista]");
  for (const gasto of delMes) {
    const fila = nodo(html`
      <div class="fila">
        <span class="fila-cuerpo">
          <span class="fila-titulo">${escapar(gasto.categoria || "Otros")}</span>
          <span class="fila-sub">${escapar(String(gasto.fecha).slice(8, 10))}/${
            escapar(String(gasto.fecha).slice(5, 7))}</span>
        </span>
        <span class="fila-derecha">
          <span class="cifra cifra-media">${monto(gasto.monto, gasto.moneda)}</span>
          <span class="chip-apagado" data-borrar="${gasto.id}">borrar</span>
        </span>
      </div>
    `);
    fila.querySelector("[data-borrar]").addEventListener("click", () => {
      guardar({ ...datos, variables: datos.variables.filter((v) => v.id !== gasto.id) });
      estado.redibujar();
    });
    lista.append(fila);
  }
  if (!delMes.length) {
    lista.replaceWith(nodo(html`<p class="apunte">No hay gastos cargados en ese mes.</p>`));
  }
  return seccion;
}

function campoMonto(id, etiqueta, sufijo, valor, alCambiar) {
  const fila = document.createElement("div");
  fila.className = "campo-fila";
  fila.innerHTML = html`
    <label for="${id}">${escapar(etiqueta)}
      ${sufijo ? html`<span class="apunte">${escapar(sufijo)}</span>` : ""}</label>
    <input class="campo" id="${id}" type="text" inputmode="decimal"
           value="${valor === null || valor === undefined ? "" : plata(valor)}" placeholder="0">
  `;
  const control = fila.querySelector(".campo");
  formatearMientrasEscribe(control);
  control.addEventListener("input", () => alCambiar(numeroDesde(control.value)));
  return fila;
}
