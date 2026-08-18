/* La ficha de un negocio, editable.

   Los campos que faltan se pintan en rojo, para que se vea de un golpe que hay que
   completar. Cada cambio se aplica al instante y queda en la cola para subir. */

import { editarNegocio, borrarNegocio } from "../lib/guardado.js";
import {
  plata, plataUSD, escapar, fechaRazonable, numeroDesde, formatearMientrasEscribe,
} from "../lib/formato.js";
import { esBusqueda, puntasSegunAgentes, momentoDeLaPropiedad } from "../lib/motor.js";
import {
  AGENTES, AGENTES_QUE_LLEVAN_NOMBRE, ORIGENES, EXPLICACION_ORIGEN,
  ORIGENES_QUE_LLEVAN_NOMBRE,
  MARCAS, marcaActual, admiteMarcas, TIPOS_NEGOCIO, regimenDe,
} from "../lib/catalogos.js";
import { ROLES, enlaceWhatsapp, hayPicker, elegirContacto } from "../lib/contactos.js";
import { sugerencias } from "../lib/cruce.js";

const html = (c, ...v) => c.reduce((t, x, i) => t + x + (v[i] ?? ""), "");

function nodo(marca) {
  const molde = document.createElement("template");
  molde.innerHTML = marca.trim();
  return molde.content;
}

/* Los valores del Excel no son sólo estos tres, así que el que ya está cargado se
   conserva como opción en vez de perderse al abrir el desplegable. */
function opcionesCon(lista, actual) {
  const opciones = lista.map((v) => (Array.isArray(v) ? v : [v, v]));
  if (actual && !opciones.some(([v]) => String(v) === String(actual))) {
    opciones.unshift([actual, actual]);
  }
  return opciones;
}

const TIPOS = Object.fromEntries(TIPOS_NEGOCIO);

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
        <div class="dato"><span class="dato-nombre">Facturación RE/MAX</span><span class="dato-valor">${plataUSD(n.facturacion)}</span></div>
        <div class="dato"><span class="dato-nombre">A tu bolsillo</span><span class="dato-valor">${plataUSD(n.ganancia)}</span></div>
      </div>
      <p class="apunte" style="margin-top:12px">${escapar(explicarRegimen(n))}</p>
    </section>
  `));

  trozo.append(campos(n, falta, estado));
  trozo.append(propiedadVinculada(n, estado));
  trozo.append(gente(n, estado));
  trozo.append(avisos(n));
  trozo.append(fichaCompleta(n, estado));
  if (n.manual) trozo.append(borrar(n, estado));

  trozo.getElementById("volver").addEventListener("click", () => estado.irA("negocios"));
  return trozo;
}

/* Un negocio puede colgar de una propiedad de la cartera. Los importados del Excel no
   cuelgan de ninguna y esta bien: son de antes de que existiera el robot. */
function propiedadVinculada(n, estado) {
  const cartera = estado.datos.cartera || {};
  const propuestas = sugerencias(n, cartera);

  const marca = nodo(html`
    <section class="tarjeta" style="padding:0;overflow:hidden">
      ${propuestas.length
        ? html`<div class="campo-fila falta">
             <label>¿Es una propiedad de tu cartera?</label>
             <p class="apunte" style="margin:2px 0 8px">
               Si lo es, dejo de pedirte las fechas que todavía no existen.
             </p>
             <div class="botonera" style="margin-top:0">
               ${propuestas.slice(0, 3).map((x) => html`
                 <button class="boton boton-primario" data-enganchar="${escapar(x.propiedad.entity_id)}"
                         style="padding:9px 14px;font-size:13px">
                   Sí, es ${escapar(x.propiedad.direccion || x.propiedad.titulo)}
                 </button>`).join("")}
               <button class="filtro" id="no-es-ninguna">No es ninguna</button>
             </div>
           </div>`
        : ""}
      <div class="campo-fila">
        <label for="campo-propiedad">Propiedad de tu cartera</label>
        <select class="campo" id="campo-propiedad">
          <option value="">Ninguna — no está en la cartera</option>
          ${Object.values(cartera)
            .sort((a, b) => (a.direccion || "").localeCompare(b.direccion || ""))
            .map((p) => `<option value="${escapar(p.entity_id)}"${p.entity_id === n.entity_id_cartera ? " selected" : ""}>${
              escapar(p.direccion || p.titulo || p.entity_id)}${p.activa ? "" : " (archivada)"}</option>`)
            .join("")}
        </select>
        ${n.entity_id_cartera && cartera[n.entity_id_cartera]
          ? html`<div class="botonera" style="margin-top:6px">
               <button class="filtro" id="ver-propiedad">Ver la propiedad</button>
             </div>`
          : ""}
      </div>
    </section>
  `);

  marca.getElementById("campo-propiedad").addEventListener("change", (evento) => {
    editarNegocio(estado, n.id, { entity_id_cartera: evento.target.value || null });
    estado.redibujar();
  });
  for (const boton of marca.querySelectorAll("[data-enganchar]")) {
    boton.addEventListener("click", () => {
      editarNegocio(estado, n.id, { entity_id_cartera: boton.dataset.enganchar });
      estado.redibujar();
    });
  }
  // "No es ninguna" se anota, si no la sugerencia volvería a aparecer en cada arranque.
  const ninguna = marca.getElementById("no-es-ninguna");
  if (ninguna) {
    ninguna.addEventListener("click", () => {
      editarNegocio(estado, n.id, { sin_propiedad_en_cartera: true });
      estado.redibujar();
    });
  }

  const ver = marca.getElementById("ver-propiedad");
  if (ver) ver.addEventListener("click", () => estado.irA("propiedad", n.entity_id_cartera));
  return marca;
}

/* La gente del negocio (§7.6). Con el tiempo esto arma solo su BDR: la lista de quienes
   ya operaron con el, que es el canal que mas ganancia le da. */
function gente(n, estado) {
  const seccion = nodo(html`
    <section class="tarjeta">
      <div class="tarjeta-titulo">
        <h2 class="titulo" style="font-size:17px">Los clientes</h2>
        <span class="apunte">${hayPicker() ? "desde tu agenda" : "con WhatsApp"}</span>
      </div>
      <div id="roles"></div>
    </section>
  `);
  const contenedor = seccion.getElementById("roles");

  for (const [clave, etiqueta] of ROLES) {
    const persona = n[clave] || {};
    const url = enlaceWhatsapp(persona.telefono);
    const bloque = document.createElement("div");
    bloque.className = "persona";
    bloque.innerHTML = html`
      <label class="etiqueta" for="nombre-${clave}">${etiqueta}</label>
      <div class="persona-campos">
        <input class="campo" id="nombre-${clave}" type="text" placeholder="Nombre"
               value="${escapar(persona.nombre || "")}">
        <input class="campo" id="tel-${clave}" type="tel" inputmode="tel" placeholder="Teléfono"
               value="${escapar(persona.telefono || "")}">
      </div>
      <div class="botonera" style="margin-top:6px">
        ${hayPicker() ? html`<button class="filtro" data-agenda="${clave}">Elegir de la agenda</button>` : ""}
        ${url ? html`<a class="filtro" href="${url}" target="_blank" rel="noopener">WhatsApp</a>` : ""}
      </div>
    `;

    const guardar = () => {
      const nombre = bloque.querySelector(`#nombre-${clave}`).value.trim();
      const telefono = bloque.querySelector(`#tel-${clave}`).value.trim();
      editarNegocio(estado, n.id, {
        [clave]: nombre || telefono ? { nombre, telefono } : null,
      });
      estado.redibujar();
    };
    bloque.querySelector(`#nombre-${clave}`).addEventListener("change", guardar);
    bloque.querySelector(`#tel-${clave}`).addEventListener("change", guardar);

    const agenda = bloque.querySelector("[data-agenda]");
    if (agenda) {
      agenda.addEventListener("click", async () => {
        const elegido = await elegirContacto();
        if (!elegido) return;
        editarNegocio(estado, n.id, { [clave]: elegido });
        estado.redibujar();
      });
    }
    contenedor.append(bloque);
  }
  return seccion;
}

function borrar(n, estado) {
  const seccion = nodo(html`
    <section class="tarjeta">
      <p class="apunte" style="margin-bottom:12px">
        Este negocio lo cargaste a mano. Si lo creaste sin querer, lo podés borrar.
      </p>
      <button class="boton boton-borrar" id="borrar-negocio">Borrar este negocio</button>
    </section>
  `);
  const boton = seccion.getElementById("borrar-negocio");
  boton.addEventListener("click", () => {
    if (boton.dataset.seguro !== "si") {
      boton.dataset.seguro = "si";
      boton.textContent = "Tocá otra vez para borrarlo de verdad";
      return;
    }
    borrarNegocio(estado, n.id);
    estado.irA("negocios");
  });
  return seccion;
}

function campos(n, falta, estado) {
  const seccion = nodo(html`
    <section class="tarjeta" style="padding:0;overflow:hidden">
      <div class="datos" id="campos"></div>
    </section>
  `);
  const contenedor = seccion.getElementById("campos");

  /* `faltaExtra` marca en rojo un campo cuyo aviso no sigue el patrón falta_<clave>.
     `derivar` deja que un campo actualice a otro: cambiar quién puso cada lado recalcula
     las puntas, que son las que deciden la plata. */
  const agregar = (clave, etiqueta, tipo, valor, opciones, faltaExtra, derivar) => {
    const faltaEste = faltaExtra || falta.has(`falta_${clave}`) || falta.has(`sin_${clave}`);
    const fila = document.createElement("div");
    fila.className = `campo-fila${faltaEste ? " falta" : ""}`;
    const id = `campo-${clave}`;
    // Los montos van en un campo de texto para poder mostrarlos con los puntos de miles:
    // un <input type="number"> no los admite y 100000 se lee peor que 100.000.
    const esMoneda = tipo === "moneda";
    fila.innerHTML = html`
      <label for="${id}">${etiqueta}${faltaEste ? " — falta" : ""}</label>
      ${opciones
        ? html`<select class="campo" id="${id}">
             ${opciones.map(([v, t]) => `<option value="${escapar(v)}"${String(v) === String(valor ?? "") ? " selected" : ""}>${escapar(t)}</option>`).join("")}
           </select>`
        : esMoneda
          ? html`<input class="campo" id="${id}" type="text" inputmode="decimal"
                   value="${escapar(valor === null || valor === undefined ? "" : plata(valor))}">`
          : html`<input class="campo" id="${id}" type="${tipo}" value="${escapar(valor ?? "")}"${tipo === "number" ? ' step="any"' : ""}>`}
    `;
    const control = fila.querySelector(".campo");
    // Los puntos de miles aparecen mientras se escribe, no al saltar de celda.
    if (esMoneda) formatearMientrasEscribe(control);
    control.addEventListener("change", () => {
      const crudo = control.value;
      // El navegador avisa del cambio mientras se tipea el año: no guardar a medio escribir.
      if (tipo === "date" && !fechaRazonable(crudo)) return;
      let nuevo;
      if (esMoneda) nuevo = numeroDesde(crudo);
      else if (tipo === "number") nuevo = crudo === "" ? null : Number(crudo);
      else nuevo = crudo || null;
      const extra = derivar ? derivar(nuevo) : {};
      editarNegocio(estado, n.id, { [clave]: nuevo, ...extra });
      estado.redibujar();
    });
    contenedor.append(fila);
  };

  /* Las cuatro fechas del camino de una propiedad: se publica, pasa a negociación, queda
     reservada y se cierra. De 2026 en adelante el robot llena las tres primeras solo,
     porque le hace seguimiento a la cartera todos los días.

     Los alquileres casi nunca pasan por negociación: el campo está, pero se avisa que lo
     normal es que quede vacío. */
  const esAlquiler = n.tipo_negocio !== "venta";
  agregar("fecha_inicio", "1 · Cuándo se publicó", "date", n.fecha_inicio);
  agregar(
    "fecha_negociacion",
    `2 · Cuándo pasó a negociación${esAlquiler ? " (los alquileres casi nunca pasan por acá)" : ""}`,
    "date",
    n.fecha_negociacion
  );
  agregar("fecha_boleto", "3 · Cuándo quedó reservada (boleto)", "date", n.fecha_boleto);
  agregar("fecha_fin", "4 · Cuándo cerró y cobraste", "date", n.fecha_fin);
  agregar("direccion", "Dirección", "text", n.direccion);
  agregar("barrio", "Barrio", "text", n.barrio);
  agregar("precio_operacion", "Precio de la operación (USD)", "moneda", n.precio_operacion);
  agregar("pct_comision_total", "% de comisión (0,03 = 3%)", "number", n.pct_comision_total);

  agregarAgentes(contenedor, n, falta, estado, agregar);

  /* Las puntas son las de la OPERACIÓN, no las tuyas: una suplencia o un referido que
     diste igual se hace sobre un negocio de una o de dos puntas, y eso es lo que fija la
     comisión total. Por eso no hay opción "cero". */
  agregar("puntas", "Puntas de la operación", "number", n.puntas,
    opcionesCon([[1, "1 punta"], [2, "2 puntas"]], n.puntas));

  // En una búsqueda no hubo captación: lo que salió de algún lado es el COMPRADOR.
  agregar(
    "origen_captacion",
    esBusqueda(n, estado.datos.ajustes) ? "Cómo llegó el comprador" : "Cómo llegó",
    "text",
    n.origen_captacion,
    opcionesCon([["", "sin cargar"], ...ORIGENES.map(
      (o) => [o, EXPLICACION_ORIGEN[o] ? `${o} — ${EXPLICACION_ORIGEN[o]}` : o]
    )], n.origen_captacion),
    falta.has("origen_sin_clasificar"),
    // Al cambiar de origen, el nombre de quien referia deja de tener sentido.
    (valor) => (ORIGENES_QUE_LLEVAN_NOMBRE.has(valor) ? {} : { origen_quien: null })
  );

  /* El origen ya dice quién refirió. Lo único que falta saber es quién en concreto, y solo
     cuando el que refiere es un grupo, una oficina o un cliente. */
  if (ORIGENES_QUE_LLEVAN_NOMBRE.has(n.origen_captacion)) {
    agregar("origen_quien", "  ↳ ¿Quién en concreto?", "text", n.origen_quien);
  }

  agregarMarcas(contenedor, n, estado);

  agregar("tipo_negocio", "Tipo", "text", n.tipo_negocio, opcionesCon(TIPOS_NEGOCIO, n.tipo_negocio));
  agregar("notas", "Notas", "text", n.notas);

  return seccion;
}

/* Quién puso cada lado, y quién refirió a quién. Son cuatro veces la misma lista corta de
   gente de la casa, así que se dibujan igual.

   Es información interna: no lleva teléfono. Los que sí lo llevan son los clientes, que
   van más abajo con su botón de WhatsApp. */
function agregarAgentes(contenedor, n, falta, estado, agregar) {
  const faltanAgentes = falta.has("faltan_agentes");

  const lado = (clave, etiqueta, esUnLadoDelNegocio) => {
    // Vacío no es un agujero: quiere decir "nadie", o sea que es tuyo y lo trabajaste vos.
    const vacio = esUnLadoDelNegocio ? "sin cargar" : "Nadie";
    agregar(clave, etiqueta, "text", n[clave],
      opcionesCon([["", vacio], ...AGENTES], n[clave]),
      esUnLadoDelNegocio && faltanAgentes,
      (valor) => {
        // Al elegir una oficina o el Team, el nombre de la persona concreta que había
        // deja de tener sentido si se cambia a otra cosa.
        const extra = AGENTES_QUE_LLEVAN_NOMBRE.has(valor) ? {} : { [`${clave}_nombre`]: null };
        if (!esUnLadoDelNegocio) return extra;
        const otroLado = clave === "agente_vende" ? n.agente_compra : n.agente_vende;
        const vende = clave === "agente_vende" ? valor : otroLado;
        const compra = clave === "agente_compra" ? valor : otroLado;
        const puntas = puntasSegunAgentes(vende, compra, estado.datos.ajustes);
        /* Si ningún lado es tuyo, las puntas de la OPERACIÓN no se pueden deducir: puede
           haber sido de una o de dos igual. Se deja lo que haya en vez de poner cero. */
        return puntas ? { ...extra, puntas } : extra;
      });

    // "Team", "Ofi Único" y "Otra Oficina" son un grupo, no una persona: se puede anotar
    // de quién se trata. En Juan y en Martín no hace falta, ya son alguien.
    if (AGENTES_QUE_LLEVAN_NOMBRE.has(n[clave])) {
      agregar(`${clave}_nombre`, "  ↳ ¿Quién en concreto?", "text", n[`${clave}_nombre`]);
    }
  };

  lado("agente_vende", "Quién tenía el aviso", true);
  lado("agente_compra", "Quién trajo al comprador", true);

  /* "A quién se lo referiste" solo tiene sentido si efectivamente lo referiste. Y "quién
     te lo refirió" desapareció: era la misma pregunta que "cómo llegó el negocio". */
  if (n.yo_referi) lado("referido_a", "A quién se lo referiste", false);
}

/* Suplencia y "yo la referí" van sueltas del origen: un negocio puede llegar por "Dueño
   Vende" y después referirse igual. Son excluyentes entre sí, así que se ofrecen como una
   sola elección de tres en vez de dos casillas que se pueden contradecir.

   No aparecen si la propiedad está en la cartera: si la estás trabajando vos, no es ni una
   suplencia ni algo que le pasaste a otro. */
function agregarMarcas(contenedor, n, estado) {
  if (!admiteMarcas(n)) return;

  const fila = document.createElement("div");
  fila.className = "campo-fila";
  const actual = marcaActual(n);
  fila.innerHTML = html`
    <label for="campo-marca">¿Es una suplencia o la referiste?</label>
    <select class="campo" id="campo-marca">
      ${MARCAS.map(([v, t]) => `<option value="${v}"${v === actual ? " selected" : ""}>${escapar(t)}</option>`).join("")}
    </select>
    <p class="apunte" style="margin-top:6px">${escapar(explicarRegimen(n))}</p>
  `;
  fila.querySelector(".campo").addEventListener("change", (evento) => {
    const elegida = evento.target.value;
    editarNegocio(estado, n.id, {
      es_suplencia: elegida === "es_suplencia",
      yo_referi: elegida === "yo_referi",
    });
    estado.redibujar();
  });
  contenedor.append(fila);
}

/* La regla de comisión ya no se elige: sale sola. Se muestra para que se entienda de
   dónde salió el número, sin poder desincronizarse de los datos. */
const NOMBRE_REGIMEN = {
  captacion_mia: "Cobrás tu comisión entera: no se lleva una tajada nadie.",
  ref_martin: "Regla de Martín: facturás la mitad y te quedás con el 35% del total.",
  ref_otro_colega: "Referido de un colega: se lleva el 25% antes de tu tajada.",
  yo_referi: "Vos lo referiste: cobrás el 25% de la comisión.",
  suplencia: "Suplencia: no factura por RE/MAX y el 12,5% va entero a tu bolsillo.",
};

const explicarRegimen = (n) => NOMBRE_REGIMEN[regimenDe(n)] || "";

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

/* "Ficha completa" no es para siempre: vale mientras la propiedad esté donde está.
   Si después pasa a reservada o se va de la cartera, el negocio vuelve solo a la bandeja,
   porque recién ahí existen los datos del cierre. */
function fichaCompleta(n, estado) {
  const propiedad = (estado.datos.cartera || {})[n.entity_id_cartera];
  const momento = momentoDeLaPropiedad(propiedad);
  const viva = Boolean(propiedad && propiedad.activa);

  const vigente = n.ficha_vigente ?? n.ficha_completa;
  const explicacion = vigente
    ? viva
      ? `No te aviso más por lo que falte. Pero cuando la propiedad pase a otro estado o `
        + `se vaya de tu cartera, el negocio vuelve solo acá: ahí van a existir datos que `
        + `hoy todavía no existen.`
      : `Este negocio no vuelve a aparecer en pendientes. Podés seguir editándolo cuando quieras.`
    : viva
      ? `Tocá acá y dejo de avisarte por lo que falte. Cuando la propiedad avance —pase a `
        + `reservada, o se vaya de RE/MAX— te lo vuelvo a traer para que cargues el cierre.`
      : `Tocá acá y dejo de avisarte por los datos que falten en este negocio. Se puede deshacer.`;

  const seccion = nodo(html`
    <section class="tarjeta">
      <h2 class="titulo" style="font-size:17px;margin-bottom:6px">
        ${vigente ? "Ficha dada por completa" : "¿Ya cargaste todo lo que se puede cargar hoy?"}
      </h2>
      <p class="apunte" style="margin-bottom:12px">${explicacion}</p>
      <button class="boton ${vigente ? "" : "boton-primario"}" id="completa">
        ${vigente ? "Volver a pedirme los datos" : "Ficha completa"}
      </button>
    </section>
  `);
  seccion.getElementById("completa").addEventListener("click", () => {
    const marcando = !vigente;
    editarNegocio(estado, n.id, {
      ficha_completa: marcando,
      // Se guarda DESDE CUÁNDO vale la marca: si la propiedad se mueve, deja de valer.
      ficha_completa_momento: marcando ? momento : null,
    });
    if (!marcando) {
      estado.redibujar();
      return;
    }
    /* Al darla por completa se sube y se sale: es el final del trabajo con ese negocio.
       El guardado va por atrás, así la pantalla no se queda esperando a la red. */
    estado.guardar();
    estado.irA(estado.anterior === "ficha" ? "negocios" : estado.anterior || "negocios");
  });
  return seccion;
}
