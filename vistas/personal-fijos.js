/* Gastos fijos: lo que se paga todos los meses.

   La pantalla es una lista con un tilde por gasto. Tildar es pagar — ahí y sólo ahí la plata
   sale de la cuenta, porque hasta que se paga sigue estando.

   Cada pago GUARDA SU MONTO. Si el historial se calculara con el precio de hoy, subir el
   alquiler reescribiría todos los meses anteriores y las gráficas del año pasado cambiarían
   solas. */

import {
  leer, guardar, mesDe, proximoId, estaPago, pagoDelMes, faltaPagar, montoEstimado,
  yaEstabaPago,
} from "../lib/personal.js";
import { escapar, plata, numeroDesde, formatearMientrasEscribe } from "../lib/formato.js";
import { telon } from "./ventana.js";
import { monto, guardarConCambio } from "./personal-resumen.js";

const html = (c, ...v) => c.reduce((t, x, i) => t + x + (v[i] ?? ""), "");

function nodo(marca) {
  const molde = document.createElement("template");
  molde.innerHTML = marca.trim();
  return molde.content;
}

/* Los dos grupos de la pantalla. Van en este orden porque el de monto fijo es el que se
   tilda sin pensar —alquiler, colegio— y el otro pide mirar la factura. */
const GRUPOS = [
  { varia: false, nombre: "Siempre igual" },
  { varia: true, nombre: "Cambia cada mes" },
];

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
    /* Separados por título, con los mismos nombres que se eligen al crearlos: lo que se
       marcó en la ventanita es el título del grupo donde el gasto aparece. Un grupo vacío no
       se muestra — un encabezado sin nada abajo es una pregunta sin respuesta. */
    for (const grupo of GRUPOS) {
      const suyos = activos.filter((f) => Boolean(f.varia) === grupo.varia);
      if (!suyos.length) continue;
      trozo.append(nodo(html`
        <h2 class="titulo" style="font-size:15px;margin:18px 0 8px">${escapar(grupo.nombre)}</h2>`));
      trozo.append(laLista(estado, datos, suyos, mes));
    }
  }

  const agregar = nodo(html`
    <div class="botonera" style="margin-top:16px">
      <button class="boton boton-primario" id="f-nuevo">Agregar uno</button>
      ${falta.length
        ? html`<button class="boton" id="f-ya">Ya pagué algunos</button>`
        : ""}
    </div>`);
  agregar.getElementById("f-nuevo").addEventListener("click",
    () => ventanaFijo(estado, datos, null));
  const ya = agregar.getElementById("f-ya");
  if (ya) ya.addEventListener("click", () => ventanaYaPagados(estado, datos, falta, mes));
  trozo.append(agregar);
  return trozo;
}

/* "Estos ya estaban pagados cuando empecé".

   Pasa al cargar la app por primera vez: el saldo inicial que se puso YA tiene descontados
   los gastos del mes, así que tildarlos normalmente los cobraría dos veces. Van marcados
   como `previo`: cuentan como gasto del mes —la plata salió— pero no tocan el saldo.

   Es una pantalla aparte y no una pregunta al tildar porque esto se hace UNA VEZ. Meterle un
   paso más al tilde de todos los meses, para resolver algo de un solo día, sería cobrarle a
   la operación frecuente el precio de la rara. */
function ventanaYaPagados(estado, datos, pendientes, mes) {
  const elegidos = new Set();

  const cuerpo = nodo(html`
    <div class="panel-firma">
      <h2 class="titulo" style="font-size:19px;margin-bottom:6px">¿Cuáles ya pagaste?</h2>
      <p class="apunte" style="margin-bottom:12px">Estos quedan como pagados este mes pero no
        se descuentan: la plata ya había salido antes de que empezaras a contar.</p>
      <div class="lista" data-lista></div>
      <div class="botonera" style="margin-top:14px">
        <button class="boton boton-primario" data-guardar>Marcarlos</button>
        <button class="boton" data-cerrar>Cerrar</button>
      </div>
    </div>
  `);

  const lista = cuerpo.querySelector("[data-lista]");
  for (const f of pendientes) {
    const fila = nodo(html`
      <div class="fila fila-fijo">
        <button class="tilde-pago" data-elegir="${f.id}" aria-pressed="false"
                aria-label="Marcar ${escapar(f.nombre)}"></button>
        <span class="fila-cuerpo"><span class="fila-titulo">${escapar(f.nombre)}</span></span>
        <span class="fila-derecha">
          <span class="cifra cifra-media">${f.aproximado ? "≈ " : ""}${monto(f.monto, f.moneda)}</span>
        </span>
      </div>
    `);
    const boton = fila.querySelector("[data-elegir]");
    boton.addEventListener("click", () => {
      if (elegidos.has(f.id)) elegidos.delete(f.id);
      else elegidos.add(f.id);
      const puesto = elegidos.has(f.id);
      boton.classList.toggle("pagado", puesto);
      boton.textContent = puesto ? "✓" : "";
      boton.setAttribute("aria-pressed", puesto ? "true" : "false");
    });
    lista.append(fila);
  }

  const { caja, cerrar } = telon(cuerpo);
  caja.querySelector("[data-cerrar]").addEventListener("click", cerrar);
  caja.querySelector("[data-guardar]").addEventListener("click", () => {
    if (!elegidos.size) { cerrar(); return; }
    const fijos = datos.fijos.map((f) => {
      if (!elegidos.has(f.id)) return f;
      const estimado = montoEstimado(f);
      return {
        ...f,
        pagos: {
          ...(f.pagos || {}),
          [mes]: {
            monto: estimado.monto, moneda: f.moneda, fecha: estado.hoy, previo: true,
          },
        },
      };
    });
    /* Se guarda SIN pasar por el cambio deducido: justamente lo que define a estos pagos es
       que no mueven la caja. */
    guardar({ ...datos, fijos });
    cerrar();
    estado.redibujar();
  });
}

/* Un renglón por gasto: el tilde a la izquierda —que es lo que se toca todos los meses— y el
   nombre, que abre la edición.

   Ordenados de mayor a menor. Antes iban por día de vencimiento, pero ese dato ya no se
   guarda; en una lista de cinco se encuentra igual, y así se ve de un golpe cuál pesa más. */
function laLista(estado, datos, fijos, mes) {
  const caja = document.createElement("div");
  caja.className = "lista";

  const cuanto = (f) => montoEstimado(f).monto;
  for (const fijo of [...fijos].sort((a, b) => cuanto(b) - cuanto(a))) {
    const pago = pagoDelMes(fijo, mes);
    const estimado = montoEstimado(fijo);
    /* Los que cambian de monto se muestran con "≈" y con lo que se pagó de verdad cuando ya
       está pagado: el promedio sirve para saber cuánto reservar, no para el historial. */
    const cifra = pago
      ? monto(pago.monto, pago.moneda || fijo.moneda)
      : `${estimado.aproximado ? "≈ " : ""}${monto(estimado.monto, fijo.moneda)}`;
    const previo = yaEstabaPago(pago);
    const fila = nodo(html`
      <div class="fila fila-fijo">
        <button class="tilde-pago ${pago ? "pagado" : ""} ${previo ? "de-antes" : ""}"
                data-pagar="${fijo.id}"
                aria-label="${pago ? "Marcar sin pagar" : "Marcar pagado"}"
                aria-pressed="${pago ? "true" : "false"}">${pago ? "✓" : ""}</button>
        <button class="fila-cuerpo" data-editar="${fijo.id}" style="text-align:left">
          <span class="fila-titulo">${escapar(fijo.nombre || "Sin nombre")}</span>
          ${pago
            ? html`<span class="fila-sub">${previo
                ? "ya estaba pagado"
                : `pagado el ${escapar(String(pago.fecha || "").slice(8, 10))}`}</span>`
            : ""}
        </button>
        <span class="fila-derecha">
          <span class="cifra cifra-media">${cifra}</span>
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
   deshacer un toque equivocado sin tener que inventar una pantalla de correcciones.

   Si el gasto CAMBIA de monto —UTE, OSE, Antel, BPS— tildar pregunta cuánto fue esta vez,
   con el promedio ya puesto. Guardar el estimado sin preguntar sería inventar un número en
   el único momento en que se conoce el verdadero: la factura está en la mano. */
function cambiarPago(estado, datos, fijo, mes) {
  const anotar = (cuanto, previo = false) => {
    const fijos = datos.fijos.map((f) => {
      if (f.id !== fijo.id) return f;
      const pagos = { ...(f.pagos || {}) };
      pagos[mes] = { monto: Number(cuanto) || 0, moneda: f.moneda, fecha: estado.hoy, previo };
      return { ...f, pagos };
    });
    guardarConCambio(estado, { ...datos, fijos });
    estado.redibujar();
  };

  if (estaPago(fijo, mes)) {
    const fijos = datos.fijos.map((f) => {
      if (f.id !== fijo.id) return f;
      const pagos = { ...(f.pagos || {}) };
      delete pagos[mes];
      return { ...f, pagos };
    });
    guardar({ ...datos, fijos });
    estado.redibujar();
    return;
  }

  if (!fijo.varia) {
    anotar(fijo.monto);
    return;
  }
  ventanaCuantoFue(fijo, anotar);
}

/* Una sola pregunta y dos botones. Es lo que se hace con la factura en la mano, así que
   cuanto menos haya que leer, mejor. */
function ventanaCuantoFue(fijo, anotar) {
  const estimado = montoEstimado(fijo);
  let cuanto = Math.round(estimado.monto);

  const cuerpo = nodo(html`
    <div class="panel-firma">
      <h2 class="titulo" style="font-size:19px;margin-bottom:6px">${escapar(fijo.nombre)}</h2>
      <p class="apunte" style="margin-bottom:12px">${estimado.sobre
        ? `Los últimos ${estimado.sobre} dieron ${monto(estimado.monto, fijo.moneda)} en promedio.`
        : "¿Cuánto vino este mes?"}</p>
      <div class="tarjeta" style="padding:0;overflow:hidden" data-campos></div>
      <div class="botonera" style="margin-top:14px">
        <button class="boton boton-primario" data-guardar>Pagado</button>
        <button class="boton" data-cerrar>Cerrar</button>
      </div>
    </div>
  `);
  cuerpo.querySelector("[data-campos]").append(
    campoMonto("pag-monto", "Cuánto fue", "", cuanto, (v) => { cuanto = v; }));

  const { caja, cerrar } = telon(cuerpo);
  caja.querySelector("[data-cerrar]").addEventListener("click", cerrar);
  caja.querySelector("[data-guardar]").addEventListener("click", () => {
    cerrar();
    anotar(cuanto);
  });
}

/* ---------- Alta y edición ---------- */

function ventanaFijo(estado, datos, fijo) {
  const puesto = {
    nombre: (fijo && fijo.nombre) || "",
    monto: fijo ? fijo.monto : null,
    moneda: (fijo && fijo.moneda) || "UYU",
    varia: Boolean(fijo && fijo.varia),
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
      <!-- UTE, OSE, Antel, BPS: se pagan sí o sí todos los meses pero por otro número cada
           vez. Al tildarlos, la app pregunta cuánto vino. -->
      <div class="botonera" style="margin-top:10px">
        <button class="filtro ${puesto.varia ? "" : "prendido"}" data-varia="no">Siempre igual</button>
        <button class="filtro ${puesto.varia ? "prendido" : ""}" data-varia="si">Cambia cada mes</button>
      </div>
      <p class="apunte" style="margin-top:8px" data-pista></p>
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
  const campoDelMonto = campoMonto("fij-monto", puesto.varia ? "Más o menos cuánto" : "Cuánto",
    "", puesto.monto, (v) => { puesto.monto = v; });
  campos.append(campoDelMonto);

  const { caja, cerrar } = telon(cuerpo);

  const pintarVaria = () => {
    caja.querySelector("[data-pista]").textContent = puesto.varia
      ? "Al tildarlo te pregunto cuánto vino. Mientras tanto uso el promedio de los últimos."
      : "";
    const etiqueta = campoDelMonto.querySelector("label");
    if (etiqueta) etiqueta.textContent = puesto.varia ? "Más o menos cuánto" : "Cuánto";
  };
  pintarVaria();
  for (const boton of caja.querySelectorAll("[data-varia]")) {
    boton.addEventListener("click", () => {
      puesto.varia = boton.dataset.varia === "si";
      for (const otro of caja.querySelectorAll("[data-varia]")) {
        otro.classList.toggle("prendido", otro === boton);
      }
      pintarVaria();
    });
  }

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
