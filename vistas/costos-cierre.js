/* Cuánto cuesta cerrar: qué pone el comprador y qué le queda al vendedor.

   La pregunta que hace todo cliente y que hasta ahora se contestaba a mano.

   Dos números arriba y nada más. Abajo, la cuenta abierta renglón por renglón —de dónde
   sale cada peso— para poder rehacerla adelante del cliente. Los porcentajes viven
   plegados: se ponen una vez y casi no se tocan.

   Y las dos cosas que NO se pueden calcular se dicen, no se esconden: los honorarios del
   escribano del vendedor y los gastos sueltos de la escritura. */

import {
  calcularCierre, textoParaElVendedor, textoParaElComprador,
  FORMAS_DE_IRPF, POR_DEFECTO,
} from "../lib/costos-cierre.js";
import { traerCotizacion, cotizacionVigente, estaVencida, comoSeDice } from "../lib/cambio.js";
import { editarAjustes } from "../lib/guardado.js";
import { copiarAlToque } from "../lib/compartir.js";
import {
  plata, plataUSD, escapar, numeroDesde, formatearMientrasEscribe,
} from "../lib/formato.js";

const html = (c, ...v) => c.reduce((t, x, i) => t + x + (v[i] ?? ""), "");

function nodo(marca) {
  const molde = document.createElement("template");
  molde.innerHTML = marca.trim();
  return molde.content;
}

/* Vive entre redibujados: si se perdiera al tocar un campo, la pantalla es inusable. */
const entradas = {
  titulo: "",
  precio: null,
  catastral: null,
  compra: null,
  irpf: "ganancia",
  dolar: null,
  /* Un solo tipo para las dos puntas, y un valor por cada una: a veces se cobra una sola. */
  comision: { tipo: "pct", vendedor: POR_DEFECTO.comision, comprador: POR_DEFECTO.comision },
};
const tasas = { ...POR_DEFECTO };
let finosAbiertos = false;

let cotizacionFresca = null;
let buscandoCotizacion = false;

const pesos = (n) => `$ ${plata(n)}`;
const enPct = (f) => `${String(Number((f * 100).toFixed(2))).replace(".", ",")}%`;

/* El dólar se busca solo, una vez por día, al abrir. Igual que en la calculadora de renta:
   con un cliente adelante nadie se acuerda de apretar "buscar la cotización". */
async function refrescarCotizacion(estado) {
  if (buscandoCotizacion || !estaVencida(estado.datos.ajustes, estado.hoy)) return;
  buscandoCotizacion = true;
  const fresca = await traerCotizacion();
  buscandoCotizacion = false;
  if (!fresca) return;
  cotizacionFresca = fresca;
  entradas.dolar = fresca.usd_uyu;
  editarAjustes(estado, {
    tipo_cambio: { usd_uyu: fresca.usd_uyu, fecha: fresca.fecha, buscada_el: estado.hoy },
  });
  estado.redibujar();
}

export function dibujarCostosCierre(estado) {
  const cotizacion = cotizacionVigente(estado.datos.ajustes, cotizacionFresca);
  if (entradas.dolar === null) entradas.dolar = cotizacion.valor;
  refrescarCotizacion(estado);

  const r = calcularCierre(entradas, tasas);

  /* El orden es el del trabajo: primero lo que siempre se carga, después de dónde sale el
     IRPF, después los porcentajes (plegados) y AL FINAL la cuenta, que es el resultado.
     Igual que en renta: los ajustes son las entradas y el detalle es lo que sale de ellas. */
  const trozo = document.createDocumentFragment();
  trozo.append(cabecera(r));
  trozo.append(basicos(estado));
  trozo.append(deDondeSaleElIrpf(estado, r));
  trozo.append(laComision(estado));
  trozo.append(finos(estado, cotizacion));
  if (r.hayDatos) trozo.append(laCuenta(r));
  if (r.hayDatos) trozo.append(paraElCliente(estado, r, cotizacion));
  return trozo;
}

/* ---------- Los dos números ---------- */

/* Las dos cifras van en `cifra-grande` y no en el tamaño héroe de las otras calculadoras.

   Acá el número es el PRECIO DE UNA PROPIEDAD, no una comisión: seis o siete dígitos con
   sus puntos. A 54px eso se sale de la caja —"142.866" se comía el borde— y una casa de un
   millón lo rompía del todo. Las dos se distinguen igual por el color y el fondo. */
function cabecera(r) {
  const sePuede = r.hayDatos && !r.faltaDolar;
  return nodo(html`
    <section style="margin-bottom:16px">
      <h1 class="titulo" style="font-size:26px">Cuánto cuesta cerrar</h1>
      ${sePuede
        ? html`
          <div class="dos-rentas" style="margin-top:14px">
            <div class="renta-caja principal">
              <p class="renta-nombre">Le queda al vendedor</p>
              <p class="cifra cifra-grande renta-cifra" style="color:var(--azul)">${plata(r.vendedor.queda)}</p>
              <p class="renta-pie">de ${plataUSD(r.precio)}</p>
            </div>
            <div class="renta-caja">
              <p class="renta-nombre">El comprador pone</p>
              <p class="cifra cifra-grande renta-cifra">${plata(r.comprador.pone)}</p>
              <p class="renta-pie">${plataUSD(r.comprador.total)} de gastos</p>
            </div>
          </div>`
        : ""}
      ${r.hayDatos && r.faltaDolar
        ? html`<p class="apunte" style="margin-top:12px">
             El ITP y la cédula se pagan en pesos y todavía no hay cotización del dólar.
             Se está buscando; también podés escribirla abajo, en Ajustes finos.</p>`
        : ""}
    </section>
  `);
}

/* ---------- Lo que siempre se carga ---------- */

function campoMonto(clave, etiqueta, sufijo, valor, alCambiar) {
  const fila = document.createElement("div");
  fila.className = "campo-fila";
  fila.innerHTML = html`
    <label for="c-${clave}">${escapar(etiqueta)}
      ${sufijo ? html`<span class="apunte">${escapar(sufijo)}</span>` : ""}</label>
    <input class="campo" id="c-${clave}" type="text" inputmode="decimal"
           value="${valor === null || valor === undefined ? "" : plata(valor)}" placeholder="0">
  `;
  const control = fila.querySelector(".campo");
  formatearMientrasEscribe(control);
  control.addEventListener("change", () => alCambiar(numeroDesde(control.value)));
  return fila;
}

/* El valor catastral es OTRO número que el precio, y mucho más bajo. De ahí sale el ITP, y
   confundirlo con el precio de venta es el error que hace que la cuenta dé cualquier cosa:
   por eso la pista lo dice al lado del campo. */
function basicos(estado) {
  const seccion = nodo('<section class="tarjeta" style="padding:0;overflow:hidden"></section>');
  const caja = seccion.querySelector("section");
  const poner = (clave) => (valor) => { entradas[clave] = valor; estado.redibujar(); };

  caja.append(campoMonto("precio", "Precio de la operación", "en USD",
    entradas.precio, poner("precio")));
  caja.append(campoMonto("catastral", "Valor catastral", "en pesos · de ahí sale el ITP",
    entradas.catastral, poner("catastral")));
  return seccion;
}

/* ---------- El IRPF, que tiene dos caminos ---------- */

/* Son dos regímenes distintos y el vendedor entra en uno: se elige, no se suman. El precio
   de compra sólo aparece cuando hace falta —en el ficto no se mira— y mientras falte se
   avisa en vez de mostrar un número que estaría casi tres veces más caro.

   La pista va SÓLO en el ficto, donde explica por qué no aparece ningún campo. En el otro
   camino el campo está ahí abajo diciendo lo mismo, y el renglón sobraba. */
function deDondeSaleElIrpf(estado, r) {
  const seccion = nodo(html`
    <section class="tarjeta">
      <div class="tarjeta-titulo" style="margin-bottom:10px">
        <h2 class="titulo" style="font-size:17px">IRPF del vendedor</h2>
        <span class="apunte">se elige uno</span>
      </div>
      <div class="botonera">
        ${FORMAS_DE_IRPF.map((f) => html`
          <button class="filtro ${entradas.irpf === f.clave ? "prendido" : ""}"
                  data-irpf="${escapar(f.clave)}">${escapar(f.nombre)}</button>`).join("")}
      </div>
      ${r.forma === "ficto"
        ? html`<p class="apunte" style="margin-top:8px">${escapar(
             (FORMAS_DE_IRPF.find((f) => f.clave === "ficto") || {}).pista || "")}</p>`
        : ""}
      <div id="c-caja-compra"></div>
    </section>
  `);

  for (const boton of seccion.querySelectorAll("[data-irpf]")) {
    boton.addEventListener("click", () => {
      entradas.irpf = boton.dataset.irpf;
      estado.redibujar();
    });
  }

  if (r.forma === "ganancia") {
    const caja = seccion.getElementById("c-caja-compra");
    caja.append(campoMonto("compra", "A cuánto la compró", "en USD",
      entradas.compra, (v) => { entradas.compra = v; estado.redibujar(); }));
    if (r.irpf.falta && r.precio > 0) {
      caja.append(nodo(html`
        <p class="apunte" style="margin-top:4px;color:var(--rojo-tinta)">
          Sin esto no se puede sacar la ganancia. Si no lo sabés, andá por el 1,8%.</p>`));
    }
  }
  return seccion;
}

/* ---------- La comisión ---------- */

const LADOS = [
  { clave: "vendedor", etiqueta: "Al vendedor" },
  { clave: "comprador", etiqueta: "Al comprador" },
];

/* La comisión va ADENTRO de la cuenta: es el gasto más grande de los dos lados, y dejarlo
   afuera hacía que el "te queda" pareciera final cuando no lo era.

   UN SOLO tipo para las dos puntas —o las dos en porcentaje, o las dos en monto— porque
   mezclarlas es un caso que no pasa y agregaba un control más a la pantalla. Cada punta sí
   lleva su propio valor: a veces se cobra una sola, y ahí la otra va en cero.

   Al cambiar de tipo el valor se CONVIERTE, no se borra: pasar de "3%" a monto fijo tiene
   que dejar los 4.500 puestos, no un campo vacío que hay que volver a llenar. */
function laComision(estado) {
  const com = entradas.comision;
  const enMonto = com.tipo === "monto";

  const seccion = nodo(html`
    <section class="tarjeta">
      <div class="tarjeta-titulo" style="margin-bottom:10px">
        <h2 class="titulo" style="font-size:17px">Comisión inmobiliaria</h2>
        <span class="apunte">a cada parte</span>
      </div>
      <div class="botonera">
        <button class="filtro ${enMonto ? "" : "prendido"}" data-comision="pct">%</button>
        <button class="filtro ${enMonto ? "prendido" : ""}" data-comision="monto">Monto fijo</button>
      </div>
      <div id="c-caja-comision"></div>
    </section>
  `);

  for (const boton of seccion.querySelectorAll("[data-comision]")) {
    boton.addEventListener("click", () => {
      const nuevo = boton.dataset.comision;
      if (nuevo === com.tipo) return;
      const precio = entradas.precio || 0;
      for (const lado of LADOS) {
        const valor = com[lado.clave] || 0;
        if (nuevo === "monto") com[lado.clave] = precio * valor;
        else com[lado.clave] = precio ? valor / precio : POR_DEFECTO.comision;
      }
      com.tipo = nuevo;
      estado.redibujar();
    });
  }

  const caja = seccion.getElementById("c-caja-comision");
  for (const lado of LADOS) {
    const guardar = (v) => { com[lado.clave] = v === null ? 0 : v; estado.redibujar(); };
    caja.append(enMonto
      ? campoMonto(`comision-${lado.clave}`, lado.etiqueta, "en USD",
        com[lado.clave], guardar)
      : campoNumero(`comision-${lado.clave}`, lado.etiqueta, "% del precio",
        Number(((com[lado.clave] || 0) * 100).toFixed(3)),
        (v) => guardar(v === null ? null : v / 100), "0.1"));
  }
  return seccion;
}

/* ---------- Los porcentajes, plegados ---------- */

function campoNumero(clave, etiqueta, sufijo, valor, alCambiar, paso = "any") {
  const fila = document.createElement("div");
  fila.className = "campo-fila";
  fila.innerHTML = html`
    <label for="c-${clave}">${escapar(etiqueta)}
      ${sufijo ? html`<span class="apunte">${escapar(sufijo)}</span>` : ""}</label>
    <input class="campo" id="c-${clave}" type="number" inputmode="decimal"
           step="${paso}" min="0" value="${valor ?? ""}" placeholder="0">
  `;
  fila.querySelector(".campo").addEventListener("change", (evento) => {
    alCambiar(evento.target.value === "" ? null : Number(evento.target.value));
  });
  return fila;
}

function finos(estado, cotizacion) {
  const seccion = nodo(html`
    <details class="grupo" ${finosAbiertos ? "open" : ""}>
      <summary class="grupo-cabeza">
        <span class="grupo-nombre">Ajustes finos</span>
        <span class="apunte grupo-resumen">ITP ${enPct(tasas.itp)} · escribano ${enPct(tasas.escribano)}</span>
        <span class="grupo-flecha" aria-hidden="true">›</span>
      </summary>
      <div class="tarjeta" style="padding:0;overflow:hidden;margin-top:6px" id="c-finos"></div>
    </details>
  `);
  seccion.querySelector("details").addEventListener("toggle", (e) => {
    finosAbiertos = e.target.open;
  });

  const caja = seccion.getElementById("c-finos");
  const poner = (clave, comoFraccion) => (valor) => {
    tasas[clave] = valor === null ? POR_DEFECTO[clave] : (comoFraccion ? valor / 100 : valor);
    estado.redibujar();
  };
  caja.append(campoNumero("itp", "ITP", "% del valor catastral, cada parte",
    tasas.itp * 100, poner("itp", true), "0.1"));
  caja.append(campoNumero("escribano", "Escribano del comprador", "% del precio",
    tasas.escribano * 100, poner("escribano", true), "0.1"));
  caja.append(campoNumero("cedula", "Cédula catastral", "en pesos",
    tasas.cedula, poner("cedula", false), "100"));

  const dolar = document.createElement("div");
  dolar.className = "campo-fila";
  dolar.innerHTML = html`
    <label for="c-dolar">Dólar
      <span class="apunte">${escapar(cotizacion.origen)}${
        cotizacion.fecha ? ` · ${escapar(cotizacion.fecha)}` : ""}</span></label>
    <input class="campo" id="c-dolar" type="number" inputmode="decimal" step="any" min="0"
           value="${entradas.dolar ?? ""}" placeholder="0">
  `;
  dolar.querySelector(".campo").addEventListener("change", (evento) => {
    entradas.dolar = evento.target.value === "" ? null : Number(evento.target.value);
    estado.redibujar();
  });
  caja.append(dolar);
  return seccion;
}

/* ---------- La cuenta, renglón por renglón ---------- */

/* Cada gasto se muestra en la moneda en que se paga, con el equivalente abajo. El cliente
   que va a firmar paga pesos por el ITP: decírselo sólo en dólares lo obliga a hacer la
   cuenta él. */
const renglon = (g) => html`
  <div class="dato">
    <span class="dato-nombre">${escapar(g.nombre)}
      ${g.falta
        ? html`<br><span class="apunte">falta a cuánto la compró</span>`
        : g.detalle ? html`<br><span class="apunte">${escapar(g.detalle)}</span>` : ""}</span>
    <span class="dato-valor">${g.falta ? "—" : (g.nace === "UYU" ? pesos(g.uyu) : plataUSD(g.usd))}
      ${!g.falta && g.nace === "UYU" && g.usd
        ? html`<br><span class="apunte">${plataUSD(g.usd)}</span>`
        : ""}</span>
  </div>`;

const cierre = (nombre, monto) => html`
  <div class="dato">
    <span class="dato-nombre"><strong>${escapar(nombre)}</strong></span>
    <span class="dato-valor"><strong>${plata(monto)}</strong></span>
  </div>`;

function laCuenta(r) {
  return nodo(html`
    <section class="tarjeta tarjeta-resumen">
      <h2 class="titulo" style="font-size:17px">El vendedor</h2>
      <div class="datos" style="margin-top:10px">
        ${r.vendedor.gastos.map(renglon).join("")}
        ${r.faltaDolar ? "" : cierre("Le queda", r.vendedor.queda)}
      </div>

      <h2 class="titulo" style="font-size:17px;margin-top:22px">El comprador</h2>
      <div class="datos" style="margin-top:10px">
        ${r.comprador.gastos.map(renglon).join("")}
        ${r.faltaDolar ? "" : cierre("Pone en total", r.comprador.pone)}
      </div>

      <p class="apunte" style="margin-top:16px">
        Los honorarios del <strong>escribano del vendedor</strong> se acuerdan con él, pero
        son menores a lo que cobra un escribano de la parte compradora.<br><br>
        Puede haber otros gastos de escritura —certificados, timbres, inscripción— que no se
        pueden calcular de antemano y que el escribano sí va a poder detallar.
      </p>
    </section>
  `);
}

/* ---------- Para el cliente ---------- */

/* A cada uno lo suyo: el vendedor no tiene por qué ver lo que pone el comprador. Y los dos
   mensajes llevan adentro los avisos de lo que no se puede calcular — que es justamente lo
   que hay que decir por escrito y no de palabra. */
function paraElCliente(estado, r, cotizacion) {
  const sePuede = r.precio > 0 && !r.faltaDolar;
  const seccion = nodo(html`
    <section class="tarjeta">
      <h2 class="titulo" style="font-size:17px;margin-bottom:10px">Para el cliente</h2>
      <input class="campo" id="c-titulo" type="text" placeholder="Dirección o nombre"
             value="${escapar(entradas.titulo)}">
      <div class="botonera" style="margin-top:10px">
        <button class="boton boton-chico" data-copiar="vendedor" ${sePuede ? "" : "disabled"}>
          Copiar lo del vendedor</button>
        <button class="boton boton-chico" data-copiar="comprador" ${sePuede ? "" : "disabled"}>
          Copiar lo del comprador</button>
      </div>
    </section>
  `);

  seccion.getElementById("c-titulo").addEventListener("input", (evento) => {
    entradas.titulo = evento.target.value;
  });

  const opciones = { titulo: entradas.titulo, dolar: comoSeDice(cotizacion) };
  const armar = (quien) => (quien === "vendedor"
    ? textoParaElVendedor(r, opciones)
    : textoParaElComprador(r, opciones));

  /* El botón mismo avisa que quedó copiado y vuelve solo: un renglón de texto abajo se
     pierde, porque uno mira el dedo. Y se copia SINCRÓNICAMENTE — esperar una promesa hace
     que el navegador pierda el gesto del usuario y adentro de WhatsApp el botón no hace
     nada. */
  for (const boton of seccion.querySelectorAll("[data-copiar]")) {
    boton.addEventListener("click", () => {
      const texto = armar(boton.dataset.copiar);
      if (!copiarAlToque(texto)) {
        window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, "_blank", "noopener");
        return;
      }
      const dice = boton.textContent;
      boton.textContent = "✓ Copiado";
      boton.classList.add("copiado");
      setTimeout(() => {
        boton.textContent = dice;
        boton.classList.remove("copiado");
      }, 1800);
    });
  }
  return seccion;
}
