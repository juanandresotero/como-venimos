/* La lista de los 85 negocios, con filtros. Tocar uno abre su ficha. */

import { plata, plataUSD, pct, fechaCorta, escapar } from "../lib/formato.js";
import { capas } from "../lib/salud.js";
import { crearNegocio } from "../lib/guardado.js";
import { ATAJOS, GRUPOS_ATAJOS, esBusqueda } from "../lib/motor.js";

const html = (c, ...v) => c.reduce((t, x, i) => t + x + (v[i] ?? ""), "");

function nodo(marca) {
  const molde = document.createElement("template");
  molde.innerHTML = marca.trim();
  return molde.content;
}

const filtro = { anio: "todos", tipo: "todos", conAvisos: false };
let altaAbierta = false;

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
      <p class="apunte">
        <strong>${plataUSD(totalGan)}</strong> a tu bolsillo · ${plataUSD(totalFact)} facturados
      </p>
    </section>

    <section class="filtros">
      <button class="filtro prendido" id="abrir-alta">+ Nuevo</button>
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

  if (altaAbierta) trozo.append(alta(estado));

  // Lo publicado que todavia no se movio. Vive aca y no en Salud porque es una lista de
  // propiedades sobre las que hay algo para HACER: entrar, revisar el precio, o apagarla
  // si no deberia contar. En Salud era un dato mas para mirar.
  const c = capas(estado.datos.negocios, estado.datos.cartera, estado.datos.ajustes,
    estado.hoy.slice(0, 4));
  if (c.publicado.detalle.length) trozo.append(loPotencial(c.publicado, estado));

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
  trozo.getElementById("abrir-alta").addEventListener("click", () => {
    altaAbierta = !altaAbierta;
    estado.redibujar();
  });

  return trozo;
}

/* El alta manual (§7.3), agrupada por lo que de verdad se carga desde acá.

   Si un negocio hay que cargarlo a mano es porque la propiedad NO está en tu cartera, y
   entonces el aviso casi siempre era de otro agente: es una búsqueda. Las ventas y
   alquileres propios quedan abajo, para la propiedad que el robot nunca llegó a ver. */
function alta(estado) {
  const seccion = nodo(html`
    <section class="tarjeta">
      <h2 class="titulo" style="font-size:17px;margin-bottom:4px">¿Qué querés cargar?</h2>
      <p class="apunte" style="margin-bottom:14px">
        Elegí y se abre la ficha con la regla de comisión ya puesta. Después completás
        precio y fechas.
      </p>
      <div id="atajos"></div>
    </section>
  `);
  const contenedor = seccion.getElementById("atajos");

  for (const grupo of GRUPOS_ATAJOS) {
    const claves = Object.keys(ATAJOS).filter((c) => ATAJOS[c].grupo === grupo.clave);
    if (!claves.length) continue;

    const bloque = nodo(html`
      <p class="etiqueta" style="margin-top:16px">${escapar(grupo.nombre)}</p>
      <p class="apunte" style="margin:2px 0 8px">${escapar(grupo.apunte)}</p>
      <div class="lista"></div>
    `);
    const lista = bloque.querySelector(".lista");

    for (const clave of claves) {
      const molde = ATAJOS[clave];
      const boton = nodo(html`
        <button class="fila" data-atajo="${clave}">
          <span class="fila-cuerpo">
            <span class="fila-titulo">${escapar(molde.nombre)}</span>
            <span class="fila-sub">${escapar(molde.explicacion)}</span>
          </span>
          <span class="fila-derecha"><span class="apunte">›</span></span>
        </button>
      `);
      boton.querySelector(".fila").addEventListener("click", () => {
        const nuevo = crearNegocio(estado, clave);
        altaAbierta = false;
        estado.irA("ficha", nuevo.id);
      });
      lista.append(boton);
    }
    contenedor.append(bloque);
  }
  return seccion;
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
          ${esBusqueda(n, estado.datos.ajustes) ? ' · <span class="chip-apagado">búsqueda</span>' : ""}
          ${n.estado === "en_curso" ? ' · <span class="chip-curso">en curso</span>' : ""}
        </span>
      </span>
      <span class="fila-derecha">
        <span class="fila-plata">
          <span class="cifra cifra-media">${plata(n.ganancia)}</span>
          <span class="fila-sub">${plata(n.facturacion)} fact.</span>
        </span>
        ${avisos ? `<span class="chip-avisos">${avisos}</span>` : ""}
      </span>
    </button>
  `);
  trozo.querySelector(".fila").addEventListener("click", () => estado.irA("ficha", n.id));
  return trozo;
}

/* Las propiedades publicadas que todavia no se movieron, una por una.

   Lo que se factura sale del negocio ya cargado si existe; si no, se estima con las
   puntas promedio del usuario. Tocar una abre su ficha de propiedad, donde se puede
   apagar para que deje de contar en la proyeccion. */
function loPotencial(publicado, estado) {
  const filas = publicado.detalle
    .map((p) => html`
      <button class="fila" data-propiedad="${escapar(p.entity_id)}">
        <span class="fila-cuerpo">
          <span class="fila-titulo">${escapar(p.direccion || "Sin dirección")}</span>
          <span class="fila-sub">
            ${plata(p.precio)}${p.estimado ? ` × ${pct(p.pct)}` : " · con tu negocio ya cargado"}
          </span>
        </span>
        <span class="fila-plata">
          <span class="cifra cifra-media">${plata(p.ganancia)}</span>
          <span class="fila-sub">${plata(p.facturacion)} fact.</span>
        </span>
      </button>`)
    .join("");

  const muestra = publicado.detalle.find((p) => p.estimado);
  const seccion = nodo(html`
    <section class="tarjeta">
      <div class="tarjeta-titulo">
        <h2 class="titulo" style="font-size:17px">Lo potencial, una por una</h2>
        <span class="apunte">${publicado.cantidad} publicadas · ${plataUSD(publicado.ganancia)}</span>
      </div>
      <div class="lista">${filas}</div>
      ${muestra
        ? html`<p class="apunte" style="margin-top:12px">
             El <strong>${pct(muestra.pct)}</strong> sale de tu propia forma de cerrar:
             ${pct(muestra.unaPunta)} de comisión por punta, y cerrás con
             <strong>${muestra.puntas.toFixed(2).replace(".", ",")} puntas</strong> en
             promedio. De ahí se descuenta tu tajada de hoy. Si alguna no debería contar,
             entrá y apagala.
           </p>`
        : ""}
    </section>
  `);
  for (const boton of seccion.querySelectorAll("[data-propiedad]")) {
    boton.addEventListener("click", () => estado.irA("propiedad", boton.dataset.propiedad));
  }
  return seccion;
}
