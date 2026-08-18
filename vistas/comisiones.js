/* La calculadora de comisiones: la que se usa con el cliente adelante para negociar.

   Primero el precio y cuántas puntas tenés — de eso depende cuántos campos aparecen.
   Después, por cada punta, el porcentaje y el descuento que estás dispuesto a hacer.

   Todo POR PUNTA porque cada lado es un trato distinto: al comprador le podés hacer un
   descuento y al vendedor no.

   Y abajo, plegada, la cuenta al revés: "pago 100.000 con tu comisión adentro". */

import {
  calcular, conComisionAdentro, repartir, LADOS, DESCUENTOS,
} from "../lib/comisiones.js";
import { plata, plataUSD, pct, escapar, numeroDesde, formatearMientrasEscribe } from "../lib/formato.js";

const html = (c, ...v) => c.reduce((t, x, i) => t + x + (v[i] ?? ""), "");

function nodo(marca) {
  const molde = document.createElement("template");
  molde.innerHTML = marca.trim();
  return molde.content;
}

/* Vive entre redibujados: si se perdiera al tocar un campo, la pantalla es inusable. */
const entradas = {
  precio: null,
  cantidad: 2,
  puntas: [
    { lado: "vendedora", pct: 0.03, descuentoTipo: "nada", descuentoValor: null },
    { lado: "compradora", pct: 0.03, descuentoTipo: "nada", descuentoValor: null },
  ],
  // La cuenta al revés, aparte.
  adentroTotal: null,
  adentroPct: 0.03,
};
let adentroAbierto = false;

const decimal = (n, cifras = 2) => (n || 0).toFixed(cifras).replace(".", ",");

const splitVigente = (ajustes) => {
  const vigente = ((ajustes || {}).categorias || []).find((c) => c.hasta === null) || {};
  return vigente.split_pct || 0;
};

export function dibujarComisiones(estado) {
  const split = splitVigente(estado.datos.ajustes);
  const activas = entradas.puntas.slice(0, entradas.cantidad);
  const r = calcular({ precio: entradas.precio, split, puntas: activas });

  const trozo = document.createDocumentFragment();
  trozo.append(cabecera(estado, r, split));
  trozo.append(basicos(estado));
  for (const [i] of activas.entries()) trozo.append(campoPunta(i, estado));
  if (entradas.cantidad === 2) trozo.append(repartirDiferencia(estado));
  if (r.neto) trozo.append(detalle(r, split));
  trozo.append(comisionAdentro(estado));
  return trozo;
}

/* ---------- El número grande ---------- */

function cabecera(estado, r, split) {
  const hayDescuento = r.descuento > 0;
  const seccion = nodo(html`
    <section class="tarjeta">
      <button class="volver" id="volver">‹ Herramientas</button>
      <p class="etiqueta" style="margin-top:10px">Calculadora</p>
      <h1 class="titulo" style="font-size:25px;margin:4px 0 0">Comisiones</h1>
      ${entradas.precio
        ? html`
          <div class="dos-rentas" style="margin-top:14px">
            <div class="renta-caja principal">
              <p class="renta-nombre">Te queda</p>
              <p class="cifra cifra-heroe renta-cifra" style="color:var(--azul)">${plata(r.neto)}</p>
              <p class="renta-pie">${pct(r.pct_efectivo, 2)} del precio</p>
            </div>
            <div class="renta-caja">
              <p class="renta-nombre">A tu bolsillo</p>
              <p class="cifra renta-cifra chica">${plata(r.bolsillo)}</p>
              <p class="renta-pie">con tu ${Math.round(split * 100)}%</p>
            </div>
          </div>
          ${hayDescuento
            ? html`<p class="apunte" style="margin-top:12px">
                 Sin el descuento serían <strong>${plataUSD(r.bruto)}</strong> (${pct(r.pct_bruto, 2)}).
                 Resignás ${plataUSD(r.descuento)}, que de tu bolsillo son
                 <strong>${plataUSD(r.costo_del_descuento)}</strong>.</p>`
            : ""}`
        : html`<p class="apunte" style="margin-top:12px">
             Cargá el precio y elegí si tenés una punta o las dos.</p>`}
    </section>
  `);
  seccion.getElementById("volver").addEventListener("click", () => estado.irA("herramientas"));
  return seccion;
}

/* ---------- Los campos ---------- */

function campoMonto(id, etiqueta, sufijo, valor, alCambiar, placeholder = "0") {
  const fila = document.createElement("div");
  fila.className = "campo-fila";
  fila.innerHTML = html`
    <label for="${id}">${etiqueta}${sufijo ? ` <span class="apunte">${sufijo}</span>` : ""}</label>
    <input class="campo" id="${id}" type="text" inputmode="decimal"
           value="${valor === null || valor === undefined ? "" : plata(valor)}"
           placeholder="${escapar(placeholder)}">
  `;
  const control = fila.querySelector(".campo");
  formatearMientrasEscribe(control);
  control.addEventListener("change", () => alCambiar(numeroDesde(control.value)));
  return fila;
}

/* Un <input type="number"> solo acepta el PUNTO como separador decimal, sin importar el
   idioma. Poniendole "3,00" — que es como se escribe acá — el campo se ve VACIO, aunque la
   cuenta de abajo use el 3%. Se veia como que no habia comision cargada. Por eso el valor
   entra crudo y sin coma, y los decimales de mas se recortan. */
function campoPct(id, etiqueta, valor, alCambiar) {
  const fila = document.createElement("div");
  fila.className = "campo-fila";
  const enPantalla = valor === null || valor === undefined
    ? ""
    : String(Number((valor * 100).toFixed(2)));
  fila.innerHTML = html`
    <label for="${id}">${etiqueta} <span class="apunte">en %</span></label>
    <input class="campo" id="${id}" type="number" inputmode="decimal" step="0.1" min="0"
           value="${enPantalla}">
  `;
  fila.querySelector(".campo").addEventListener("change", (e) => {
    alCambiar(e.target.value === "" ? null : Number(e.target.value) / 100);
  });
  return fila;
}

function basicos(estado) {
  const seccion = nodo(html`
    <section class="tarjeta" style="padding:0;overflow:hidden">
      <div id="campos"></div>
    </section>
  `);
  const contenedor = seccion.getElementById("campos");

  contenedor.append(campoMonto("c-precio", "Precio de la propiedad", "USD", entradas.precio,
    (v) => { entradas.precio = v; estado.redibujar(); }));

  const puntas = document.createElement("div");
  puntas.className = "campo-fila";
  puntas.innerHTML = html`
    <label>¿Cuántas puntas tenés?</label>
    <div class="botonera" style="margin-top:4px">
      <button class="filtro ${entradas.cantidad === 1 ? "prendido" : ""}" data-cantidad="1">Una punta</button>
      <button class="filtro ${entradas.cantidad === 2 ? "prendido" : ""}" data-cantidad="2">Las dos</button>
    </div>
  `;
  for (const boton of puntas.querySelectorAll("[data-cantidad]")) {
    boton.addEventListener("click", () => {
      entradas.cantidad = Number(boton.dataset.cantidad);
      estado.redibujar();
    });
  }
  contenedor.append(puntas);
  return seccion;
}

/* Una punta: su lado, su porcentaje y el descuento que le hacés a ESE cliente. */
function campoPunta(indice, estado) {
  const p = entradas.puntas[indice];
  const unaSola = entradas.cantidad === 1;
  const seccion = nodo(html`
    <section class="tarjeta" style="padding:0;overflow:hidden">
      <div class="campo-fila" style="background:var(--lienzo-2)">
        <label style="font-weight:700;color:var(--tinta)">
          ${unaSola ? "Tu punta" : `Punta ${escapar(p.lado)}`}
          <span class="apunte">— ${escapar((LADOS.find((l) => l.clave === p.lado) || {}).quien || "")}</span>
        </label>
      </div>
      <div id="punta-${indice}"></div>
    </section>
  `);
  const contenedor = seccion.getElementById(`punta-${indice}`);

  if (unaSola) {
    const lado = document.createElement("div");
    lado.className = "campo-fila";
    lado.innerHTML = html`
      <label>¿De qué lado estás?</label>
      <div class="botonera" style="margin-top:4px">
        ${LADOS.map((l) => `<button class="filtro ${p.lado === l.clave ? "prendido" : ""}" data-lado="${l.clave}">${l.nombre}</button>`).join("")}
      </div>
    `;
    for (const boton of lado.querySelectorAll("[data-lado]")) {
      boton.addEventListener("click", () => {
        p.lado = boton.dataset.lado;
        estado.redibujar();
      });
    }
    contenedor.append(lado);
  }

  contenedor.append(campoPct(`c-pct-${indice}`, "Comisión", p.pct,
    (v) => { p.pct = v; estado.redibujar(); }));

  const tipo = document.createElement("div");
  tipo.className = "campo-fila";
  tipo.innerHTML = html`
    <label>¿Le hacés un descuento?</label>
    <div class="botonera" style="margin-top:4px">
      ${DESCUENTOS.map((d) => `<button class="filtro ${p.descuentoTipo === d.clave ? "prendido" : ""}" data-desc="${d.clave}">${d.nombre}</button>`).join("")}
    </div>
  `;
  for (const boton of tipo.querySelectorAll("[data-desc]")) {
    boton.addEventListener("click", () => {
      p.descuentoTipo = boton.dataset.desc;
      estado.redibujar();
    });
  }
  contenedor.append(tipo);

  if (p.descuentoTipo === "pct") {
    contenedor.append(campoPct(`c-desc-${indice}`, "Cuánto le descontás", p.descuentoValor,
      (v) => { p.descuentoValor = v; estado.redibujar(); }));
  }
  if (p.descuentoTipo === "monto") {
    contenedor.append(campoMonto(`c-desc-${indice}`, "Cuánto le descontás", "USD",
      p.descuentoValor, (v) => { p.descuentoValor = v; estado.redibujar(); }));
  }
  return seccion;
}

/* Poner plata de tu comisión para juntar dos precios que no se tocan. Reparte el monto
   entre las dos puntas y lo deja cargado como descuento, para poder retocarlo después. */
function repartirDiferencia(estado) {
  const seccion = nodo(html`
    <section class="tarjeta">
      <h2 class="titulo" style="font-size:17px;margin-bottom:4px">Poner plata para cerrar</h2>
      <p class="apunte" style="margin-bottom:12px">
        Si el comprador no llega y ponés vos la diferencia, cargá cuánto y se reparte entre
        las puntas. Después podés retocar cada una arriba.
      </p>
      <div id="campo-dif"></div>
      <div class="botonera" style="margin-top:8px">
        <button class="filtro" data-reparto="parejo">Mitad y mitad</button>
        <button class="filtro" data-reparto="vendedora">Toda de la vendedora</button>
        <button class="filtro" data-reparto="compradora">Toda de la compradora</button>
      </div>
    </section>
  `);

  let monto = null;
  seccion.getElementById("campo-dif").append(
    campoMonto("c-diferencia", "Cuánto ponés", "USD", monto, (v) => { monto = v; })
  );

  for (const boton of seccion.querySelectorAll("[data-reparto]")) {
    boton.addEventListener("click", () => {
      const campo = document.getElementById("c-diferencia");
      const valor = monto ?? numeroDesde(campo ? campo.value : "");
      if (!valor) return;
      const [a, b] = repartir(valor, 2, boton.dataset.reparto);
      entradas.puntas[0].descuentoTipo = "monto";
      entradas.puntas[0].descuentoValor = a;
      entradas.puntas[1].descuentoTipo = "monto";
      entradas.puntas[1].descuentoValor = b;
      estado.redibujar();
    });
  }
  return seccion;
}

/* ---------- El detalle, punta por punta ---------- */

function detalle(r, split) {
  const fila = (p) => html`
    <div class="reparto-fila">
      <div class="reparto-cabeza">
        <span class="reparto-nombre">Punta ${escapar(p.lado)}</span>
        <span class="reparto-valor">${plata(p.neto)}</span>
      </div>
      <div class="reparto-pista">
        <div class="reparto-relleno" style="width:${p.bruto ? (p.neto / p.bruto) * 100 : 0}%"></div>
      </div>
      <span class="reparto-pie">
        ${p.descuento
          ? html`${plata(p.bruto)} − ${plata(p.descuento)} de descuento ·
             le cobrás <strong>${pct(p.pct_efectivo, 2)}</strong> en vez de ${pct(p.pct, 2)}`
          : html`<strong>${pct(p.pct, 2)}</strong> del precio`}
      </span>
    </div>`;

  return nodo(html`
    <section class="tarjeta">
      <div class="tarjeta-titulo">
        <h2 class="titulo" style="font-size:17px">Punta por punta</h2>
        <span class="apunte">sobre ${plataUSD(r.precio)}</span>
      </div>
      ${r.puntas.map(fila).join("")}
      <div class="datos" style="margin-top:14px">
        <div class="dato"><span class="dato-nombre">Factura RE/MAX</span><span class="dato-valor">${plata(r.neto)}</span></div>
        <div class="dato"><span class="dato-nombre">A tu bolsillo</span><span class="dato-valor">${plata(r.bolsillo)}</span></div>
        <div class="dato">
          <span class="dato-nombre">${r.puntas.length > 1 ? "Entre los dos lados pagan" : "Le sale al cliente"}</span>
          <span class="dato-valor">${pct(r.pct_efectivo, 2)} del precio</span>
        </div>
      </div>
    </section>
  `);
}

/* ---------- La cuenta al revés ---------- */

/* "Pago 100.000 y ahí adentro va tu comisión."

   Se despeja dividiendo, no restando: si la oferta es X y la comisión es el 3% de X,
   entonces X = 100.000 / 1,03. Sacarle el 3% a los 100.000 da otro número, y ese número
   sería el 3,09% de lo que se escritura. */
function comisionAdentro(estado) {
  const r = conComisionAdentro(entradas.adentroTotal, entradas.adentroPct);
  const seccion = nodo(html`
    <details class="grupo" ${adentroAbierto ? "open" : ""}>
      <summary class="grupo-cabeza">
        <span class="grupo-nombre">"Pago tanto, con tu comisión adentro"</span>
        <span class="grupo-flecha" aria-hidden="true">›</span>
      </summary>
      <div class="tarjeta" style="margin-top:6px">
        <p class="apunte" style="margin-bottom:12px">
          Cuánto queda de oferta para el vendedor y cuánto de comisión para vos, cuando el
          comprador pone un número con todo incluido.
        </p>
        <div id="campos-adentro"></div>
        ${entradas.adentroTotal
          ? html`
            <div class="datos" style="margin-top:14px">
              <div class="dato"><span class="dato-nombre">Oferta al vendedor</span><span class="dato-valor">${plata(r.oferta)}</span></div>
              <div class="dato"><span class="dato-nombre">Tu comisión</span><span class="dato-valor">${plata(r.comision)}</span></div>
              <div class="dato"><span class="dato-nombre"><strong>Pone el comprador</strong></span><span class="dato-valor">${plata(r.total)}</span></div>
            </div>
            <p class="apunte" style="margin-top:12px">
              La cuenta se despeja dividiendo por ${decimal(1 + r.pct, 2)}, no restándole el
              ${pct(r.pct)} al total. Restando daría ${plata(r.comision_ingenua)} de comisión,
              que sobre los ${plata(r.oferta_ingenua)} que se escrituran es
              ${pct(r.comision_ingenua / (r.oferta_ingenua || 1))} y no ${pct(r.pct)}.
            </p>`
          : ""}
      </div>
    </details>
  `);
  seccion.querySelector("details").addEventListener("toggle", (e) => {
    adentroAbierto = e.target.open;
  });

  const contenedor = seccion.getElementById("campos-adentro");
  contenedor.append(campoMonto("c-adentro", "Cuánto pone el comprador", "USD, todo incluido",
    entradas.adentroTotal, (v) => { entradas.adentroTotal = v; estado.redibujar(); }));
  contenedor.append(campoPct("c-adentro-pct", "Tu comisión", entradas.adentroPct,
    (v) => { entradas.adentroPct = v; estado.redibujar(); }));
  return seccion;
}
