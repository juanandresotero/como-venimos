/* La cartera: las propiedades que hoy tenés publicadas, y el archivo de las que ya no.

   El orden no es alfabetico ni por precio: primero lo que esta mas cerca de cobrarse.
   Es la misma logica que la bandeja de pendientes — arriba va lo que puede ser plata. */

import { listar, estadoVisible, nombreEstado, diasEnCartera, rendimiento } from "../lib/cartera.js";
import { plata, plataUSD, escapar } from "../lib/formato.js";

const html = (c, ...v) => c.reduce((t, x, i) => t + x + (v[i] ?? ""), "");

function nodo(marca) {
  const molde = document.createElement("template");
  molde.innerHTML = marca.trim();
  return molde.content;
}

const filtro = { archivo: false };

export function dibujarCartera(estado) {
  const cartera = estado.datos.cartera || {};
  const activas = listar(cartera);
  const lista = filtro.archivo ? listar(cartera, { archivo: true }) : activas;

  const volumen = activas.reduce((t, p) => t + (p.precio || 0), 0);
  const cuenta = (clave) => activas.filter((p) => p.estado === clave).length;

  const trozo = document.createDocumentFragment();

  trozo.append(nodo(html`
    <section style="margin-bottom:14px">
      <p class="etiqueta">Tu cartera</p>
      <h1 class="titulo" style="font-size:27px;margin-top:4px">
        ${activas.length} ${activas.length === 1 ? "propiedad" : "propiedades"}
      </h1>
      <p class="apunte">
        ${plataUSD(volumen)} publicados ·
        ${cuenta("reservada")} ${cuenta("reservada") === 1 ? "reservada" : "reservadas"} ·
        ${cuenta("en_negociacion")} en negociación
      </p>
    </section>

    <section class="filtros">
      <button class="filtro ${filtro.archivo ? "" : "prendido"}" data-filtro="activas">Activas</button>
      <button class="filtro ${filtro.archivo ? "prendido" : ""}" data-filtro="archivo">
        Archivo (${listar(cartera, { archivo: true }).length})
      </button>
    </section>
  `));

  const contenedor = document.createElement("div");
  contenedor.className = "lista";
  for (const p of lista) contenedor.append(fila(p, estado));
  if (!lista.length) {
    contenedor.append(nodo(html`<p class="pronto">
      ${filtro.archivo
        ? "Todavía no se fue ninguna propiedad de tu cartera."
        : "El robot no encontró propiedades publicadas."}
    </p>`));
  }
  trozo.append(contenedor);

  for (const boton of trozo.querySelectorAll("[data-filtro]")) {
    boton.addEventListener("click", () => {
      filtro.archivo = boton.dataset.filtro === "archivo";
      estado.redibujar();
    });
  }

  return trozo;
}

const CLASE_ESTADO = {
  reservada: "chip-reservada",
  en_negociacion: "chip-negociacion",
  publicada: "chip-publicada",
  vendida: "chip-reservada",
  alquilada: "chip-reservada",
  caida: "chip-caida",
  retirada: "chip-caida",
  desaparecida: "chip-caida",
};

function fila(p, estado) {
  const clave = estadoVisible(p);
  const dias = diasEnCartera(p, estado.hoy);
  const r = rendimiento(estado.datos.negocios, p.entity_id);
  const trozo = nodo(html`
    <button class="fila" data-id="${escapar(p.entity_id)}">
      <span class="fila-cuerpo">
        <span class="fila-titulo">${escapar(p.direccion || p.titulo || "Sin dirección")}</span>
        <span class="fila-sub">
          ${escapar(p.barrio || "sin barrio")} · ${escapar(p.tipo || "")} ·
          <span class="chip-estado ${CLASE_ESTADO[clave] || ""}">${nombreEstado(clave)}</span>
          ${dias !== null ? ` · ${dias} días` : ""}
          ${r.cerrados ? ` · <strong>${plata(r.facturacion)}</strong> dados` : ""}
        </span>
      </span>
      <span class="fila-derecha">
        <span class="cifra cifra-media">${plata(p.precio)}</span>
        ${p.usar_en_proyeccion === false ? '<span class="chip-apagado">fuera</span>' : ""}
      </span>
    </button>
  `);
  trozo.querySelector(".fila").addEventListener("click", () =>
    estado.irA("propiedad", p.entity_id)
  );
  return trozo;
}
