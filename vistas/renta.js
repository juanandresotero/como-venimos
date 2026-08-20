/* La calculadora de renta: la pantalla que se usa con el cliente adelante.

   Da DOS numeros y esa es toda la pantalla: la renta BRUTA, que es la que el cliente ya
   escucho en otro lado, y la REAL, que es la que va a cobrar. La distancia entre las dos
   es el argumento.

   CADA MONTO EN SU MONEDA. El precio de la propiedad va en dolares, y todo lo que sale
   del alquiler — lo que entra al bolsillo, los costos, el alquiler que haria falta — va
   en la moneda del alquiler. En Uruguay lo habitual es precio en dolares y alquiler en
   pesos; decirle "cobras USD 469 por mes" a alguien que alquila en pesos lo obliga a
   hacer la cuenta de cabeza para saber si esta bien. */

import {
  DEFAULTS, calcular, detectarMoneda, alquilerNecesario, precioMaximo,
} from "../lib/renta.js";
import { traerCotizacion, cotizacionVigente, estaVencida, comoSeDice } from "../lib/cambio.js";
import { guardarCalculo, borrarCalculo, editarAjustes } from "../lib/guardado.js";
import { dibujar as dibujarFicha, nombreImagen, RENTAS } from "../lib/ficha-imagen.js";
import {
  plata, plataUSD, pct, escapar, numeroDesde, formatearMientrasEscribe,
} from "../lib/formato.js";

const html = (c, ...v) => c.reduce((t, x, i) => t + x + (v[i] ?? ""), "");

function nodo(marca) {
  const molde = document.createElement("template");
  molde.innerHTML = marca.trim();
  return molde.content;
}

/* Vive entre redibujados: si se pierde al tocar un campo, la pantalla es inusable. */
const entradas = {
  ...DEFAULTS,
  precio: null,
  alquiler_mensual: null,
  moneda_alquiler: "USD",
  moneda_precio: "USD",
  tipo_cambio: null,
  nombre_cliente: "",
  titulo: "",
};
let finosAbiertos = false;
let desgloseAbierto = false;
let objetivoPct = 0.07;
let candado = "precio";        // que dato se deja quieto en "para que de lo que queres"
let cotizacionFresca = null;
let buscandoCotizacion = false;
let eligiendoRenta = false;

/* El motor trabaja todo en la moneda del precio (dolares). Para mostrar, lo que sale del
   alquiler se pasa a la moneda en la que el usuario lo cargo. */
const alquilerEnPesos = () =>
  entradas.moneda_alquiler === "UYU" && Number(entradas.tipo_cambio) > 0;

const montoAlquiler = (usd) =>
  (alquilerEnPesos() ? `$ ${plata(usd * entradas.tipo_cambio)}` : plataUSD(usd));

/* El dolar se busca solo, una vez por dia, al abrir la calculadora.

   Antes habia que apretar "Buscar la de hoy". Con un cliente adelante eso no pasa nunca:
   se usaba la cotizacion vieja sin que nadie lo notara. Ahora se pide sola y, si no hay
   señal, se sigue con la ultima guardada diciendo de cuando es. */
async function refrescarCotizacion(estado) {
  if (buscandoCotizacion || !estaVencida(estado.datos.ajustes, estado.hoy)) return;
  buscandoCotizacion = true;
  const fresca = await traerCotizacion();
  buscandoCotizacion = false;
  if (!fresca) return;
  cotizacionFresca = fresca;
  entradas.tipo_cambio = fresca.usd_uyu;
  editarAjustes(estado, {
    tipo_cambio: { usd_uyu: fresca.usd_uyu, fecha: fresca.fecha, buscada_el: estado.hoy },
  });
  estado.redibujar();
}

export function dibujarRenta(estado) {
  estadoActual = estado;
  // Si se llego desde una propiedad de la cartera, el precio ya viene puesto.
  if (estado.precargaRenta) {
    entradas.precio = estado.precargaRenta.precio ?? entradas.precio;
    entradas.titulo = estado.precargaRenta.titulo || "";
    estado.precargaRenta = null;
  }

  const cotizacion = cotizacionVigente(estado.datos.ajustes, cotizacionFresca);
  if (entradas.tipo_cambio === null) entradas.tipo_cambio = cotizacion.valor;
  refrescarCotizacion(estado);

  const r = calcular(entradas);

  const trozo = document.createDocumentFragment();
  trozo.append(resultado(r, entradas, cotizacion));
  trozo.append(basicos(estado, cotizacion));
  trozo.append(desglose(r, entradas));
  trozo.append(inverso(entradas, estado));
  trozo.append(finos(estado, cotizacion));
  trozo.append(paraElCliente(estado, r, cotizacion));
  return trozo;
}

/* ---------- Los dos numeros ---------- */

function resultado(r, e, cotizacion) {
  const encabezado = html`
    <button class="volver" id="volver-herramientas">‹ Herramientas</button>
    <p class="etiqueta" style="margin-top:10px">Calculadora</p>
    <h1 class="titulo" style="font-size:25px;margin:4px 0 0">¿Cuánto renta?</h1>
    ${e.titulo ? html`<p class="apunte" style="margin-top:2px">${escapar(e.titulo)}</p>` : ""}`;

  if (!e.precio || !e.alquiler_mensual) {
    return conVolver(nodo(html`
      <section class="tarjeta">
        ${encabezado}
        <p class="apunte" style="margin-top:12px">
          Cargá el precio y el alquiler acá abajo. Los dos números salen solos.
        </p>
      </section>
    `), estadoActual);
  }
  if (r.falta_cotizacion) {
    return conVolver(nodo(html`
      <section class="tarjeta">
        ${encabezado}
        <p class="aviso">
          El alquiler está en pesos y todavía no hay cotización del dólar. Se está buscando;
          si no aparece, cargala en los ajustes finos.
        </p>
      </section>
    `), estadoActual);
  }

  const negativa = r.renta_neta_anual <= 0;
  return conVolver(nodo(html`
    <section class="tarjeta">
      ${encabezado}
      <div class="dos-rentas">
        <div class="renta-caja principal">
          <p class="renta-nombre">Renta real</p>
          <p class="cifra cifra-heroe renta-cifra" style="color:${negativa ? "var(--rojo)" : "var(--azul)"}">
            ${pct(r.renta_real_pct)}
          </p>
          <p class="renta-pie">con todo descontado</p>
        </div>
        <div class="renta-caja">
          <p class="renta-nombre">Renta bruta</p>
          <p class="cifra renta-cifra chica">${pct(r.renta_bruta_pct)}</p>
          <p class="renta-pie">sin descontar nada</p>
        </div>
      </div>
      <div class="datos" style="margin-top:16px">
        <div class="dato"><span class="dato-nombre">Al bolsillo, por mes</span><span class="dato-valor">${montoAlquiler(r.bolsillo_por_mes)}</span></div>
        <div class="dato"><span class="dato-nombre">Al bolsillo, por año</span><span class="dato-valor">${montoAlquiler(r.renta_neta_anual)}</span></div>
        <div class="dato"><span class="dato-nombre">Se paga sola en</span><span class="dato-valor">${
          r.anios_para_recuperar ? `${r.anios_para_recuperar.toFixed(1).replace(".", ",")} años` : "nunca"
        }</span></div>
      </div>
      ${alquilerEnPesos()
        ? html`<p class="apunte" style="margin-top:10px">
             Lo que sale del alquiler va en pesos; el precio, en dólares.
             ${escapar(comoSeDice(cotizacion))} · ${escapar(cotizacion.origen)}</p>`
        : ""}
    </section>
  `), estadoActual);
}

/* El boton de volver a Herramientas. Se engancha aparte porque el encabezado se arma como
   texto y se reusa en las tres salidas de resultado(). */
let estadoActual = null;
function conVolver(trozo, estado) {
  const boton = trozo.getElementById("volver-herramientas");
  if (boton && estado) boton.addEventListener("click", () => estado.irA("herramientas"));
  return trozo;
}

/* ---------- Los campos ---------- */

/* Un campo de monto: texto con los puntos de miles puestos MIENTRAS se escribe. Un
   <input type="number"> no admite el separador, y esperar a saltar de celda para ver
   "100.000" obliga a contar ceros de memoria. */
function campoMonto(clave, etiqueta, sufijo, alCambiar, valor, prefijo = "r") {
  const fila = document.createElement("div");
  fila.className = "campo-fila";
  fila.innerHTML = html`
    <label for="${prefijo}-${clave}">${etiqueta}${sufijo ? ` <span class="apunte">${sufijo}</span>` : ""}</label>
    <input class="campo" id="${prefijo}-${clave}" type="text" inputmode="decimal"
           value="${valor === null || valor === undefined ? "" : plata(valor)}" placeholder="0">
  `;
  const control = fila.querySelector(".campo");
  formatearMientrasEscribe(control);
  control.addEventListener("change", () => alCambiar(numeroDesde(control.value)));
  return fila;
}

function campoNumero(clave, etiqueta, sufijo, alCambiar, valor, { paso, prefijo = "r" } = {}) {
  const fila = document.createElement("div");
  fila.className = "campo-fila";
  fila.innerHTML = html`
    <label for="${prefijo}-${clave}">${etiqueta}${sufijo ? ` <span class="apunte">${sufijo}</span>` : ""}</label>
    <input class="campo" id="${prefijo}-${clave}" type="number" inputmode="decimal"
           step="${paso || "any"}" value="${valor ?? ""}" placeholder="${DEFAULTS[clave] ?? 0}">
  `;
  fila.querySelector(".campo").addEventListener("change", (evento) => {
    alCambiar(evento.target.value === "" ? null : Number(evento.target.value));
  });
  return fila;
}

function basicos(estado, cotizacion) {
  const seccion = nodo(html`
    <section class="tarjeta" style="padding:0;overflow:hidden">
      <div id="campos-renta"></div>
    </section>
  `);
  const contenedor = seccion.getElementById("campos-renta");
  const poner = (valor, clave) => {
    entradas[clave] = valor;
    if (clave === "precio" || clave === "alquiler_mensual") ajustarMoneda();
    estado.redibujar();
  };

  contenedor.append(campoMonto("precio", "Precio de la propiedad", "USD",
    (v) => poner(v, "precio"), entradas.precio));
  contenedor.append(campoMonto("alquiler_mensual", "Alquiler por mes",
    entradas.moneda_alquiler === "UYU" ? "pesos" : "USD",
    (v) => poner(v, "alquiler_mensual"), entradas.alquiler_mensual));

  // La moneda se propone sola por la relacion alquiler/precio, y se cambia de un toque.
  const moneda = document.createElement("div");
  moneda.className = "campo-fila";
  const lectura = detectarMoneda(entradas.alquiler_mensual, entradas.precio);
  moneda.innerHTML = html`
    <label>Moneda del alquiler
      ${lectura === "dudosa" ? '<span class="apunte">— revisala, la relación da rara</span>' : ""}
    </label>
    <div class="botonera" style="margin-top:4px">
      <button class="filtro ${entradas.moneda_alquiler === "USD" ? "prendido" : ""}" data-moneda="USD">USD</button>
      <button class="filtro ${entradas.moneda_alquiler === "UYU" ? "prendido" : ""}" data-moneda="UYU">Pesos</button>
    </div>
    ${entradas.moneda_alquiler === "UYU"
      ? html`<p class="apunte" style="margin-top:8px">${
          cotizacion.valor
            ? `${escapar(comoSeDice(cotizacion))} · ${escapar(cotizacion.origen)}`
            : "Buscando la cotización del día…"
        }</p>`
      : ""}
  `;
  for (const boton of moneda.querySelectorAll("[data-moneda]")) {
    boton.addEventListener("click", () => {
      entradas.moneda_alquiler = boton.dataset.moneda;
      estado.redibujar();
    });
  }
  contenedor.append(moneda);

  contenedor.append(campoNumero("meses_alquilados", "Meses alquilados por año", "de 12",
    (v) => poner(v, "meses_alquilados"), entradas.meses_alquilados));
  contenedor.append(campoNumero("irpf_pct", "Impuestos (IRPF)", "0,105 = 10,5%",
    (v) => poner(v, "irpf_pct"), entradas.irpf_pct, { paso: "0.001" }));

  return seccion;
}

/* La moneda se propone una sola vez, cuando el usuario todavia no la eligio a mano. */
function ajustarMoneda() {
  const lectura = detectarMoneda(entradas.alquiler_mensual, entradas.precio);
  if (lectura === "uyu_sobre_usd") entradas.moneda_alquiler = "UYU";
  if (lectura === "misma") entradas.moneda_alquiler = "USD";
}

/* ---------- De la bruta a la real ---------- */

/* Plegado: es la explicacion de por que un numero no es el otro, y solo hace falta cuando
   el cliente pregunta. Abierto de entrada, era media pantalla de restas. */
function desglose(r, e) {
  if (!r.renta_bruta_anual) return document.createDocumentFragment();
  const resta = (nombre, monto) => (monto
    ? html`<div class="dato"><span class="dato-nombre">${nombre}</span>
        <span class="dato-valor">− ${montoAlquiler(monto)}</span></div>`
    : "");

  const seccion = nodo(html`
    <details class="grupo" ${desgloseAbierto ? "open" : ""}>
      <summary class="grupo-cabeza">
        <span class="grupo-nombre">De ${pct(r.renta_bruta_pct)} a ${pct(r.renta_real_pct)}</span>
        <span class="grupo-flecha" aria-hidden="true">›</span>
      </summary>
      <div class="tarjeta" style="margin-top:6px">
        <div class="datos">
          <div class="dato"><span class="dato-nombre">Alquiler por 12 meses</span><span class="dato-valor">${montoAlquiler(r.renta_bruta_anual)}</span></div>
          ${resta(`Meses sin alquilar (${12 - (e.meses_alquilados ?? 11)})`, r.costo_meses_vacios)}
          ${resta("Impuestos", r.impuesto)}
          ${resta("Refacción y mantenimiento", r.costo_refaccion)}
          ${resta("Contribución y Primaria", r.costos_fijos)}
          ${resta("Administración", r.costo_admin)}
          <div class="dato"><span class="dato-nombre"><strong>Queda limpio</strong></span><span class="dato-valor">${montoAlquiler(r.renta_neta_anual)}</span></div>
          ${r.gastos_de_compra
            ? html`<div class="dato"><span class="dato-nombre">…sobre un capital de</span><span class="dato-valor">${plataUSD(r.capital_invertido)}</span></div>`
            : ""}
        </div>
        <p class="apunte" style="margin-top:12px">
          Se van <strong>${montoAlquiler(r.perdida_por_costos)}</strong> por año entre lo
          que la renta de la calle no cuenta.
        </p>
      </div>
    </details>
  `);
  seccion.querySelector("details").addEventListener("toggle", (evento) => {
    desgloseAbierto = evento.target.open;
  });
  return seccion;
}

/* ---------- Ajustes finos ---------- */

/* Aca vive lo que no se toca siempre. Los gastos de compra arrancan en CERO: si no se
   cargan, no ensucian la cuenta. */
function finos(estado, cotizacion) {
  const seccion = nodo(html`
    <details class="grupo" ${finosAbiertos ? "open" : ""}>
      <summary class="grupo-cabeza">
        <span class="grupo-nombre">Ajustes finos</span>
        <span class="grupo-flecha" aria-hidden="true">›</span>
      </summary>
      <div class="tarjeta" style="padding:0;overflow:hidden;margin-top:6px">
        <div id="campos-finos"></div>
      </div>
    </details>
  `);
  seccion.querySelector("details").addEventListener("toggle", (evento) => {
    finosAbiertos = evento.target.open;
  });

  const contenedor = seccion.getElementById("campos-finos");
  const poner = (valor, clave) => {
    entradas[clave] = valor;
    estado.redibujar();
  };
  const num = (clave, etiqueta, sufijo, opciones) =>
    contenedor.append(campoNumero(clave, etiqueta, sufijo,
      (v) => poner(v, clave), entradas[clave], { ...opciones, prefijo: "f" }));
  const mon = (clave, etiqueta, sufijo) =>
    contenedor.append(campoMonto(clave, etiqueta, sufijo,
      (v) => poner(v, clave), entradas[clave], "f"));

  /* Salieron de aca, a pedido: el PLAZO DEL CONTRATO (y con el la comision de alquiler,
     que sin plazo no se puede prorratear y quedaba como un campo que no hacia nada) y el
     MONTO FIJO DE REFACCION, que competia con el campo de arriba y obligaba a acordarse
     de cual le ganaba a cual. El motor los sigue entendiendo, asi que los calculos
     guardados de antes se abren igual con los valores que tenian. */
  num("gastos_compra_pct", "Gastos de compra (ITP y escritura)", "0,07 = 7% · 0 = no contarlo",
    { paso: "0.005" });
  num("refaccion_meses", "Refacción por año", "meses de alquiler");
  mon("contribucion_anual", "Contribución inmobiliaria", "USD por año");
  mon("primaria_anual", "Impuesto de Primaria", "USD por año");
  num("admin_pct", "Administración", "0,05 = 5%", { paso: "0.01" });

  // El dolar se busca solo; el campo queda por si hay que forzarlo.
  const fila = document.createElement("div");
  fila.className = "campo-fila";
  fila.innerHTML = html`
    <label for="f-cambio">Dólar
      <span class="apunte">${escapar(cotizacion.origen)}${cotizacion.fecha ? ` · ${escapar(cotizacion.fecha)}` : ""}</span>
    </label>
    <input class="campo" id="f-cambio" type="number" inputmode="decimal" step="any"
           value="${entradas.tipo_cambio ?? ""}">
    <div class="botonera" style="margin-top:6px">
      <button class="filtro" id="buscar-cambio">Buscar la de hoy</button>
    </div>
  `;
  fila.querySelector(".campo").addEventListener("change", (evento) => {
    entradas.tipo_cambio = evento.target.value === "" ? null : Number(evento.target.value);
    estado.redibujar();
  });
  fila.querySelector("#buscar-cambio").addEventListener("click", async (evento) => {
    evento.target.textContent = "Buscando…";
    const fresca = await traerCotizacion();
    if (!fresca) {
      evento.target.textContent = "No se pudo — cargala a mano";
      return;
    }
    cotizacionFresca = fresca;
    entradas.tipo_cambio = fresca.usd_uyu;
    editarAjustes(estado, {
      tipo_cambio: { usd_uyu: fresca.usd_uyu, fecha: fresca.fecha, buscada_el: estado.hoy },
    });
    estado.redibujar();
  });
  contenedor.append(fila);

  return seccion;
}

/* ---------- El inverso, con candado ---------- */

/* Antes se movian los dos numeros a la vez — el alquiler que hace falta Y el precio
   maximo — y no se entendia nada: son dos respuestas a dos preguntas distintas, y cada
   una supone que la otra variable esta quieta. Ahora se elige cual se deja quieta.

   El candado arranca en el PRECIO, con el que ya esta cargado arriba: la pregunta de
   todos los dias es "esta propiedad, a este precio, ¿cuanto tiene que rendir de
   alquiler?". */
function inverso(e, estado) {
  const hayPrecio = Boolean(e.precio);
  const hayAlquiler = Boolean(e.alquiler_mensual);
  const fijandoPrecio = candado === "precio";

  const alquiler = alquilerNecesario(e, objetivoPct);
  const precio = precioMaximo(e, objetivoPct);

  // Cuanto hay que mover lo que NO esta con candado, respecto de lo que hay cargado hoy.
  const actual = fijandoPrecio ? e.alquiler_mensual : e.precio;
  const hace_falta = fijandoPrecio
    ? (alquiler !== null && alquilerEnPesos() ? alquiler * e.tipo_cambio : alquiler)
    : precio;
  const diferencia = actual && hace_falta ? hace_falta - actual : null;

  /* Ojo con el signo, que es distinto de cada lado y facil de decir al reves:

       Con el precio quieto, lo que sale es el ALQUILER que hace falta. Si da mas que el
       cargado, falta alquiler. Si da menos, ya rinde de mas.

       Con el alquiler quieto, lo que sale es el PRECIO MAXIMO que se puede pagar. Si el
       maximo queda POR DEBAJO del precio real, la propiedad esta cara para ese objetivo —
       no "sobra" nada, que era justo lo contrario de lo que pasa. */
  const comparar = (fijaElPrecio, dif) => {
    const enPlata = (x) => (fijaElPrecio && alquilerEnPesos() ? `$ ${plata(x)}` : plataUSD(x));
    if (fijaElPrecio) {
      return dif > 0
        ? html`Con lo que tenés cargado falta <strong>${enPlata(dif)}</strong> de alquiler por mes.`
        : html`Ya rinde más que tu objetivo: te sobran <strong>${enPlata(-dif)}</strong> de alquiler.`;
    }
    return dif > 0
      ? html`Podés pagar hasta <strong>${plataUSD(dif)}</strong> más y sigue dando el objetivo.`
      : html`A ese alquiler, la propiedad está <strong>${plataUSD(-dif)}</strong> por encima
          de lo que deberías pagar para llegar al objetivo.`;
  };

  const seccion = nodo(html`
    <section class="tarjeta">
      <div class="tarjeta-titulo">
        <h2 class="titulo" style="font-size:17px">Para que dé lo que querés</h2>
        <span class="apunte">renta real objetivo</span>
      </div>

      <div class="barra-objetivo">
        <span class="cifra barra-objetivo-cifra" id="objetivo-cifra">${pct(objetivoPct)}</span>
        <input type="range" class="deslizador" id="objetivo-barra"
               min="1" max="15" step="0.5" value="${(objetivoPct * 100).toFixed(1)}"
               aria-label="Renta real objetivo">
      </div>
      <div class="barra-puntas">
        <span>1%</span><span>15%</span>
      </div>

      <p class="apunte" style="margin:14px 0 6px">Dejo quieto</p>
      <div class="botonera" style="margin-top:0">
        <button class="filtro ${fijandoPrecio ? "prendido" : ""}" data-candado="precio">
          🔒 El precio${hayPrecio ? ` · ${plataUSD(e.precio)}` : ""}
        </button>
        <button class="filtro ${fijandoPrecio ? "" : "prendido"}" data-candado="alquiler">
          🔒 El alquiler${hayAlquiler ? ` · ${alquilerEnPesos() ? `$ ${plata(e.alquiler_mensual)}` : plataUSD(e.alquiler_mensual)}` : ""}
        </button>
      </div>

      <div class="datos" style="margin-top:14px">
        <div class="dato">
          <span class="dato-nombre">
            ${fijandoPrecio ? "Alquiler que necesitás" : "Precio máximo a pagar"}
            ${fijandoPrecio && !hayPrecio ? " (cargá el precio)" : ""}
            ${!fijandoPrecio && !hayAlquiler ? " (cargá el alquiler)" : ""}
          </span>
          <span class="dato-valor" id="objetivo-valor">${
            hace_falta
              ? (fijandoPrecio
                  ? (alquilerEnPesos() ? `$ ${plata(hace_falta)}` : plataUSD(hace_falta))
                  : plataUSD(hace_falta))
              : "—"
          }</span>
        </div>
      </div>
      <p class="apunte" style="margin-top:10px" id="objetivo-comparar"
         ${diferencia !== null && Math.abs(diferencia) > 1 ? "" : "hidden"}>${
        diferencia !== null && Math.abs(diferencia) > 1 ? comparar(fijandoPrecio, diferencia) : ""
      }</p>
    </section>
  `);

  /* La barra NO redibuja la pantalla en cada movimiento del dedo: se refrescan sólo el
     número de al lado, el resultado y la comparación. Redibujar todo mientras se arrastra
     hace saltar el scroll y se siente trabado. La pantalla entera se rehace recién al
     soltar, para que el resto quede al día. */
  const barra = seccion.getElementById("objetivo-barra");
  const cifra = seccion.getElementById("objetivo-cifra");
  const valorNodo = seccion.getElementById("objetivo-valor");
  const compararNodo = seccion.getElementById("objetivo-comparar");

  /* Rehace la MISMA cuenta de arriba, con el objetivo nuevo. Se repite a proposito y no se
     saca a una funcion aparte: son cuatro renglones y tenerlos al lado del calculo original
     hace evidente si alguna vez se separan. */
  const refrescar = () => {
    cifra.textContent = pct(objetivoPct);
    const nuevoAlquiler = alquilerNecesario(e, objetivoPct);
    const nuevoPrecio = precioMaximo(e, objetivoPct);
    const falta = fijandoPrecio
      ? (nuevoAlquiler !== null && alquilerEnPesos() ? nuevoAlquiler * e.tipo_cambio : nuevoAlquiler)
      : nuevoPrecio;
    const cuantoHay = fijandoPrecio ? e.alquiler_mensual : e.precio;
    const dif = cuantoHay && falta ? falta - cuantoHay : null;

    valorNodo.textContent = falta
      ? (fijandoPrecio
        ? (alquilerEnPesos() ? `$ ${plata(falta)}` : plataUSD(falta))
        : plataUSD(falta))
      : "—";
    compararNodo.hidden = !(dif !== null && Math.abs(dif) > 1);
    if (!compararNodo.hidden) compararNodo.innerHTML = comparar(fijandoPrecio, dif);
  };

  barra.addEventListener("input", () => {
    objetivoPct = Number(barra.value) / 100;
    refrescar();
  });
  barra.addEventListener("change", () => estado.redibujar());
  for (const boton of seccion.querySelectorAll("[data-candado]")) {
    boton.addEventListener("click", () => {
      candado = boton.dataset.candado;
      estado.redibujar();
    });
  }
  return seccion;
}

/* ---------- Lo que se le manda al cliente ---------- */

async function mandarFicha(estado, cual, cotizacion) {
  const r = calcular(entradas);
  const lienzo = document.createElement("canvas");
  await dibujarFicha(lienzo, entradas, r, estado.datos.ajustes.agente, {
    mostrar: cual,
    // Que quede escrito a cuanto se tomo el dolar, si es que se uso.
    cotizacion: alquilerEnPesos() ? comoSeDice(cotizacion) : null,
  });
  await new Promise((listo) => {
    lienzo.toBlob(async (blob) => {
      if (!blob) return listo();
      const nombre = nombreImagen(entradas.titulo || entradas.nombre_cliente, cual);
      const archivo = new File([blob], nombre, { type: "image/png" });
      if (navigator.canShare && navigator.canShare({ files: [archivo] })) {
        try {
          await navigator.share({ files: [archivo] });
        } catch {
          // se cancelo
        }
        return listo();
      }
      const url = URL.createObjectURL(blob);
      const enlace = document.createElement("a");
      enlace.href = url;
      enlace.download = nombre;
      enlace.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      listo();
    }, "image/png");
  });
}

function paraElCliente(estado, r, cotizacion) {
  const lista = estado.datos.calculos_renta || [];
  const sePuede = Boolean(entradas.precio && entradas.alquiler_mensual && !r.falta_cotizacion);

  const seccion = nodo(html`
    <section class="tarjeta">
      <h2 class="titulo" style="font-size:17px;margin-bottom:10px">Para el cliente</h2>
      <input class="campo" id="cliente" type="text" placeholder="Nombre del cliente"
             value="${escapar(entradas.nombre_cliente)}">
      <div class="botonera">
        <button class="boton boton-primario" id="ficha-imagen" ${sePuede ? "" : "disabled"}>Mandar ficha</button>
        <button class="boton" id="compartir-calculo" ${sePuede ? "" : "disabled"}>Mandar texto</button>
        <button class="boton" id="guardar-calculo" ${sePuede ? "" : "disabled"}>Guardar</button>
      </div>
      <div id="elegir-renta" ${eligiendoRenta ? "" : "hidden"}>
        <p class="apunte" style="margin:14px 0 8px">¿Qué número le mandás?</p>
        <div class="menu-indicadores" id="opciones-renta"></div>
      </div>
      <p class="apunte" id="aviso-guardado" style="margin-top:10px"></p>
      <div class="lista" style="margin-top:14px" id="lista-calculos"></div>
    </section>
  `);

  seccion.getElementById("cliente").addEventListener("input", (evento) => {
    entradas.nombre_cliente = evento.target.value;
  });

  /* No todos los clientes quieren lo mismo: al que ya escucho "esto renta 8%" hay que
     mostrarle las dos juntas; al que ya entendio, alcanza con la real. */
  const cajita = seccion.getElementById("elegir-renta");
  seccion.getElementById("ficha-imagen").addEventListener("click", () => {
    eligiendoRenta = !eligiendoRenta;
    cajita.hidden = !eligiendoRenta;
  });

  const opciones = seccion.getElementById("opciones-renta");
  for (const opcion of RENTAS) {
    const boton = document.createElement("button");
    boton.className = "opcion opcion-boton";
    boton.innerHTML = html`
      <span>
        <span class="opcion-nombre">${escapar(opcion.nombre)}</span>
        <span class="opcion-pista">${escapar(opcion.pista)}</span>
      </span>
      <span class="grupo-flecha" aria-hidden="true">›</span>`;
    boton.addEventListener("click", async () => {
      boton.disabled = true;
      await mandarFicha(estado, opcion.clave, cotizacion);
      boton.disabled = false;
      eligiendoRenta = false;
      cajita.hidden = true;
    });
    opciones.append(boton);
  }

  /* Guardar es UN toque. Antes guardaba en memoria y despues habia que acordarse de
     apretar el "Guardar" de la barra de arriba para que subiera al repo — dos pasos para
     una sola intencion, y el segundo se olvidaba. */
  seccion.getElementById("guardar-calculo").addEventListener("click", async (evento) => {
    guardarCalculo(estado, {
      fecha: estado.hoy,
      nombre_cliente: entradas.nombre_cliente || entradas.titulo || "Sin nombre",
      entradas: { ...entradas },
      resultados: {
        renta_real_pct: r.renta_real_pct,
        renta_bruta_pct: r.renta_bruta_pct,
        bolsillo_por_mes: r.bolsillo_por_mes,
      },
      notas: "",
    });
    evento.target.disabled = true;
    evento.target.textContent = "Guardando…";
    await estado.guardar();
    estado.redibujar();
  });

  seccion.getElementById("compartir-calculo").addEventListener("click", () => {
    const texto = textoParaCliente(entradas, r, cotizacion);
    if (navigator.share) {
      navigator.share({ title: "Cálculo de renta", text: texto }).catch(() => {});
    } else {
      window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, "_blank", "noopener");
    }
  });

  const contenedor = seccion.getElementById("lista-calculos");
  if (!lista.length) {
    contenedor.replaceWith(nodo(html`<p class="apunte" style="margin-top:14px">Todavía no guardaste ninguno.</p>`));
    return seccion;
  }
  lista.forEach((c, indice) => {
    const suyo = c.entradas || {};
    const enPesos = suyo.moneda_alquiler === "UYU";
    const fila = nodo(html`
      <button class="fila" data-abrir="${indice}">
        <span class="fila-cuerpo">
          <span class="fila-titulo">${escapar(c.nombre_cliente)}</span>
          <span class="fila-sub">${escapar(c.fecha)} · ${plataUSD(suyo.precio)} · alquiler
            ${enPesos ? `$ ${plata(suyo.alquiler_mensual)}` : plataUSD(suyo.alquiler_mensual)}</span>
        </span>
        <span class="fila-derecha">
          <span class="cifra cifra-media">${pct((c.resultados || {}).renta_real_pct)}</span>
          <span class="chip-apagado" data-borrar="${indice}">borrar</span>
        </span>
      </button>
    `);
    fila.querySelector("[data-abrir]").addEventListener("click", async (evento) => {
      if (evento.target.dataset.borrar !== undefined) {
        borrarCalculo(estado, Number(evento.target.dataset.borrar));
        await estado.guardar();
      } else {
        Object.assign(entradas, c.entradas);
      }
      estado.redibujar();
    });
    contenedor.append(fila);
  });

  return seccion;
}

export function textoParaCliente(e, r, cotizacion) {
  const enPesos = e.moneda_alquiler === "UYU" && Number(e.tipo_cambio) > 0;
  const delAlquiler = (usd) =>
    (enPesos ? `$ ${plata(usd * e.tipo_cambio)}` : `USD ${plata(usd)}`);

  const lineas = [
    e.titulo ? `*${e.titulo}*` : "*Cálculo de renta*",
    `Precio: USD ${plata(e.precio)}`,
    `Alquiler: ${enPesos ? "$" : "USD"} ${plata(e.alquiler_mensual)} por mes`,
    "",
    `Renta bruta: ${pct(r.renta_bruta_pct)} (sin descontar nada)`,
    `*Renta real: ${pct(r.renta_real_pct)}*`,
    `Al bolsillo: ${delAlquiler(r.bolsillo_por_mes)} por mes`,
    `Se paga sola en ${r.anios_para_recuperar ? `${r.anios_para_recuperar.toFixed(1).replace(".", ",")} años` : "—"}`,
    "",
    `La renta real descuenta los meses sin alquilar, impuestos (${pct(e.irpf_pct)}),`,
    "refacción y gastos. La bruta es el alquiler por doce sobre el precio.",
  ];
  if (enPesos && cotizacion && cotizacion.valor) lineas.push(`${comoSeDice(cotizacion)}.`);
  lineas.push("", "Juan Andrés Otero · RE/MAX Único");
  return lineas.join("\n");
}
