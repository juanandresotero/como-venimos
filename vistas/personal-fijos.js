/* Gastos fijos: lo que se paga todos los meses.

   La pantalla es una lista con un tilde por gasto. Tildar es pagar — ahí y sólo ahí la plata
   sale de la cuenta, porque hasta que se paga sigue estando.

   Cada pago GUARDA SU MONTO. Si el historial se calculara con el precio de hoy, subir el
   alquiler reescribiría todos los meses anteriores y las gráficas del año pasado cambiarían
   solas. */

import {
  leer, guardar, mesDe, proximoId, estaPago, pagoDelMes, faltaPagar,
} from "../lib/personal.js";
import { escapar, plata, numeroDesde, formatearMientrasEscribe } from "../lib/formato.js";
import { telon } from "./ventana.js";
import { monto } from "./personal-resumen.js";

const html = (c, ...v) => c.reduce((t, x, i) => t + x + (v[i] ?? ""), "");

function nodo(marca) {
  const molde = document.createElement("template");
  molde.innerHTML = marca.trim();
  return molde.content;
}

export function dibujarPersonalFijos(estado) {
  const datos = leer();
  const mes = mesDe(estado.hoy);
  const activos = (datos.fijos || []).filter((f) => f.activo !== false);
  const falta = faltaPagar(datos, mes);

  const trozo = document.createDocumentFragment();
  trozo.append(nodo(html`
    <section style="margin-bottom:16px">
      <h1 class="titulo" style="font-size:26px">Gastos fijos</h1>
      ${activos.length
        ? html`<p class="apunte" style="margin-top:6px">${
             falta.length ? `${falta.length} sin pagar este mes` : "todo pago este mes"}</p>`
        : ""}
    </section>
  `));

  if (!activos.length) {
    trozo.append(nodo(html`
      <p class="apunte" style="margin-bottom:16px">Todavía no cargaste ninguno.</p>`));
  } else {
    trozo.append(laLista(estado, datos, activos, mes));
  }

  const agregar = nodo(html`
    <div class="botonera" style="margin-top:16px">
      <button class="boton boton-primario" id="f-nuevo">Agregar uno</button>
    </div>`);
  agregar.getElementById("f-nuevo").addEventListener("click",
    () => ventanaFijo(estado, datos, null));
  trozo.append(agregar);
  return trozo;
}

/* Un renglón por gasto: el tilde a la izquierda —que es lo que se toca todos los meses— y el
   nombre, que abre la edición. Se ordenan por día de vencimiento: es el orden en que van
   llegando. */
function laLista(estado, datos, fijos, mes) {
  const caja = document.createElement("div");
  caja.className = "lista";

  for (const fijo of [...fijos].sort((a, b) => (a.dia || 32) - (b.dia || 32))) {
    const pago = pagoDelMes(fijo, mes);
    const fila = nodo(html`
      <div class="fila fila-fijo">
        <button class="tilde-pago ${pago ? "pagado" : ""}" data-pagar="${fijo.id}"
                aria-label="${pago ? "Marcar sin pagar" : "Marcar pagado"}"
                aria-pressed="${pago ? "true" : "false"}">${pago ? "✓" : ""}</button>
        <button class="fila-cuerpo" data-editar="${fijo.id}" style="text-align:left">
          <span class="fila-titulo">${escapar(fijo.nombre || "Sin nombre")}</span>
          <span class="fila-sub">${fijo.dia ? `el ${fijo.dia}` : "sin día"}${
            pago ? ` · pagado ${escapar(String(pago.fecha || "").slice(8, 10))}` : ""}</span>
        </button>
        <span class="fila-derecha">
          <span class="cifra cifra-media">${monto(fijo.monto, fijo.moneda)}</span>
        </span>
      </div>
    `);

    fila.querySelector("[data-pagar]").addEventListener("click", () => {
      cambiarPago(estado, datos, fijo, mes);
    });
    fila.querySelector("[data-editar]").addEventListener("click", () => {
      ventanaFijo(estado, datos, fijo);
    });
    caja.append(fila);
  }
  return caja;
}

/* Tildar guarda el monto y el día en que se pagó. Destildar borra ese pago: es la forma de
   deshacer un toque equivocado sin tener que inventar una pantalla de correcciones. */
function cambiarPago(estado, datos, fijo, mes) {
  const fijos = datos.fijos.map((f) => {
    if (f.id !== fijo.id) return f;
    const pagos = { ...(f.pagos || {}) };
    if (pagos[mes]) delete pagos[mes];
    else pagos[mes] = { monto: Number(f.monto) || 0, moneda: f.moneda, fecha: estado.hoy };
    return { ...f, pagos };
  });
  guardar({ ...datos, fijos });
  estado.redibujar();
}

/* ---------- Alta y edición ---------- */

function ventanaFijo(estado, datos, fijo) {
  const puesto = {
    nombre: (fijo && fijo.nombre) || "",
    monto: fijo ? fijo.monto : null,
    moneda: (fijo && fijo.moneda) || "UYU",
    dia: (fijo && fijo.dia) || null,
  };

  const cuerpo = nodo(html`
    <div class="panel-firma">
      <h2 class="titulo" style="font-size:19px;margin-bottom:14px">
        ${fijo ? "Editar" : "Gasto fijo nuevo"}</h2>
      <div class="tarjeta" style="padding:0;overflow:hidden" data-campos></div>
      <div class="botonera" style="margin-top:14px">
        <button class="filtro ${puesto.moneda === "UYU" ? "prendido" : ""}" data-moneda="UYU">Pesos</button>
        <button class="filtro ${puesto.moneda === "USD" ? "prendido" : ""}" data-moneda="USD">Dólares</button>
      </div>
      <div class="botonera" style="margin-top:14px">
        <button class="boton boton-primario" data-guardar>Guardar</button>
        <button class="boton" data-cerrar>Cerrar</button>
      </div>
      ${fijo
        ? html`<div class="botonera" style="margin-top:18px">
             <button class="boton boton-chico boton-borrar" data-borrar>Borrar este gasto</button>
           </div>`
        : ""}
    </div>
  `);

  const campos = cuerpo.querySelector("[data-campos]");
  campos.append(campoTexto("fij-nombre", "Qué es", puesto.nombre, (v) => { puesto.nombre = v; }));
  campos.append(campoMonto("fij-monto", "Cuánto", "", puesto.monto, (v) => { puesto.monto = v; }));
  campos.append(campoDia("fij-dia", "Qué día del mes", puesto.dia, (v) => { puesto.dia = v; }));

  const { caja, cerrar } = telon(cuerpo);

  for (const boton of caja.querySelectorAll("[data-moneda]")) {
    boton.addEventListener("click", () => {
      puesto.moneda = boton.dataset.moneda;
      for (const otro of caja.querySelectorAll("[data-moneda]")) {
        otro.classList.toggle("prendido", otro === boton);
      }
    });
  }

  caja.querySelector("[data-cerrar]").addEventListener("click", cerrar);
  caja.querySelector("[data-guardar]").addEventListener("click", () => {
    if (!puesto.nombre && !puesto.monto) { cerrar(); return; }
    const fijos = fijo
      ? datos.fijos.map((f) => (f.id === fijo.id ? { ...f, ...puesto } : f))
      : [...datos.fijos, { id: proximoId(datos.fijos), ...puesto, pagos: {} }];
    guardar({ ...datos, fijos });
    cerrar();
    estado.redibujar();
  });

  const borrar = caja.querySelector("[data-borrar]");
  /* Borrar un fijo se lleva puesto su historial de pagos, y con él los meses ya cerrados de
     las gráficas. Por eso se pregunta, y por eso el que "ya no va más" se apaga en vez de
     borrarse — apagado deja de cobrarse pero el pasado queda como fue. */
  if (borrar) {
    borrar.addEventListener("click", () => {
      const pagados = Object.keys(fijo.pagos || {}).length;
      const aviso = pagados
        ? `Se borran también los ${pagados} pagos que ya cargaste. ¿Seguimos?`
        : "¿Borramos este gasto fijo?";
      if (!window.confirm(aviso)) return;
      guardar({ ...datos, fijos: datos.fijos.filter((f) => f.id !== fijo.id) });
      cerrar();
      estado.redibujar();
    });
  }
}

/* ---------- Campos ---------- */

function campoTexto(id, etiqueta, valor, alCambiar) {
  const fila = document.createElement("div");
  fila.className = "campo-fila";
  fila.innerHTML = html`
    <label for="${id}">${escapar(etiqueta)}</label>
    <input class="campo" id="${id}" type="text" value="${escapar(valor || "")}">
  `;
  const control = fila.querySelector(".campo");
  control.addEventListener("input", () => alCambiar(control.value));
  return fila;
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

function campoDia(id, etiqueta, valor, alCambiar) {
  const fila = document.createElement("div");
  fila.className = "campo-fila";
  fila.innerHTML = html`
    <label for="${id}">${escapar(etiqueta)} <span class="apunte">del 1 al 31</span></label>
    <input class="campo" id="${id}" type="number" inputmode="numeric" min="1" max="31"
           value="${valor ?? ""}" placeholder="1">
  `;
  fila.querySelector(".campo").addEventListener("input", (evento) => {
    const n = Number(evento.target.value);
    alCambiar(Number.isFinite(n) && n >= 1 && n <= 31 ? n : null);
  });
  return fila;
}
