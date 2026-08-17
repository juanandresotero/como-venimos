/* La ficha de un negocio, editable.

   Los campos que faltan se pintan en rojo, para que se vea de un golpe que hay que
   completar. Cada cambio se aplica al instante y queda en la cola para subir. */

import { editarNegocio } from "../lib/guardado.js";
import { plata, plataUSD, escapar } from "../lib/formato.js";
import { REGIMENES } from "../lib/motor.js";

const html = (c, ...v) => c.reduce((t, x, i) => t + x + (v[i] ?? ""), "");

function nodo(marca) {
  const molde = document.createElement("template");
  molde.innerHTML = marca.trim();
  return molde.content;
}

const NOMBRE_REGIMEN = {
  captacion_mia: "Captación mía",
  ref_martin: "Referida de Martín",
  ref_otro_colega: "Referida de otro colega",
  yo_referi: "Yo se lo referí a un colega",
  suplencia: "Suplencia (cubrí una visita)",
};

const TIPOS = {
  venta: "Venta",
  alquiler: "Alquiler",
  renovacion_alquiler: "Renovación de alquiler",
  suplencia: "Suplencia",
};

export function dibujarFicha(estado) {
  const n = (estado.datos.negocios || []).find((x) => x.id === estado.foco);
  if (!n) {
    const vacio = document.createDocumentFragment();
    vacio.append(nodo(html`<p class="pronto">No se encontró ese negocio.</p>`));
    return vacio;
  }

  const falta = new Set((n.avisos || []).map((a) => a.tipo));
  const trozo = document.createDocumentFragment();

  trozo.append(nodo(html`
    <section style="margin-bottom:14px">
      <button class="boton" id="volver" style="padding:8px 13px;font-size:13px">‹ Negocios</button>
      <p class="etiqueta" style="margin-top:14px">${escapar(TIPOS[n.tipo_negocio] || n.tipo_negocio)} · ${escapar(n.id)}</p>
      <h1 class="titulo" style="font-size:24px;margin-top:4px">${escapar(n.direccion || "Sin dirección")}</h1>
      <p class="apunte">${escapar(n.barrio || "sin barrio")}</p>
    </section>

    <section class="tarjeta">
      <div class="tarjeta-titulo">
        <h2 class="titulo" style="font-size:17px">La plata</h2>
        <span class="apunte">${n.recalculado ? "recalculado" : "viene del Excel"}</span>
      </div>
      <div class="datos">
        <div class="dato"><span class="dato-nombre">Comisión total (BASE)</span><span class="dato-valor">${plata(n.base)}</span></div>
        <div class="dato"><span class="dato-nombre">Facturación RE/MAX</span><span class="dato-valor">${plata(n.facturacion)}</span></div>
        <div class="dato"><span class="dato-nombre">A tu bolsillo</span><span class="dato-valor">${plataUSD(n.ganancia)}</span></div>
      </div>
    </section>
  `));

  trozo.append(campos(n, falta, estado));
  trozo.append(avisos(n));
  trozo.append(fichaCompleta(n, estado));

  trozo.getElementById("volver").addEventListener("click", () => estado.irA("negocios"));
  return trozo;
}

function campos(n, falta, estado) {
  const seccion = nodo(html`
    <section class="tarjeta" style="padding:0;overflow:hidden">
      <div class="datos" id="campos"></div>
    </section>
  `);
  const contenedor = seccion.getElementById("campos");

  const agregar = (clave, etiqueta, tipo, valor, opciones) => {
    const faltaEste = falta.has(`falta_${clave}`) || falta.has(`sin_${clave}`);
    const fila = document.createElement("div");
    fila.className = `campo-fila${faltaEste ? " falta" : ""}`;
    const id = `campo-${clave}`;
    fila.innerHTML = html`
      <label for="${id}">${etiqueta}${faltaEste ? " — falta" : ""}</label>
      ${opciones
        ? html`<select class="campo" id="${id}">
             ${opciones.map(([v, t]) => `<option value="${v}"${String(v) === String(valor) ? " selected" : ""}>${t}</option>`).join("")}
           </select>`
        : html`<input class="campo" id="${id}" type="${tipo}" value="${valor ?? ""}"${tipo === "number" ? ' step="any"' : ""}>`}
    `;
    const control = fila.querySelector(".campo");
    control.addEventListener("change", () => {
      const crudo = control.value;
      const nuevo = tipo === "number" ? (crudo === "" ? null : Number(crudo)) : crudo || null;
      editarNegocio(estado, n.id, { [clave]: nuevo });
      estado.redibujar();
    });
    contenedor.append(fila);
  };

  agregar("fecha_inicio", "Fecha de inicio", "date", n.fecha_inicio);
  agregar("fecha_boleto", "Fecha del boleto o reserva", "date", n.fecha_boleto);
  agregar("fecha_fin", "Fecha de firma (cuando cobraste)", "date", n.fecha_fin);
  agregar("direccion", "Dirección", "text", n.direccion);
  agregar("barrio", "Barrio", "text", n.barrio);
  agregar("precio_operacion", "Precio de la operación (USD)", "number", n.precio_operacion);
  agregar("pct_comision_total", "% de comisión (0,03 = 3%)", "number", n.pct_comision_total);
  agregar("puntas", "Puntas", "number", n.puntas,
    [[0, "0 — no fue mío"], [1, "1 punta"], [2, "2 puntas"]]);
  agregar("regimen_comision", "Cómo llegó el negocio", "text", n.regimen_comision,
    REGIMENES.map((r) => [r, NOMBRE_REGIMEN[r] || r]));
  agregar("tipo_negocio", "Tipo", "text", n.tipo_negocio, Object.entries(TIPOS));
  agregar("notas", "Notas", "text", n.notas);

  return seccion;
}

function avisos(n) {
  const lista = n.avisos || [];
  if (!lista.length) {
    return nodo(html`<p class="apunte" style="text-align:center;padding:8px">Sin pendientes en este negocio ✓</p>`);
  }
  return nodo(html`
    <section class="tarjeta">
      <h2 class="titulo" style="font-size:17px;margin-bottom:10px">Qué falta acá</h2>
      ${lista.map((a) => html`<p class="aviso">${escapar(a.detalle)}</p>`).join("")}
    </section>
  `);
}

function fichaCompleta(n, estado) {
  const seccion = nodo(html`
    <section class="tarjeta">
      <h2 class="titulo" style="font-size:17px;margin-bottom:6px">
        ${n.ficha_completa ? "Ficha dada por completa" : "¿Ya cargaste todo lo que ibas a cargar?"}
      </h2>
      <p class="apunte" style="margin-bottom:12px">
        ${n.ficha_completa
          ? "Este negocio no vuelve a aparecer en pendientes por datos faltantes. Podés seguir editándolo cuando quieras."
          : "Tocá acá y dejo de avisarte por los datos que falten en este negocio. Se puede deshacer."}
      </p>
      <button class="boton ${n.ficha_completa ? "" : "boton-primario"}" id="completa">
        ${n.ficha_completa ? "Volver a pedirme los datos" : "Ficha completa"}
      </button>
    </section>
  `);
  seccion.getElementById("completa").addEventListener("click", () => {
    editarNegocio(estado, n.id, { ficha_completa: !n.ficha_completa });
    estado.redibujar();
  });
  return seccion;
}
