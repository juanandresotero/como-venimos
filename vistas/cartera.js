/* La cartera: las propiedades que hoy tenés publicadas, y el archivo de las que ya no.

   El orden no es alfabetico ni por precio: primero lo que esta mas cerca de cobrarse.
   Es la misma logica que la bandeja de pendientes — arriba va lo que puede ser plata. */

import { listar, estadoVisible, nombreEstado, diasEnCartera, rendimiento } from "../lib/cartera.js";
import { plata, plataUSD, fechaCorta, escapar } from "../lib/formato.js";
import { esBusqueda } from "../lib/motor.js";

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

  /* Las BUSQUEDAS que siguen abiertas tambien son trabajo vivo, aunque no sean propiedades
     tuyas: hay un comprador buscando y una operacion por cerrar. El robot no las ve nunca
     — el aviso es de otro agente — asi que si no aparecen aca, la cartera muestra menos de
     lo que de verdad tenés en marcha. Van al final y aparte, porque no son publicaciones
     tuyas y no se pueden proyectar como las otras. */
  if (!filtro.archivo) trozo.append(busquedasAbiertas(estado));

  for (const boton of trozo.querySelectorAll("[data-filtro]")) {
    boton.addEventListener("click", () => {
      filtro.archivo = boton.dataset.filtro === "archivo";
      estado.redibujar();
    });
  }

  return trozo;
}

function busquedasAbiertas(estado) {
  const abiertas = (estado.datos.negocios || []).filter(
    (n) => n.estado !== "cerrado" && esBusqueda(n, estado.datos.ajustes)
  );
  if (!abiertas.length) return document.createDocumentFragment();

  const anio = Number(estado.hoy.slice(0, 4));
  const trozo = nodo(html`
    <div class="separador-indicadores">
      <span class="separador-nombre">Negocios · búsquedas abiertas · ${abiertas.length}</span>
    </div>
    <p class="apunte" style="margin:-4px 0 10px">
      La propiedad es de otro agente y vos tenés el comprador. El robot no las ve.
    </p>
    <div class="lista" id="lista-busquedas"></div>
  `);

  const lista = trozo.getElementById("lista-busquedas");
  for (const n of abiertas) {
    const fila = nodo(html`
      <button class="fila" data-negocio="${escapar(n.id)}">
        <span class="fila-cuerpo">
          <span class="fila-titulo">${escapar(n.direccion || "Sin dirección")}</span>
          <span class="fila-sub">
            ${escapar(n.barrio || "sin barrio")} · ${escapar(n.tipo_negocio || "")} ·
            <span class="chip-curso">en curso</span>
            ${n.fecha_negociacion ? ` · desde ${fechaCorta(n.fecha_negociacion, anio)}` : ""}
          </span>
        </span>
        <span class="fila-derecha">
          <span class="fila-plata">
            <span class="cifra cifra-media">${plata(n.precio_operacion)}</span>
            ${n.ganancia ? `<span class="fila-sub">${plata(n.ganancia)} tuyos</span>` : ""}
          </span>
        </span>
      </button>
    `);
    fila.querySelector(".fila").addEventListener("click", () =>
      estado.irA("ficha", n.id)
    );
    lista.append(fila);
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
          ${r.cerrados ? ` · dio <strong>${plata(r.ganancia)}</strong> de ${plata(r.facturacion)}` : ""}
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
