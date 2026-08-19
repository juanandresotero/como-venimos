/* La calculadora de reajuste de alquiler.

   Ponés el alquiler, elegís IPC o coeficiente, y sale a cuánto se ajusta. El mes lo pone
   sola: un alquiler ajusta el mes en que el contrato cumple año, y uno abre esto justo ese
   mes. La celda del mes está por si alguna vez vas con atraso.

   Lo que no se puede negociar es que el número esté a la vista con su mes: si vale el de
   agosto y estás mandando el de julio, tenés que verlo antes de tocar el botón. */

import {
  TIPOS, mesDe, nombreDelMes, mesesConDato, buscar, calcular, atraso, porQueCoinciden,
  textoParaElCliente,
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
  // Solo hay atraso si el usuario dijo en que mes tendria que haber ajustado.
  const deuda = entradas.mes ? atraso(cuenta, entradas.mes, mesDe(estado.hoy)) : null;

  seccion.append(nodo(html`
    <section style="margin-bottom:16px">
      <p class="etiqueta">Herramientas</p>
      <h1 class="titulo" style="font-size:27px;margin-top:4px">Reajuste de alquiler</h1>
      <p class="apunte">Un alquiler se reajusta una vez al año, el mes en que el contrato
        cumple año.</p>
    </section>
  `));

  seccion.append(datos(estado));
  seccion.append(resultado(cuenta, indice, mesPedido, indices, deuda));
  seccion.append(elMes(estado, indices));
  seccion.append(mandar(estado, cuenta, indice, deuda));
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

      <div style="padding:14px 14px 0;display:flex;align-items:center;justify-content:space-between;gap:10px">
        <span style="font-size:12.5px;color:var(--tinta-2)">Cómo ajusta</span>
        <button class="filtro" id="rj-info" style="padding:5px 10px;font-size:12px"
                aria-label="Cuándo se usa cada uno">¿Cuál va?</button>
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

function resultado(cuenta, indice, mesPedido, indices, deuda) {
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
    ${bloqueDelAtraso(deuda, cuenta, entradas.moneda)}
  `);
}

/* Lo que quedo sin cobrar. Va mes por mes y no como un total suelto: el numero grande
   suelto obliga a confiar, y con los meses a la vista se puede sumar y verificar. */
function bloqueDelAtraso(deuda, cuenta, moneda) {
  if (!deuda) return "";
  return html`
    <section class="tarjeta">
      <p class="etiqueta">Lo que quedó atrasado</p>
      <p class="apunte" style="margin-bottom:10px">El ajuste correspondía desde
        ${escapar(nombreDelMes(deuda.meses[0].mes))} y cada mes quedó
        ${escapar(conMoneda(cuenta.aumento, moneda))} corto.</p>
      <div class="datos">
        ${deuda.meses.map((m) => html`<div class="dato">
          <span class="dato-nombre">${escapar(nombreDelMes(m.mes))}</span>
          <span class="dato-valor">${escapar(conMoneda(m.diferencia, moneda))}</span>
        </div>`).join("")}
        <div class="dato">
          <span class="dato-nombre"><strong>Atrasado, ${deuda.cantidad} meses</strong></span>
          <span class="dato-valor"><strong>${escapar(conMoneda(deuda.total, moneda))}</strong></span>
        </div>
      </div>
      <p class="apunte" style="margin-top:12px">
        Si <strong>${escapar(nombreDelMes(deuda.meses[deuda.meses.length - 1].mes))}</strong>
        ya lo cobraste al precio viejo, te debe
        <strong>${escapar(conMoneda(deuda.total, moneda))}</strong>.<br>
        Si todavía no lo cobraste, cobralo a
        <strong>${escapar(conMoneda(cuenta.nuevo, moneda))}</strong> y sumale
        <strong>${escapar(conMoneda(deuda.total - cuenta.aumento, moneda))}</strong>
        de los meses anteriores.
      </p>
    </section>
  `;
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
    verificado contra el IPC y la URA${revisado ? ` · dato del ${escapar(revisado)}` : ""}.</p>
    ${notaDeLaCoincidencia(indices, indice.mes)}`;
}

/* Cuando los dos caminos dan el mismo número, decir por qué.

   El coeficiente es el MENOR entre el IPC y la URA. Cuando el IPC viene más abajo, elegir
   uno u otro da igual — y eso es lo correcto, no una falla. Pero desde afuera se ve igual
   que una app rota, y sin este renglón hay que salir a preguntar. */
function notaDeLaCoincidencia(indices, mes) {
  const igual = porQueCoinciden(indices, mes);
  if (!igual) return "";
  const cuanto = igual.puntos
    ? ` — viene ${escapar(pctFino(igual.puntos / 100, 1))} más abajo`
    : "";
  return html`<p class="apunte" style="margin-top:6px">Este mes el IPC y el coeficiente dan
    lo mismo: el coeficiente es el <em>menor</em> entre el IPC y la URA, y hoy manda el
    IPC${cuanto}. No siempre es así — entre 2020 y 2022 mandó la URA y llegaron a
    separarse 3 puntos.</p>`;
}

/* ---------- El atraso ---------- */

/* Plegada, porque el caso normal es no tocarla. */
function elMes(estado, indices) {
  const disponibles = mesesConDato(indices, entradas.tipo).slice(0, 12);
  const trozo = nodo(html`
    <section class="tarjeta" style="padding:0;overflow:hidden">
      <button class="fila" id="rj-abrir-mes">
        <span class="fila-cuerpo">
          <span class="fila-titulo">¿En qué mes debería haber ajustado?</span>
          <span class="fila-sub">${entradas.mes
            ? escapar(nombreDelMes(entradas.mes))
            : "Vacío = este mes. Llenalo solo si vas con atraso."}</span>
        </span>
        <span class="fila-derecha"><span class="apunte">${entradas.eligiendoMes ? "⌃" : "›"}</span></span>
      </button>
      <div id="rj-meses" ${entradas.eligiendoMes ? "" : "hidden"} style="padding:0 14px 14px">
        <div class="filtros" style="padding:0">
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
function mandar(estado, cuenta, indice, deuda) {
  if (!cuenta || !indice.valor) return document.createDocumentFragment();

  const trozo = nodo(html`
    <section class="tarjeta">
      <div class="campo-fila">
        <label for="rj-titulo">Para qué propiedad <span class="apunte">(opcional)</span></label>
        <input class="campo" id="rj-titulo" type="text" placeholder="Av. Italia 1234"
               value="${escapar(entradas.titulo)}">
      </div>
      <!-- Sin .boton-primario a proposito: el azul esta reservado para el aviso de que
           copio (.copiado). Un boton que ya es azul no puede ponerse azul para avisar. -->
      <div class="botonera">
        <button class="boton" id="rj-copiar" style="flex:1">Copiar para el cliente</button>
      </div>
    </section>
  `);

  const titulo = trozo.getElementById("rj-titulo");
  titulo.addEventListener("input", () => { entradas.titulo = titulo.value; });

  const copiar = trozo.getElementById("rj-copiar");
  copiar.addEventListener("click", async () => {
    const texto = textoParaElCliente({
      cuenta, moneda: entradas.moneda, tipo: entradas.tipo, indice, titulo: entradas.titulo, deuda,
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
