/* Homogeneización del m²: llevar todos los metros de una propiedad a una misma moneda.

   Cien metros de living no son cien metros de patio. Para comparar dos propiedades hay que
   ponderar cada tipo de metro, y eso es lo que hace esta pantalla.

   Con el mínimo de texto: los campos dicen qué son, el desglose muestra la cuenta hecha —de
   dónde sale cada metro— y no hay un solo párrafo explicando lo que ya se ve. El patio
   tampoco se pide: se calcula, así no puede quedar mal sumado. */

import { homogeneizar, POR_DEFECTO } from "../lib/homogeneizacion.js";
import { escapar } from "../lib/formato.js";

const html = (c, ...v) => c.reduce((t, x, i) => t + x + (v[i] ?? ""), "");

function nodo(marca) {
  const molde = document.createElement("template");
  molde.innerHTML = marca.trim();
  return molde.content;
}

/* Lo cargado vive acá y no en el disco: es una cuenta de un rato, como las otras
   calculadoras. Al salir y volver se conserva mientras la app siga abierta. */
const medidas = { padron: null, construido: null, semi: null, otras: null };
const pesos = { ...POR_DEFECTO };
let pesosAbiertos = false;

/* Los pedazos que cambian mientras se escribe. Se guardan las referencias para refrescarlos
   SOLOS: redibujar la pantalla entera en cada tecla manda el scroll a cualquier lado, que es
   lo que Juan reportó en la carta oferta. */
const vivos = { total: null, resumen: null, tapa: null };

/* Con un decimal cuando lo hay: 202,5 m² no es 203 m². `plata` redondea a entero, que va
   bien para la plata y mal para los metros. */
const CON_DECIMAL = new Intl.NumberFormat("es-UY", { maximumFractionDigits: 1 });
const m2 = (n) => `${CON_DECIMAL.format(Math.round(n * 10) / 10)} m²`;
const enPct = (f) => `${Math.round(f * 100)}%`;

/* La pista dice CON QUE EJEMPLO llenarlo, que es lo unico que hace falta saber. */
const CAMPOS = [
  { clave: "padron", etiqueta: "Tamaño del padrón", pista: "en m² · todo el terreno" },
  { clave: "construido", etiqueta: "Construido", pista: "en m²" },
  { clave: "semi", etiqueta: "Semiconstruido", pista: "en m² · terraza techada, barbacoa" },
  { clave: "otras", etiqueta: "Otras construcciones", pista: "en m² · galpón, depósito" },
];

const PESOS = [
  { clave: "semi", etiqueta: "Semiconstruido" },
  { clave: "otras", etiqueta: "Otras construcciones" },
  { clave: "patio", etiqueta: "Patio" },
];

export function dibujarHomogeneizacion(estado) {
  vivos.total = null;
  vivos.resumen = null;
  vivos.tapa = null;

  const trozo = document.createDocumentFragment();
  trozo.append(cabecera());
  trozo.append(campos());
  trozo.append(cuantoSeToma(estado));
  trozo.append(resumen());
  refrescar();
  return trozo;
}

function cabecera() {
  const marca = nodo(html`
    <section style="margin-bottom:16px">
      <h1 class="titulo" style="font-size:26px">Homogeneización del m²</h1>
      <p class="cifra cifra-heroe" style="color:var(--azul);margin:14px 0 0" id="h-total"></p>
      <p class="apunte" id="h-total-pie"></p>
    </section>
  `);
  vivos.total = marca.getElementById("h-total");
  vivos.totalPie = marca.getElementById("h-total-pie");
  return marca;
}

function campos() {
  const seccion = nodo('<section class="tarjeta" style="padding:0;overflow:hidden"></section>');
  const caja = seccion.querySelector("section");
  for (const campo of CAMPOS) {
    const fila = document.createElement("div");
    fila.className = "campo-fila";
    fila.innerHTML = html`
      <label for="h-${campo.clave}">${escapar(campo.etiqueta)}
        <span class="apunte">${escapar(campo.pista)}</span></label>
      <input class="campo" id="h-${campo.clave}" type="number" inputmode="decimal"
             min="0" step="any" value="${medidas[campo.clave] ?? ""}" placeholder="0">
    `;
    const control = fila.querySelector(".campo");
    /* Se anota mientras se escribe: no hay que confirmar nada y no se pierde el renglón. */
    control.addEventListener("input", () => {
      medidas[campo.clave] = control.value === "" ? null : Number(control.value);
      refrescar();
    });
    caja.append(fila);
  }
  return seccion;
}

/* Los porcentajes van plegados: se ponen una vez y casi no se tocan. La tapa los muestra
   igual, para no tener que abrirla para saber con qué está calculando. */
function cuantoSeToma(estado) {
  const seccion = nodo(html`
    <details class="grupo" ${pesosAbiertos ? "open" : ""}>
      <summary class="grupo-cabeza">
        <span class="grupo-nombre">Cuánto se toma de cada uno</span>
        <span class="apunte grupo-resumen" id="h-tapa"></span>
        <span class="grupo-flecha" aria-hidden="true">›</span>
      </summary>
      <div class="tarjeta" style="margin-top:6px" id="h-pesos"></div>
    </details>
  `);
  seccion.querySelector("details").addEventListener("toggle", (e) => {
    pesosAbiertos = e.target.open;
  });
  vivos.tapa = seccion.getElementById("h-tapa");

  const caja = seccion.getElementById("h-pesos");
  for (const peso of PESOS) {
    const fila = document.createElement("div");
    fila.className = "fila-peso";
    fila.innerHTML = html`
      <div class="fila-peso-nombre">
        <span class="dato-nombre">${escapar(peso.etiqueta)}</span>
        <span class="cifra fila-peso-cifra" id="h-pct-${peso.clave}">${enPct(pesos[peso.clave])}</span>
      </div>
      <input type="range" class="deslizador" id="h-barra-${peso.clave}"
             min="0" max="100" step="5" value="${Math.round(pesos[peso.clave] * 100)}"
             aria-label="Cuánto se toma de ${escapar(peso.etiqueta)}">
    `;
    const barra = fila.querySelector(".deslizador");
    const cifra = fila.querySelector(`#h-pct-${peso.clave}`);
    /* Igual que en renta: la barra NO redibuja la pantalla mientras se arrastra. */
    barra.addEventListener("input", () => {
      pesos[peso.clave] = Number(barra.value) / 100;
      cifra.textContent = enPct(pesos[peso.clave]);
      refrescar();
    });
    caja.append(fila);
  }
  return seccion;
}

/* El resultado con la cuenta hecha al lado. Es la única "explicación" que hay, y es de
   números: sirve para rehacerla a mano y para mostrársela a un cliente. */
function resumen() {
  const seccion = nodo(html`
    <section class="tarjeta tarjeta-resumen" id="h-resumen">
      <h2 class="titulo" style="font-size:17px">De dónde salen</h2>
      <div class="datos" style="margin-top:10px" id="h-partes"></div>
      <p class="apunte" id="h-aviso" hidden style="margin-top:10px;color:var(--rojo-tinta)"></p>
    </section>
  `);
  vivos.resumen = seccion.getElementById("h-resumen");
  vivos.partes = seccion.getElementById("h-partes");
  vivos.aviso = seccion.getElementById("h-aviso");
  return seccion;
}

function refrescar() {
  const r = homogeneizar(medidas, pesos);

  if (vivos.tapa) vivos.tapa.textContent = PESOS.map((p) => enPct(pesos[p.clave])).join(" · ");
  if (vivos.total) {
    vivos.total.textContent = r.hayDatos ? m2(r.total) : "";
    vivos.totalPie.textContent = r.hayDatos ? "homogeneizados" : "";
  }
  if (!vivos.resumen) return;

  vivos.resumen.hidden = !r.hayDatos;
  vivos.partes.innerHTML = r.partes.map((p) => html`
    <div class="dato">
      <span class="dato-nombre">${escapar(p.nombre)}
        <br><span class="apunte">${m2(p.m2)} × ${enPct(p.peso)}</span></span>
      <span class="dato-valor">${m2(p.computa)}</span>
    </div>`).join("")
    + html`
    <div class="dato">
      <span class="dato-nombre"><strong>Homogeneizados</strong></span>
      <span class="dato-valor">${m2(r.total)}</span>
    </div>`;

  vivos.aviso.hidden = !r.seExcede;
  if (r.seExcede) {
    vivos.aviso.textContent = "Lo construido no entra en el padrón. Si son dos plantas, "
      + "el patio te queda corto: cargalo aparte en “Otras construcciones”.";
  }
}
