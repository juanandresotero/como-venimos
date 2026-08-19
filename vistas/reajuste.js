/* La calculadora de reajuste de alquiler.

   Ponés el alquiler, elegís IPC o coeficiente, y sale a cuánto se ajusta. El mes lo pone
   sola: un alquiler ajusta el mes en que el contrato cumple año, y uno abre esto justo ese
   mes. La celda del mes está por si alguna vez vas con atraso.

   Lo que no se puede negociar es que el número esté a la vista con su mes: si vale el de
   agosto y estás mandando el de julio, tenés que verlo antes de tocar el botón. */

import {
  TIPOS, mesDe, nombreDelMes, mesesConDato, buscar, calcular, textoParaElCliente,
} from "../lib/reajuste.js";
import {
  escapar, numeroDesde, formatearMientrasEscribe, plata, plataUSD, pctFino,
} from "../lib/formato.js";

const html = (c, ...v) => c.reduce((t, x, i) => t + x + (v[i] ?? ""), "");

function nodo(marca) {
  const molde = document.createElement("template");
  molde.innerHTML = marca.trim();
  return molde.content;
}

/* Lo que el usuario tiene cargado ahora. Vive mientras la pantalla esté abierta. */
const entradas = {
  monto: null,
  moneda: "UYU",
  tipo: "coeficiente",
  mes: "",        // vacío = el mes de hoy, que es el caso normal
  titulo: "",
  explicando: false,
  eligiendoMes: false,
};

const conMoneda = (n, moneda) => (moneda === "USD" ? plataUSD(n) : `$ ${plata(n)}`);

export function dibujarReajuste(estado) {
  const seccion = document.createDocumentFragment();
  const indices = estado.datos.indices || {};
  const mesPedido = entradas.mes || mesDe(estado.hoy);
  const indice = buscar(indices, mesPedido, entradas.tipo);
  const cuenta = calcular(entradas.monto, indice.valor);

  seccion.append(nodo(html`
    <section style="margin-bottom:16px">
      <p class="etiqueta">Herramientas</p>
      <h1 class="titulo" style="font-size:27px;margin-top:4px">Reajuste de alquiler</h1>
      <p class="apunte">Un alquiler se reajusta una vez al año, el mes en que el contrato
        cumple año.</p>
    </section>
  `));

  seccion.append(datos(estado));
  seccion.append(resultado(cuenta, indice, mesPedido, indices));
  seccion.append(elMes(estado, indices));
  seccion.append(mandar(estado, cuenta, indice));
  return seccion;
}

/* ---------- Lo que se carga ---------- */

function datos(estado) {
  const trozo = nodo(html`
    <section class="tarjeta">
      <div class="campo-fila">
        <label for="rj-monto">Alquiler de hoy</label>
        <input class="campo" id="rj-monto" type="text" inputmode="decimal" placeholder="0"
               value="${entradas.monto === null ? "" : plata(entradas.monto)}">
      </div>
      <div class="filtros" style="margin-top:4px">
        <button class="filtro ${entradas.moneda === "UYU" ? "prendido" : ""}" data-moneda="UYU">Pesos</button>
        <button class="filtro ${entradas.moneda === "USD" ? "prendido" : ""}" data-moneda="USD">Dólares</button>
      </div>

      <div class="campo-fila" style="margin-top:14px;border:0;padding-bottom:0">
        <label>Cómo ajusta</label>
        <button class="filtro" id="rj-info" aria-label="Cuándo se usa cada uno">¿Cuál va?</button>
      </div>
      <div class="filtros">
        ${TIPOS.map((t) => html`<button class="filtro ${entradas.tipo === t.clave ? "prendido" : ""}"
          data-tipo="${escapar(t.clave)}">${escapar(t.nombre)}</button>`).join("")}
      </div>
      <div id="rj-explicacion" ${entradas.explicando ? "" : "hidden"} style="margin-top:10px">
        ${TIPOS.map((t) => html`<p class="apunte" style="margin:6px 0">
          <strong>${escapar(t.nombre)}:</strong> ${escapar(t.cuando)}</p>`).join("")}
      </div>
    </section>
  `);

  const monto = trozo.getElementById("rj-monto");
  formatearMientrasEscribe(monto);
  monto.addEventListener("change", () => {
    entradas.monto = numeroDesde(monto.value);
    estado.redibujar();
  });
  for (const boton of trozo.querySelectorAll("[data-moneda]")) {
    boton.addEventListener("click", () => { entradas.moneda = boton.dataset.moneda; estado.redibujar(); });
  }
  for (const boton of trozo.querySelectorAll("[data-tipo]")) {
    boton.addEventListener("click", () => { entradas.tipo = boton.dataset.tipo; estado.redibujar(); });
  }
  trozo.getElementById("rj-info").addEventListener("click", () => {
    entradas.explicando = !entradas.explicando;
    estado.redibujar();
  });
  return trozo;
}

/* ---------- El número ---------- */

function resultado(cuenta, indice, mesPedido, indices) {
  if (!indice.valor) {
    return nodo(html`
      <section class="tarjeta">
        <p class="apunte">Todavía no hay ningún índice publicado para
          ${escapar(nombreDelMes(mesPedido))} ni para antes. Si el robot no corrió hoy,
          probá más tarde.</p>
      </section>
    `);
  }
  if (!cuenta) {
    return nodo(html`
      <section class="tarjeta">
        <p class="apunte">Poné el alquiler de hoy y acá aparece a cuánto se ajusta.</p>
      </section>
    `);
  }

  const moneda = entradas.moneda;
  return nodo(html`
    <section class="tarjeta">
      <p class="etiqueta">Nuevo alquiler${indice.alDia ? "" : " (estimado)"}</p>
      <p class="cifra cifra-heroe" style="color:var(--azul)">${escapar(conMoneda(cuenta.nuevo, moneda))}</p>
      <p class="apunte">Sube ${escapar(conMoneda(cuenta.aumento, moneda))} por mes
        · ${escapar(pctFino(cuenta.pct, 2))}</p>
      <div class="datos" style="margin-top:14px">
        <div class="dato">
          <span class="dato-nombre">En los doce meses</span>
          <span class="dato-valor">${escapar(conMoneda(cuenta.aumento * 12, moneda))} más</span>
        </div>
      </div>
      ${cartelDelIndice(indice, indices)}
    </section>
  `);
}

/* De qué mes es el número y si pasó el control.

   Va SIEMPRE, no solo cuando hay un problema: el que manda un reajuste tiene que poder ver
   contra qué mes lo está haciendo sin tener que ir a buscarlo. */
function cartelDelIndice(indice, indices) {
  const cuando = nombreDelMes(indice.mes);
  const revisado = (indices || {}).actualizado;

  if (!indice.verificado) {
    return html`<p class="apunte" style="margin-top:12px;color:var(--rojo)">⚠️ El índice de
      ${escapar(cuando)} no coincide con la cuenta de la ley
      (${escapar((indice.avisos || []).join("; "))}). Mejor no usarlo hasta que se aclare.</p>`;
  }
  if (!indice.alDia) {
    return html`<p class="apunte" style="margin-top:12px;color:var(--rojo)">⚠️ El índice de
      ${escapar(nombreDelMes(indice.pedido))} todavía no salió. Este número usa el de
      ${escapar(cuando)}. Lo podés mandar igual: el texto lo aclara.</p>`;
  }
  return html`<p class="apunte" style="margin-top:12px">✅ Índice de ${escapar(cuando)},
    verificado contra el IPC y la URA${revisado ? ` · dato del ${escapar(revisado)}` : ""}.</p>`;
}

/* ---------- El atraso ---------- */

/* Plegada, porque el caso normal es no tocarla. */
function elMes(estado, indices) {
  const disponibles = mesesConDato(indices, entradas.tipo).slice(0, 12);
  const trozo = nodo(html`
    <section class="tarjeta-fija">
      <button class="fila" id="rj-abrir-mes">
        <span class="fila-cuerpo">
          <span class="fila-titulo">¿En qué mes debería haber ajustado?</span>
          <span class="fila-sub">${entradas.mes
            ? escapar(nombreDelMes(entradas.mes))
            : "Vacío = este mes. Llenalo solo si vas con atraso."}</span>
        </span>
        <span class="fila-derecha"><span class="apunte">${entradas.eligiendoMes ? "⌃" : "›"}</span></span>
      </button>
      <div id="rj-meses" ${entradas.eligiendoMes ? "" : "hidden"} style="margin-top:10px">
        <div class="filtros">
          <button class="filtro ${entradas.mes ? "" : "prendido"}" data-mes="">Este mes</button>
          ${disponibles.map((m) => html`<button
            class="filtro ${entradas.mes === m ? "prendido" : ""}"
            data-mes="${escapar(m)}">${escapar(nombreDelMes(m))}</button>`).join("")}
        </div>
      </div>
    </section>
  `);

  trozo.getElementById("rj-abrir-mes").addEventListener("click", () => {
    entradas.eligiendoMes = !entradas.eligiendoMes;
    estado.redibujar();
  });
  for (const boton of trozo.querySelectorAll("[data-mes]")) {
    boton.addEventListener("click", () => { entradas.mes = boton.dataset.mes; estado.redibujar(); });
  }
  return trozo;
}

/* ---------- Mandar ---------- */

/* El botón NUNCA se apaga por falta del dato del mes: el usuario prefiere mandar el
   estimado con la salvedad adentro que quedarse sin poder contestarle al inquilino. */
function mandar(estado, cuenta, indice) {
  if (!cuenta || !indice.valor) return document.createDocumentFragment();

  const trozo = nodo(html`
    <section class="tarjeta">
      <div class="campo-fila">
        <label for="rj-titulo">Para qué propiedad <span class="apunte">opcional</span></label>
        <input class="campo" id="rj-titulo" type="text" placeholder="Av. Italia 1234"
               value="${escapar(entradas.titulo)}">
      </div>
      <button class="boton-primario" id="rj-copiar" style="margin-top:12px;width:100%">
        Copiar para el cliente
      </button>
    </section>
  `);

  const titulo = trozo.getElementById("rj-titulo");
  titulo.addEventListener("input", () => { entradas.titulo = titulo.value; });

  const copiar = trozo.getElementById("rj-copiar");
  copiar.addEventListener("click", async () => {
    const texto = textoParaElCliente({
      cuenta, moneda: entradas.moneda, tipo: entradas.tipo, indice, titulo: entradas.titulo,
    });
    const dice = copiar.textContent;
    try {
      await navigator.clipboard.writeText(texto);
    } catch {
      // Sin portapapeles queda WhatsApp, que en el telefono es adonde iba igual.
      window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, "_blank", "noopener");
      return;
    }
    copiar.textContent = "✓ Copiado";
    copiar.classList.add("copiado");
    setTimeout(() => { copiar.textContent = dice; copiar.classList.remove("copiado"); }, 1800);
  });
  return trozo;
}
