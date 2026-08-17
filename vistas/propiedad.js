/* La ficha de una propiedad de la cartera.

   Arriba lo que ya dio de plata, porque una propiedad de alquiler que rota puede rendir
   mas que una venta y en el Excel eso no se veia. Despues la linea de tiempo, y al final
   lo que hay que completar a mano. */

import {
  estadoVisible, nombreEstado, lineaDeTiempo, diasEnCartera, desdeCuando,
  negociosDe, rendimiento, DESENLACES,
} from "../lib/cartera.js";
import { ORIGENES } from "../lib/catalogos.js";
import { editarPropiedad, crearNegocio } from "../lib/guardado.js";
import { plata, plataUSD, fechaCorta, escapar, fechaRazonable } from "../lib/formato.js";

const html = (c, ...v) => c.reduce((t, x, i) => t + x + (v[i] ?? ""), "");

function nodo(marca) {
  const molde = document.createElement("template");
  molde.innerHTML = marca.trim();
  return molde.content;
}

export function dibujarPropiedad(estado) {
  const p = (estado.datos.cartera || {})[estado.foco];
  if (!p) {
    const vacio = document.createDocumentFragment();
    vacio.append(nodo(html`<p class="pronto">No se encontró esa propiedad.</p>`));
    return vacio;
  }

  const trozo = document.createDocumentFragment();
  trozo.append(cabecera(p, estado));
  trozo.append(acciones(p, estado));
  trozo.append(plataQueDio(p, estado));
  trozo.append(datosDelRobot(p));
  trozo.append(tiempo(p));
  trozo.append(campos(p, estado));
  return trozo;
}

function cabecera(p, estado) {
  const clave = estadoVisible(p);
  const dias = diasEnCartera(p, estado.hoy);
  const marca = nodo(html`
    <section style="margin-bottom:14px">
      <button class="boton" id="volver" style="padding:8px 13px;font-size:13px">‹ Cartera</button>
      <p class="etiqueta" style="margin-top:14px">
        ${escapar(p.operacion || "")} · ${escapar(p.tipo || "")} · ${escapar(p.internal_id || "")}
      </p>
      <h1 class="titulo" style="font-size:24px;margin-top:4px">
        ${escapar(p.direccion || p.titulo || "Sin dirección")}
      </h1>
      <p class="apunte">
        ${escapar(p.barrio || "sin barrio")} ·
        <span class="chip-estado">${nombreEstado(clave)}</span>
        ${dias !== null ? ` · ${dias} días ${p.activa ? "en tu cartera" : "estuvo en tu cartera"}` : ""}
      </p>
      <p class="cifra cifra-grande" style="margin-top:12px">${plataUSD(p.precio)}</p>
    </section>
  `);
  marca.getElementById("volver").addEventListener("click", () => estado.irA("cartera"));
  return marca;
}

/* Una propiedad puede generar muchos negocios (se alquila cinco veces y después se vende),
   pero lo normal al entrar es querer SEGUIR con el que ya está, no abrir otro.

   Antes el único botón decía "Cargar un negocio de acá" y creaba uno nuevo siempre. Con
   eso se armó un duplicado sobre Flammarión sin que nadie se diera cuenta. */
function acciones(p, estado) {
  const abiertos = negociosDe(estado.datos.negocios, p.entity_id)
    .filter((n) => n.estado !== "cerrado");
  const enCurso = abiertos[0] || null;
  const hubo = negociosDe(estado.datos.negocios, p.entity_id).length > 0;

  const marca = nodo(html`
    <section class="tarjeta">
      ${enCurso
        ? html`<p class="apunte" style="margin:0 0 10px">
             Esta propiedad ya tiene un negocio abierto. Lo normal es seguir con ese.
           </p>`
        : ""}
      <div class="botonera" style="margin-top:0">
        ${enCurso
          ? html`<button class="boton boton-primario" id="seguir-negocio">Seguir con su negocio</button>
                 <button class="boton" id="nuevo-negocio">Cargar otro negocio</button>`
          : html`<button class="boton boton-primario" id="nuevo-negocio">
               ${hubo ? "Cargar otro negocio de acá" : "Cargar el negocio de esta propiedad"}
             </button>`}
        ${p.operacion === "venta"
          ? html`<button class="boton" id="calcular-renta">Calcular su renta</button>`
          : ""}
        ${p.link ? html`<a class="boton" href="${escapar(p.link)}" target="_blank" rel="noopener">Ver en RE/MAX</a>` : ""}
      </div>
      <p class="apunte" id="aviso-otro" style="margin-top:10px" hidden></p>
    </section>
  `);

  const seguir = marca.getElementById("seguir-negocio");
  if (seguir) seguir.addEventListener("click", () => estado.irA("ficha", enCurso.id));

  const botonNuevo = marca.getElementById("nuevo-negocio");
  const avisoOtro = marca.getElementById("aviso-otro");

  botonNuevo.addEventListener("click", () => {
    // Si ya hay uno abierto, se pide confirmar: crear dos por la misma venta es el error
    // que este boton provocaba sin avisar.
    if (enCurso && botonNuevo.dataset.seguro !== "si") {
      botonNuevo.dataset.seguro = "si";
      botonNuevo.textContent = "Sí, es otro negocio distinto";
      avisoOtro.hidden = false;
      avisoOtro.textContent =
        `Ojo: ya tenés "${enCurso.direccion || "un negocio"}" abierto en esta propiedad. `
        + `Esto crea uno SEPARADO, para cuando de verdad son dos (un alquiler que se `
        + `renueva, por ejemplo). Si querés corregir el que ya está, tocá "Seguir con su negocio".`;
      return;
    }
    const atajo = p.operacion === "alquiler" ? "alquiler" : "venta";
    // Las fechas del camino ya las sabe el robot: cuándo se publicó, cuándo pasó a
    // negociación y cuándo quedó reservada. No hay por qué volver a pedirlas.
    const nuevo = crearNegocio(estado, atajo, {
      entity_id_cartera: p.entity_id,
      direccion: p.direccion || "",
      barrio: p.barrio || "",
      tipo_propiedad: p.tipo || null,
      precio_operacion: p.precio ?? null,
      origen_captacion: p.origen_captacion || null,
      fecha_inicio: desdeCuando(p),
      fecha_negociacion: p.fecha_negociacion || null,
      fecha_boleto: p.fecha_reservada || null,
    });
    estado.irA("ficha", nuevo.id);
  });

  const renta = marca.getElementById("calcular-renta");
  if (renta) {
    renta.addEventListener("click", () => {
      estado.precargaRenta = {
        precio: p.precio,
        titulo: p.direccion || p.titulo || "",
      };
      estado.irA("renta");
    });
  }
  return marca;
}

function plataQueDio(p, estado) {
  const r = rendimiento(estado.datos.negocios, p.entity_id);
  if (!r.negocios) {
    return nodo(html`
      <section class="tarjeta">
        <h2 class="titulo" style="font-size:17px;margin-bottom:6px">Todavía no dio plata</h2>
        <p class="apunte">
          Cuando cierres un negocio de esta propiedad, cargalo con el botón de arriba y
          queda enganchado acá.
        </p>
      </section>
    `);
  }

  const lista = negociosDe(estado.datos.negocios, p.entity_id);
  const anio = Number(estado.hoy.slice(0, 4));
  const marca = nodo(html`
    <section class="tarjeta">
      <div class="tarjeta-titulo">
        <h2 class="titulo" style="font-size:17px">Lo que dio esta propiedad</h2>
        <span class="apunte">${r.negocios} ${r.negocios === 1 ? "negocio" : "negocios"}</span>
      </div>
      <div class="datos">
        <div class="dato"><span class="dato-nombre">Facturado</span><span class="dato-valor">${plata(r.facturacion)}</span></div>
        <div class="dato"><span class="dato-nombre">A tu bolsillo</span><span class="dato-valor">${plataUSD(r.ganancia)}</span></div>
      </div>
      <div class="lista" style="margin-top:12px">
        ${lista.map((n) => html`
          <button class="fila" data-negocio="${escapar(n.id)}">
            <span class="fila-cuerpo">
              <span class="fila-titulo">${escapar(n.tipo_negocio)} · ${fechaCorta(n.fecha_fin, anio)}</span>
              <span class="fila-sub">${n.estado === "cerrado" ? "cobrado" : "en curso"}</span>
            </span>
            <span class="cifra cifra-media">${plata(n.facturacion)}</span>
          </button>`).join("")}
      </div>
    </section>
  `);
  for (const boton of marca.querySelectorAll("[data-negocio]")) {
    boton.addEventListener("click", () => estado.irA("ficha", boton.dataset.negocio));
  }
  return marca;
}

function datosDelRobot(p) {
  const filas = [
    ["Precio", plataUSD(p.precio)],
    ["Gastos comunes", p.gastos_comunes ? `${plata(p.gastos_comunes)} ${p.moneda_gastos || ""}` : "—"],
    ["Dormitorios / baños", `${p.dormitorios ?? "—"} / ${p.banos ?? "—"}`],
    ["Metros cubiertos", p.m2_cubierto ? `${plata(p.m2_cubierto)} m²` : "—"],
    ["Metros de terreno", p.m2_terreno ? `${plata(p.m2_terreno)} m²` : "—"],
    ["La vio el robot", `${p.visto_primera_vez || "—"} → ${p.visto_ultima_vez || "—"}`],
  ];
  return nodo(html`
    <section class="tarjeta">
      <div class="tarjeta-titulo">
        <h2 class="titulo" style="font-size:17px">Lo que trae RE/MAX</h2>
        <span class="apunte">lo carga el robot</span>
      </div>
      <div class="datos">
        ${filas.map(([nombre, valor]) => html`
          <div class="dato"><span class="dato-nombre">${nombre}</span><span class="dato-valor">${escapar(valor)}</span></div>`).join("")}
      </div>
    </section>
  `);
}

function tiempo(p) {
  const hitos = lineaDeTiempo(p);
  if (!hitos.length) return document.createDocumentFragment();
  return nodo(html`
    <section class="tarjeta">
      <h2 class="titulo" style="font-size:17px;margin-bottom:14px">Cómo viene</h2>
      <ol class="tiempo">
        ${hitos.map((h) => html`
          <li class="tiempo-hito">
            <span class="tiempo-fecha">${h.fecha}</span>
            <span class="tiempo-titulo">${escapar(h.titulo)}</span>
            ${h.detalle ? html`<span class="tiempo-detalle">${escapar(h.detalle)}</span>` : ""}
          </li>`).join("")}
      </ol>
    </section>
  `);
}

function campos(p, estado) {
  const seccion = nodo(html`
    <section class="tarjeta" style="padding:0;overflow:hidden">
      <div class="campo-fila" style="background:var(--lienzo-2)">
        <label style="font-weight:700;color:var(--tinta)">Lo que cargás vos</label>
      </div>
      <div id="campos-propiedad"></div>
    </section>
  `);
  const contenedor = seccion.getElementById("campos-propiedad");

  const agregar = (clave, etiqueta, tipo, valor, opciones, falta) => {
    const fila = document.createElement("div");
    fila.className = `campo-fila${falta ? " falta" : ""}`;
    const id = `prop-${clave}`;
    fila.innerHTML = html`
      <label for="${id}">${etiqueta}${falta ? " — falta" : ""}</label>
      ${opciones
        ? html`<select class="campo" id="${id}">
             <option value=""></option>
             ${opciones.map(([v, t]) => `<option value="${escapar(v)}"${String(v) === String(valor ?? "") ? " selected" : ""}>${escapar(t)}</option>`).join("")}
           </select>`
        : html`<input class="campo" id="${id}" type="${tipo}" value="${escapar(valor ?? "")}">`}
    `;
    const control = fila.querySelector(".campo");
    control.addEventListener("change", () => {
      // El navegador avisa del cambio mientras se tipea el año: no guardar a medio escribir.
      if (tipo === "date" && !fechaRazonable(control.value)) return;
      const cambios = { [clave]: control.value || null };
      // Si toca la fecha de captacion, deja de ser una estimacion del robot.
      if (clave === "fecha_captacion_real") cambios.fecha_captacion_estimada = false;
      editarPropiedad(estado, p.entity_id, cambios);
      estado.redibujar();
    });
    contenedor.append(fila);
  };

  agregar("fecha_captacion_real", "Cuándo la captaste de verdad", "date",
    p.fecha_captacion_real, null, p.fecha_captacion_estimada);
  agregar("origen_captacion", "De dónde salió", null, p.origen_captacion,
    ORIGENES.map((o) => [o, o]), !p.origen_captacion);
  if (!p.activa) {
    agregar("desenlace_confirmado", "Qué pasó al final", null, p.desenlace_confirmado,
      DESENLACES, !p.desenlace_confirmado);
  }
  agregar("notas", "Notas", "text", p.notas);

  // La proyeccion se apaga sola cuando el robot sospecha que es la misma propiedad
  // publicada dos veces. La ultima palabra es del usuario.
  const conmutador = document.createElement("div");
  conmutador.className = "campo-fila";
  conmutador.innerHTML = html`
    <label>Entra en la proyección de Salud</label>
    <div class="botonera" style="margin-top:4px">
      <button class="filtro ${p.usar_en_proyeccion === false ? "" : "prendido"}" data-usar="si">Sí</button>
      <button class="filtro ${p.usar_en_proyeccion === false ? "prendido" : ""}" data-usar="no">No</button>
    </div>
    ${p.posible_duplicado_de
      ? html`<p class="apunte" style="margin-top:8px">
           El robot la marcó como posible copia de otra publicación tuya. Si no lo es,
           volvé a prenderla.</p>`
      : ""}
  `;
  for (const boton of conmutador.querySelectorAll("[data-usar]")) {
    boton.addEventListener("click", () => {
      editarPropiedad(estado, p.entity_id, { usar_en_proyeccion: boton.dataset.usar === "si" });
      estado.redibujar();
    });
  }
  contenedor.append(conmutador);

  return seccion;
}
