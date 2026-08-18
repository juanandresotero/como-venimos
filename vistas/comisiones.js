/* La calculadora de comisiones: la que se usa con el cliente adelante para negociar.

   Primero el precio y cuántas puntas tenés — de eso depende cuántos campos aparecen.
   Después, por cada punta, el porcentaje y el descuento que estás dispuesto a hacer.

   Todo POR PUNTA porque cada lado es un trato distinto: al comprador le podés hacer un
   descuento y al vendedor no.

   Y abajo, plegada, la cuenta al revés: "pago 100.000 con tu comisión adentro". */

import {
  calcular, conComisionAdentro, repartir, facturar, repartoDeLaPunta, textoParaElCliente,
  LADOS, DESCUENTOS, IVA,
} from "../lib/comisiones.js";
import {
  plata, plataUSD, pct, pctFino, escapar, numeroDesde, formatearMientrasEscribe,
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
  cantidad: 2,
  puntas: [
    { lado: "vendedora", pct: 0.03, descuentoTipo: "nada", descuentoValor: null },
    { lado: "compradora", pct: 0.03, descuentoTipo: "nada", descuentoValor: null },
  ],
  // Como llego el negocio: de eso depende quien cobra cada pedazo de la comision.
  regimen: "captacion_mia",
  // Quien de los tres factura con IVA. Los tres marcados = 22% sobre toda la comision.
  conIva: ["yo"],
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

  const f = facturar(r, { regimen: entradas.regimen, split, conIva: entradas.conIva });

  const trozo = document.createDocumentFragment();
  trozo.append(cabecera(estado, r, f, split));
  trozo.append(basicos(estado));
  for (const [i] of activas.entries()) trozo.append(campoPunta(i, estado));
  trozo.append(repartirDiferencia(estado));
  trozo.append(quienCobra(estado, split));
  if (r.neto) trozo.append(detalle(r, split));
  if (r.neto) trozo.append(paraCadaCliente(f, estado));
  trozo.append(comisionAdentro(estado));
  return trozo;
}

/* ---------- El número grande ---------- */

function cabecera(estado, r, f, split) {
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
              <p class="renta-pie">${pctFino(r.pct_efectivo)} del precio</p>
            </div>
            <div class="renta-caja">
              <p class="renta-nombre">A tu bolsillo</p>
              <p class="cifra renta-cifra chica">${plata(r.bolsillo)}</p>
              <p class="renta-pie">con tu ${Math.round(split * 100)}%</p>
            </div>
          </div>
          ${f.iva
            ? html`<p class="apunte" style="margin-top:12px">
                 Con IVA, entre todos los clientes pagan <strong>${plataUSD(f.total)}</strong>
                 — son ${plataUSD(f.iva)} de IVA.</p>`
            : ""}
          ${hayDescuento
            ? html`<p class="apunte" style="margin-top:12px">
                 Sin el descuento serían <strong>${plataUSD(r.bruto)}</strong> (${pctFino(r.pct_bruto)}).
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

  const titulo = document.createElement("div");
  titulo.className = "campo-fila";
  titulo.innerHTML = html`
    <label for="c-titulo">Propiedad o cliente <span class="apunte">para el texto que le mandás</span></label>
    <input class="campo" id="c-titulo" type="text" value="${escapar(entradas.titulo)}"
           placeholder="Eusebio Vidal 3100">
  `;
  titulo.querySelector(".campo").addEventListener("input", (e) => { entradas.titulo = e.target.value; });
  contenedor.append(titulo);

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

/* Poner plata de tu comisión para juntar dos precios que no se tocan.

   Se carga POR PUNTA, porque casi nunca sale mitad y mitad: podés resignar del lado del
   comprador para que llegue y no tocar lo del vendedor. Con una sola punta se pregunta
   solo por esa — no hay otra de la cual sacar.

   Es la misma plata que el "descuento en monto fijo" de cada punta y se escribe ahí: no
   son dos cosas distintas, son dos formas de decir lo mismo. Lo que cambia es desde dónde
   lo estás pensando: "le hago un descuento" o "pongo para cerrar". */
function repartirDiferencia(estado) {
  const activas = entradas.puntas.slice(0, entradas.cantidad);
  const puestoEn = (p) => (p.descuentoTipo === "monto" ? p.descuentoValor : null);
  const total = activas.reduce((t, p) => t + (puestoEn(p) || 0), 0);
  const unaSola = entradas.cantidad === 1;

  const seccion = nodo(html`
    <section class="tarjeta">
      <h2 class="titulo" style="font-size:17px;margin-bottom:4px">Poner plata para cerrar</h2>
      <p class="apunte" style="margin-bottom:12px">
        ${unaSola
          ? "Si ponés plata de tu comisión para que el negocio cierre, cargá cuánto."
          : "Si ponés plata de tu comisión para que el negocio cierre, cargá cuánto sale de cada lado."}
      </p>
      <div id="campos-poner"></div>
      ${total
        ? html`<p class="frase" style="margin-top:14px">
             Ponés <strong>${plataUSD(total)}</strong> en total.
             ${unaSola ? "" : "Se descuenta de cada punta como lo cargaste."}</p>`
        : ""}
      ${unaSola ? "" : html`
        <p class="apunte" style="margin:16px 0 6px">O cargá un total y lo reparto</p>
        <div id="campo-total"></div>
        <div class="botonera" style="margin-top:8px">
          <button class="filtro" data-reparto="parejo">Mitad y mitad</button>
          <button class="filtro" data-reparto="vendedora">Toda de la vendedora</button>
          <button class="filtro" data-reparto="compradora">Toda de la compradora</button>
        </div>`}
    </section>
  `);

  const contenedor = seccion.getElementById("campos-poner");
  activas.forEach((p, i) => {
    const nombre = unaSola
      ? "Cuánto ponés"
      : `De la punta ${p.lado}`;
    contenedor.append(campoMonto(`c-pone-${i}`, nombre, "USD", puestoEn(p), (v) => {
      // Cargar un monto acá ES hacerle un descuento a esa punta: se escribe donde va.
      p.descuentoTipo = v ? "monto" : "nada";
      p.descuentoValor = v;
      estado.redibujar();
    }));
  });

  if (unaSola) return seccion;

  let aRepartir = null;
  seccion.getElementById("campo-total").append(
    campoMonto("c-diferencia", "Total a repartir", "USD", null, (v) => { aRepartir = v; })
  );

  for (const boton of seccion.querySelectorAll("[data-reparto]")) {
    boton.addEventListener("click", () => {
      const campo = document.getElementById("c-diferencia");
      const valor = aRepartir ?? numeroDesde(campo ? campo.value : "");
      if (!valor) return;
      const partes = repartir(valor, 2, boton.dataset.reparto);
      partes.forEach((monto, i) => {
        entradas.puntas[i].descuentoTipo = monto ? "monto" : "nada";
        entradas.puntas[i].descuentoValor = monto || null;
      });
      estado.redibujar();
    });
  }
  return seccion;
}

/* ---------- Quién cobra cada pedazo y quién factura con IVA ---------- */

const REGIMENES = [
  { clave: "captacion_mia", nombre: "La captaste vos" },
  { clave: "ref_martin", nombre: "Te lo refirió Martín" },
  { clave: "ref_otro_colega", nombre: "Te lo refirió un colega" },
];

/* Una comisión no la cobra una sola persona. Marcando quién factura con IVA se sabe cuánto
   paga de verdad cada cliente — y ese es el número que hay que mandarle, no la comisión
   pelada. */
function quienCobra(estado, split) {
  const trozos = repartoDeLaPunta(entradas.regimen, split).filter((t) => t.parte > 0);
  const marcados = new Set(entradas.conIva);

  const seccion = nodo(html`
    <section class="tarjeta">
      <h2 class="titulo" style="font-size:17px;margin-bottom:4px">Quién cobra e IVA</h2>
      <p class="apunte" style="margin-bottom:12px">
        La oficina se lleva siempre el 20%. Marcá quién factura con IVA y se suma el
        ${Math.round(IVA * 100)}% sobre esa parte.
      </p>

      <p class="apunte" style="margin-bottom:6px">Cómo llegó el negocio</p>
      <div class="botonera" style="margin:0 0 14px">
        ${REGIMENES.map((r) => `<button class="filtro ${entradas.regimen === r.clave ? "prendido" : ""}" data-regimen="${r.clave}">${r.nombre}</button>`).join("")}
      </div>

      <div class="menu-indicadores">
        ${trozos.map((t) => html`
          <label class="opcion">
            <input type="checkbox" data-iva="${t.clave}" ${marcados.has(t.clave) ? "checked" : ""}>
            <span>
              <span class="opcion-nombre">IVA de ${escapar(t.nombre.toLowerCase())}</span>
              <span class="opcion-pista">${pctFino(t.parte)} de la comisión</span>
            </span>
          </label>`).join("")}
      </div>
    </section>
  `);

  for (const boton of seccion.querySelectorAll("[data-regimen]")) {
    boton.addEventListener("click", () => {
      entradas.regimen = boton.dataset.regimen;
      // Los que ya no existen en el reparto nuevo se caen solos.
      const validos = new Set(repartoDeLaPunta(entradas.regimen, split).map((t) => t.clave));
      entradas.conIva = entradas.conIva.filter((c) => validos.has(c));
      estado.redibujar();
    });
  }
  for (const casilla of seccion.querySelectorAll("[data-iva]")) {
    casilla.addEventListener("change", () => {
      const clave = casilla.dataset.iva;
      entradas.conIva = casilla.checked
        ? [...entradas.conIva, clave]
        : entradas.conIva.filter((c) => c !== clave);
      estado.redibujar();
    });
  }
  return seccion;
}

/* Lo que hay que mandarle a CADA cliente.

   Va separado por punta porque son dos personas distintas: el vendedor no tiene por qué
   ver lo que paga el comprador, y a cada uno se le manda lo suyo. */
function paraCadaCliente(f, estado) {
  const bloque = (p) => {
    // "a el vendedor" no lo dice nadie.
    const quien = p.lado === "vendedora" ? "al vendedor" : "al comprador";
    return html`
      <div class="cliente">
        <div class="tarjeta-titulo" style="margin-bottom:10px">
          <h3 class="titulo" style="font-size:15px">Le facturás ${quien}</h3>
          <span class="apunte">${pctFino(p.pct_efectivo)} del precio</span>
        </div>
        <div class="datos">
          ${p.trozos.map((t) => html`
            <div class="dato">
              <span class="dato-nombre">${escapar(t.nombre)}
                <br><span class="apunte">${pctFino(t.parte)}${t.lleva_iva ? ` · +${Math.round(IVA * 100)}% de IVA` : " · sin IVA"}</span>
              </span>
              <span class="dato-valor">${plata(t.total)}
                ${t.iva ? html`<br><span class="apunte">${plata(t.monto)} + ${plata(t.iva)}</span>` : ""}
              </span>
            </div>`).join("")}
          <div class="dato">
            <span class="dato-nombre"><strong>Paga en total</strong>
              ${p.iva ? html`<br><span class="apunte">comisión ${plata(p.comision)} + IVA ${plata(p.iva)}</span>` : ""}
            </span>
            <span class="dato-valor"><strong>${plata(p.total)}</strong></span>
          </div>
        </div>
        <div class="botonera">
          <button class="boton boton-chico" data-mandar="${escapar(p.lado)}">Mandarle esto</button>
          <button class="boton boton-chico" data-copiar="${escapar(p.lado)}">Copiar</button>
        </div>
        <p class="apunte" data-aviso="${escapar(p.lado)}" style="margin-top:6px"></p>
      </div>`;
  };

  const seccion = nodo(html`
    <section class="tarjeta">
      <div class="tarjeta-titulo">
        <h2 class="titulo" style="font-size:17px">Para cada cliente</h2>
        <span class="apunte">${f.puntas.length === 1 ? "una punta" : "las dos puntas"}</span>
      </div>
      ${f.puntas.map(bloque).join("")}
      ${f.puntas.length > 1
        ? html`<div class="datos" style="margin-top:14px">
             <div class="dato">
               <span class="dato-nombre"><strong>Entre los dos</strong></span>
               <span class="dato-valor"><strong>${plata(f.total)}</strong>
                 <br><span class="apunte">${plata(f.comision)} + ${plata(f.iva)} de IVA</span></span>
             </div>
           </div>`
        : ""}
    </section>
  `);

  /* Lo que se le manda al cliente lleva SOLO lo suyo: su porcentaje, su plata, su IVA y su
     total. Nada del reparto interno — al cliente no le incumbe cuánto va a la oficina, y
     meterlo abre una conversación que no tiene que ver con lo que está por firmar. */
  const armar = (lado) => textoParaElCliente(
    f.puntas.find((p) => p.lado === lado),
    {
      precio: entradas.precio,
      titulo: entradas.titulo,
      agente: (estado.datos.ajustes || {}).agente,
    }
  );
  const avisar = (lado, texto) => {
    const p = seccion.querySelector(`[data-aviso="${lado}"]`);
    if (p) p.textContent = texto;
  };

  for (const boton of seccion.querySelectorAll("[data-mandar]")) {
    boton.addEventListener("click", () => {
      const lado = boton.dataset.mandar;
      const texto = armar(lado);
      if (navigator.share) {
        navigator.share({ text: texto }).catch(() => {});
        return;
      }
      window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, "_blank", "noopener");
    });
  }
  for (const boton of seccion.querySelectorAll("[data-copiar]")) {
    boton.addEventListener("click", async () => {
      const lado = boton.dataset.copiar;
      try {
        await navigator.clipboard.writeText(armar(lado));
        avisar(lado, "Copiado.");
      } catch {
        avisar(lado, "El navegador no dejó copiar. Usá «Mandarle esto».");
      }
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
             le cobrás <strong>${pctFino(p.pct_efectivo)}</strong> en vez de ${pctFino(p.pct)}`
          : html`<strong>${pctFino(p.pct)}</strong> del precio`}
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
          <span class="dato-valor">${pctFino(r.pct_efectivo)} del precio</span>
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
              ${pctFino(r.comision_ingenua / (r.oferta_ingenua || 1))} y no ${pctFino(r.pct)}.
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
