/* La lista de los 85 negocios, con filtros. Tocar uno abre su ficha. */

import { plata, fechaCorta, escapar } from "../lib/formato.js";

const html = (c, ...v) => c.reduce((t, x, i) => t + x + (v[i] ?? ""), "");

function nodo(marca) {
  const molde = document.createElement("template");
  molde.innerHTML = marca.trim();
  return molde.content;
}

const filtro = { anio: "todos", tipo: "todos", conAvisos: false };

function aplicarFiltros(negocios) {
  return negocios.filter((n) => {
    if (filtro.anio !== "todos" && (n.fecha_fin || "").slice(0, 4) !== filtro.anio) return false;
    if (filtro.tipo !== "todos" && n.tipo_negocio !== filtro.tipo) return false;
    if (filtro.conAvisos && !(n.avisos || []).length) return false;
    return true;
  });
}

export function dibujarNegocios(estado) {
  const todos = estado.datos.negocios || [];
  const anios = [...new Set(todos.map((n) => (n.fecha_fin || "").slice(0, 4)).filter(Boolean))]
    .sort().reverse();
  const lista = aplicarFiltros(todos)
    .sort((a, b) => (b.fecha_fin || "").localeCompare(a.fecha_fin || ""));

  const totalFact = lista.reduce((t, n) => t + (n.estado === "cerrado" ? n.facturacion || 0 : 0), 0);
  const totalGan = lista.reduce((t, n) => t + (n.estado === "cerrado" ? n.ganancia || 0 : 0), 0);

  const trozo = document.createDocumentFragment();

  trozo.append(nodo(html`
    <section style="margin-bottom:14px">
      <p class="etiqueta">Negocios</p>
      <h1 class="titulo" style="font-size:27px;margin-top:4px">${lista.length} de ${todos.length}</h1>
      <p class="apunte">${plata(totalFact)} facturados · ${plata(totalGan)} de ganancia</p>
    </section>

    <section class="filtros">
      <select class="filtro" id="f-anio" aria-label="Año">
        <option value="todos">Todos los años</option>
        ${anios.map((a) => `<option value="${a}"${filtro.anio === a ? " selected" : ""}>${a}</option>`).join("")}
      </select>
      <select class="filtro" id="f-tipo" aria-label="Tipo">
        <option value="todos">Venta y alquiler</option>
        <option value="venta"${filtro.tipo === "venta" ? " selected" : ""}>Solo venta</option>
        <option value="alquiler"${filtro.tipo === "alquiler" ? " selected" : ""}>Solo alquiler</option>
      </select>
      <button class="filtro ${filtro.conAvisos ? "prendido" : ""}" id="f-avisos">
        ${filtro.conAvisos ? "● " : ""}Con pendientes
      </button>
    </section>
  `));

  const contenedor = document.createElement("div");
  contenedor.className = "lista";
  for (const n of lista) contenedor.append(fila(n, estado));
  if (!lista.length) {
    contenedor.append(nodo(html`<p class="pronto">Ningún negocio con esos filtros.</p>`));
  }
  trozo.append(contenedor);

  trozo.getElementById("f-anio").addEventListener("change", (e) => {
    filtro.anio = e.target.value;
    estado.redibujar();
  });
  trozo.getElementById("f-tipo").addEventListener("change", (e) => {
    filtro.tipo = e.target.value;
    estado.redibujar();
  });
  trozo.getElementById("f-avisos").addEventListener("click", () => {
    filtro.conAvisos = !filtro.conAvisos;
    estado.redibujar();
  });

  return trozo;
}

function fila(n, estado) {
  const anio = Number(estado.hoy.slice(0, 4));
  const avisos = (n.avisos || []).length;
  const trozo = nodo(html`
    <button class="fila" data-id="${n.id}">
      <span class="fila-cuerpo">
        <span class="fila-titulo">${escapar(n.direccion || "Sin dirección")}</span>
        <span class="fila-sub">
          ${escapar(n.barrio || "sin barrio")} · ${n.tipo_negocio} · ${fechaCorta(n.fecha_fin, anio)}
          ${n.estado === "en_curso" ? ' · <span class="chip-curso">en curso</span>' : ""}
        </span>
      </span>
      <span class="fila-derecha">
        <span class="cifra cifra-media">${plata(n.facturacion)}</span>
        ${avisos ? `<span class="chip-avisos">${avisos}</span>` : ""}
      </span>
    </button>
  `);
  trozo.querySelector(".fila").addEventListener("click", () => estado.irA("ficha", n.id));
  return trozo;
}
