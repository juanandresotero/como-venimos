/* La calculadora de renta: la pantalla que se usa con el cliente adelante.

   Todo lo que hace falta entra sin scrollear: precio, alquiler y el numero grande. Los
   ajustes finos van plegados con valores razonables ya puestos, para que el 90% de las
   veces no haya que tocarlos. */

import {
  DEFAULTS, calcular, detectarMoneda, alquilerNecesario, precioMaximo,
} from "../lib/renta.js";
import { traerCotizacion, cotizacionVigente } from "../lib/cambio.js";
import { guardarCalculo, borrarCalculo, editarAjustes } from "../lib/guardado.js";
import { plata, plataUSD, pct, escapar } from "../lib/formato.js";

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
let objetivoPct = 0.07;
let cotizacionFresca = null;

export function dibujarRenta(estado) {
  // Si se llego desde una propiedad de la cartera, el precio ya viene puesto.
  if (estado.precargaRenta) {
    entradas.precio = estado.precargaRenta.precio ?? entradas.precio;
    entradas.titulo = estado.precargaRenta.titulo || "";
    estado.precargaRenta = null;
  }

  const cotizacion = cotizacionVigente(estado.datos.ajustes, cotizacionFresca);
  if (entradas.tipo_cambio === null) entradas.tipo_cambio = cotizacion.valor;

  const r = calcular(entradas);

  const trozo = document.createDocumentFragment();
  trozo.append(encabezado(entradas));
  trozo.append(resultado(r, entradas));
  trozo.append(basicos(estado, cotizacion));
  trozo.append(desglose(r));
  trozo.append(finos(estado));
  trozo.append(inverso(entradas, estado));
  trozo.append(guardados(estado, r));
  return trozo;
}

function encabezado(e) {
  return nodo(html`
    <section style="margin-bottom:14px">
      <p class="etiqueta">Calculadora</p>
      <h1 class="titulo" style="font-size:27px;margin-top:4px">¿Cuánto renta?</h1>
      ${e.titulo ? html`<p class="apunte">${escapar(e.titulo)}</p>` : ""}
    </section>
  `);
}

function resultado(r, e) {
  if (!e.precio || !e.alquiler_mensual) {
    return nodo(html`
      <section class="tarjeta">
        <p class="apunte">Cargá el precio y el alquiler y el número aparece solo.</p>
      </section>
    `);
  }
  if (r.falta_cotizacion) {
    return nodo(html`
      <section class="tarjeta">
        <p class="aviso" style="margin:0">
          El alquiler está en pesos y no hay cotización del dólar. Cargala abajo y el
          número sale al toque.
        </p>
      </section>
    `);
  }

  const negativa = r.renta_neta_anual <= 0;
  return nodo(html`
    <section class="tarjeta">
      <p class="etiqueta">Renta real, después de todo</p>
      <p class="cifra cifra-heroe" style="margin:6px 0 4px;color:${negativa ? "var(--rojo)" : "var(--azul)"}">
        ${pct(r.renta_real_pct)}
      </p>
      <p class="apunte">
        sobre ${plataUSD(r.capital_invertido)} realmente invertidos ·
        la bruta que se dice en la calle es ${pct(r.renta_bruta_pct)}
      </p>
      <div class="datos" style="margin-top:16px">
        <div class="dato"><span class="dato-nombre">Al bolsillo, por mes</span><span class="dato-valor">${plataUSD(r.bolsillo_por_mes)}</span></div>
        <div class="dato"><span class="dato-nombre">Al bolsillo, por año</span><span class="dato-valor">${plataUSD(r.renta_neta_anual)}</span></div>
        <div class="dato"><span class="dato-nombre">Se paga sola en</span><span class="dato-valor">${
          r.anios_para_recuperar ? `${r.anios_para_recuperar.toFixed(1).replace(".", ",")} años` : "nunca"
        }</span></div>
      </div>
    </section>
  `);
}

function basicos(estado, cotizacion) {
  const seccion = nodo(html`
    <section class="tarjeta" style="padding:0;overflow:hidden">
      <div id="campos-renta"></div>
    </section>
  `);
  const contenedor = seccion.getElementById("campos-renta");

  const agregar = (clave, etiqueta, sufijo, paso) => {
    const fila = document.createElement("div");
    fila.className = "campo-fila";
    fila.innerHTML = html`
      <label for="r-${clave}">${etiqueta}${sufijo ? ` <span class="apunte">${sufijo}</span>` : ""}</label>
      <input class="campo" id="r-${clave}" type="number" inputmode="decimal"
             step="${paso || "any"}" value="${entradas[clave] ?? ""}">
    `;
    const control = fila.querySelector(".campo");
    control.addEventListener("change", () => {
      entradas[clave] = control.value === "" ? null : Number(control.value);
      if (clave === "precio" || clave === "alquiler_mensual") ajustarMoneda();
      estado.redibujar();
    });
    contenedor.append(fila);
  };

  agregar("precio", "Precio de la propiedad", "USD");
  agregar("alquiler_mensual", "Alquiler por mes", entradas.moneda_alquiler);

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
  `;
  for (const boton of moneda.querySelectorAll("[data-moneda]")) {
    boton.addEventListener("click", () => {
      entradas.moneda_alquiler = boton.dataset.moneda;
      estado.redibujar();
    });
  }
  contenedor.append(moneda);

  if (entradas.moneda_alquiler === "UYU") contenedor.append(filaCotizacion(estado, cotizacion));

  agregar("meses_alquilados", "Meses alquilados por año", "de 12");
  agregar("plazo_anios", "Plazo del contrato", "años");
  agregar("irpf_pct", "Impuestos (IRPF)", "0,105 = 10,5%", "0.001");

  return seccion;
}

/* La moneda se propone una sola vez, cuando el usuario todavia no la eligio a mano. */
function ajustarMoneda() {
  const lectura = detectarMoneda(entradas.alquiler_mensual, entradas.precio);
  if (lectura === "uyu_sobre_usd") entradas.moneda_alquiler = "UYU";
  if (lectura === "misma") entradas.moneda_alquiler = "USD";
}

function filaCotizacion(estado, cotizacion) {
  const fila = document.createElement("div");
  fila.className = "campo-fila";
  fila.innerHTML = html`
    <label for="r-cambio">Dólar
      <span class="apunte">${escapar(cotizacion.origen)}${cotizacion.fecha ? ` · ${escapar(cotizacion.fecha)}` : ""}</span>
    </label>
    <input class="campo" id="r-cambio" type="number" inputmode="decimal" step="any"
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
    editarAjustes(estado, { tipo_cambio: { usd_uyu: fresca.usd_uyu, fecha: fresca.fecha } });
    estado.redibujar();
  });
  return fila;
}

function desglose(r) {
  if (!r.renta_bruta_anual) return document.createDocumentFragment();
  const fila = (nombre, monto) => html`
    <div class="dato">
      <span class="dato-nombre">${nombre}</span>
      <span class="dato-valor">${monto ? `− ${plata(monto)}` : "—"}</span>
    </div>`;
  return nodo(html`
    <section class="tarjeta">
      <div class="tarjeta-titulo">
        <h2 class="titulo" style="font-size:17px">Qué se lleva la renta</h2>
        <span class="apunte">${plata(r.perdida_por_costos)} al año</span>
      </div>
      <div class="datos">
        <div class="dato"><span class="dato-nombre">Alquiler cobrado en el año</span><span class="dato-valor">${plata(r.renta_bruta_anual)}</span></div>
        ${fila("Impuestos", r.impuesto)}
        ${fila("Comisión de alquiler prorrateada", r.costo_comision)}
        ${fila("Refacción y mantenimiento", r.costo_refaccion)}
        ${fila("Contribución y Primaria", r.costos_fijos)}
        ${fila("Administración", r.costo_admin)}
        <div class="dato"><span class="dato-nombre"><strong>Queda limpio</strong></span><span class="dato-valor">${plata(r.renta_neta_anual)}</span></div>
      </div>
      <p class="apunte" style="margin-top:12px">
        Los dos que el Excel no contaba: los gastos de compra (el capital no es el precio,
        es un 7% más) y la comisión que se vuelve a pagar cada vez que cambia el inquilino.
      </p>
    </section>
  `);
}

function finos(estado) {
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
  const agregar = (clave, etiqueta, sufijo, paso) => {
    const fila = document.createElement("div");
    fila.className = "campo-fila";
    fila.innerHTML = html`
      <label for="f-${clave}">${etiqueta}${sufijo ? ` <span class="apunte">${sufijo}</span>` : ""}</label>
      <input class="campo" id="f-${clave}" type="number" inputmode="decimal"
             step="${paso || "any"}" value="${entradas[clave] ?? ""}"
             placeholder="${DEFAULTS[clave] ?? ""}">
    `;
    fila.querySelector(".campo").addEventListener("change", (evento) => {
      entradas[clave] = evento.target.value === "" ? null : Number(evento.target.value);
      estado.redibujar();
    });
    contenedor.append(fila);
  };

  agregar("gastos_compra_pct", "Gastos de compra (ITP y escritura)", "0,07 = 7%", "0.005");
  agregar("comision_meses", "Comisión de alquiler", "meses");
  agregar("refaccion_meses", "Refacción por año", "meses de alquiler");
  agregar("refaccion_anual", "…o un monto fijo por año", "USD, manda sobre el de arriba");
  agregar("contribucion_anual", "Contribución inmobiliaria", "USD por año");
  agregar("primaria_anual", "Impuesto de Primaria", "USD por año");
  agregar("admin_pct", "Administración", "0,05 = 5%", "0.01");

  return seccion;
}

function inverso(e, estado) {
  const alquiler = alquilerNecesario(e, objetivoPct);
  const precio = precioMaximo(e, objetivoPct);
  const seccion = nodo(html`
    <section class="tarjeta">
      <div class="tarjeta-titulo">
        <h2 class="titulo" style="font-size:17px">Para que dé lo que querés</h2>
        <span class="apunte">objetivo de renta real</span>
      </div>
      <div class="botonera" style="margin-top:0" id="objetivos"></div>
      <div class="datos" style="margin-top:14px">
        <div class="dato">
          <span class="dato-nombre">Alquiler que necesitás${e.precio ? "" : " (cargá el precio)"}</span>
          <span class="dato-valor">${alquiler ? plataUSD(alquiler) : "—"}</span>
        </div>
        <div class="dato">
          <span class="dato-nombre">Precio máximo a pagar${e.alquiler_mensual ? "" : " (cargá el alquiler)"}</span>
          <span class="dato-valor">${precio ? plataUSD(precio) : "—"}</span>
        </div>
      </div>
    </section>
  `);

  const botonera = seccion.getElementById("objetivos");
  for (const valor of [0.05, 0.06, 0.07, 0.08, 0.1]) {
    const boton = document.createElement("button");
    boton.className = `filtro ${Math.abs(objetivoPct - valor) < 1e-9 ? "prendido" : ""}`;
    boton.textContent = pct(valor);
    boton.addEventListener("click", () => {
      objetivoPct = valor;
      estado.redibujar();
    });
    botonera.append(boton);
  }
  return seccion;
}

function guardados(estado, r) {
  const lista = estado.datos.calculos_renta || [];
  const sePuedeGuardar = Boolean(entradas.precio && entradas.alquiler_mensual && !r.falta_cotizacion);

  const seccion = nodo(html`
    <section class="tarjeta">
      <h2 class="titulo" style="font-size:17px;margin-bottom:10px">Guardar este cálculo</h2>
      <input class="campo" id="cliente" type="text" placeholder="Nombre del cliente"
             value="${escapar(entradas.nombre_cliente)}">
      <div class="botonera">
        <button class="boton boton-primario" id="guardar-calculo" ${sePuedeGuardar ? "" : "disabled"}>Guardar</button>
        <button class="boton" id="compartir-calculo" ${sePuedeGuardar ? "" : "disabled"}>Mandar por WhatsApp</button>
      </div>
      <div class="lista" style="margin-top:14px" id="lista-calculos"></div>
    </section>
  `);

  seccion.getElementById("cliente").addEventListener("input", (evento) => {
    entradas.nombre_cliente = evento.target.value;
  });

  seccion.getElementById("guardar-calculo").addEventListener("click", () => {
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
    estado.redibujar();
  });

  seccion.getElementById("compartir-calculo").addEventListener("click", () => {
    const texto = textoParaCliente(entradas, r);
    if (navigator.share) {
      navigator.share({ title: "Cálculo de renta", text: texto }).catch(() => {});
    } else {
      window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, "_blank", "noopener");
    }
  });

  const contenedor = seccion.getElementById("lista-calculos");
  if (!lista.length) {
    contenedor.replaceWith(nodo(html`<p class="apunte">Todavía no guardaste ninguno.</p>`));
    return seccion;
  }
  lista.forEach((c, indice) => {
    const fila = nodo(html`
      <button class="fila" data-abrir="${indice}">
        <span class="fila-cuerpo">
          <span class="fila-titulo">${escapar(c.nombre_cliente)}</span>
          <span class="fila-sub">${escapar(c.fecha)} · ${plata(c.entradas.precio)} · alquiler ${plata(c.entradas.alquiler_mensual)}</span>
        </span>
        <span class="fila-derecha">
          <span class="cifra cifra-media">${pct(c.resultados.renta_real_pct)}</span>
          <span class="chip-apagado" data-borrar="${indice}">borrar</span>
        </span>
      </button>
    `);
    fila.querySelector("[data-abrir]").addEventListener("click", (evento) => {
      if (evento.target.dataset.borrar !== undefined) {
        borrarCalculo(estado, Number(evento.target.dataset.borrar));
      } else {
        Object.assign(entradas, c.entradas);
      }
      estado.redibujar();
    });
    contenedor.append(fila);
  });

  return seccion;
}

export function textoParaCliente(e, r) {
  const lineas = [
    e.titulo ? `*${e.titulo}*` : "*Cálculo de renta*",
    `Precio: USD ${plata(e.precio)}`,
    `Alquiler: ${e.moneda_alquiler === "UYU" ? "$" : "USD"} ${plata(e.alquiler_mensual)} por mes`,
    "",
    `Renta bruta: ${pct(r.renta_bruta_pct)}`,
    `*Renta real: ${pct(r.renta_real_pct)}*`,
    `Al bolsillo: USD ${plata(r.bolsillo_por_mes)} por mes`,
    `Se paga sola en ${r.anios_para_recuperar ? `${r.anios_para_recuperar.toFixed(1).replace(".", ",")} años` : "—"}`,
    "",
    `La renta real descuenta impuestos (${pct(e.irpf_pct)}), comisión, refacción y los`,
    `gastos de compra (${pct(e.gastos_compra_pct)}), y cuenta ${e.meses_alquilados} meses alquilados por año.`,
    "",
    "Juan Andrés Otero · RE/MAX Único",
  ];
  return lineas.join("\n");
}
