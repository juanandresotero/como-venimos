/* Ajustes: la pantalla guiada para crear el token de GitHub.

   El usuario no es tecnico. Aca no alcanza con un campo que diga "token": hay que
   explicarle que es, para que sirve, y darle el link directo con todo preseleccionado. */

import { guardarToken, leerToken, borrarToken, probarToken, REPO } from "../lib/github.js";
import { editarAjustes } from "../lib/guardado.js";
import {
  plata, pct, fechaRazonable, numeroDesde, formatearMientrasEscribe, escapar,
} from "../lib/formato.js";
import * as cuentas from "../lib/cuentas.js";
import { negociosACsv, carteraACsv, nombrePlanilla } from "../lib/planilla.js";
import { leerFirmaPropia, guardarFirmaPropia, olvidarFirmaPropia }
  from "../lib/carta-guardado.js";
import { deBytes } from "../lib/firma.js";
import { dibujarEn, tintaDePantalla } from "../lib/firma-dibujo.js";
import { pedirFirma, pedirFirmaDeFoto } from "./firma-panel.js";

const html = (c, ...v) => c.reduce((t, x, i) => t + x + (v[i] ?? ""), "");

function nodo(marca) {
  const molde = document.createElement("template");
  molde.innerHTML = marca.trim();
  return molde.content;
}

/* Bajar todo a una planilla. El Excel viejo dejó de ser la fuente de verdad, pero tiene
   que poder mirarse todo afuera de la app cuando haga falta. */
function bajarPlanilla(estado) {
  const seccion = nodo(html`
    <section class="tarjeta">
      <h2 class="titulo" style="font-size:17px;margin-bottom:6px">Bajar todo a una planilla</h2>
      <p class="apunte" style="margin-bottom:12px">
        Se abre con doble clic en Excel. Es una foto del momento: para trabajar, la app
        sigue siendo la que manda.
      </p>
      <div class="botonera" style="margin-top:0">
        <button class="boton" id="bajar-negocios">Los negocios</button>
        <button class="boton" id="bajar-cartera">La cartera</button>
      </div>
    </section>
  `);

  const bajar = (texto, nombre) => {
    const blob = new Blob([texto], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const enlace = document.createElement("a");
    enlace.href = url;
    enlace.download = nombre;
    enlace.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  seccion.getElementById("bajar-negocios").addEventListener("click", () =>
    bajar(negociosACsv(estado.datos.negocios), nombrePlanilla("negocios", estado.hoy)));
  seccion.getElementById("bajar-cartera").addEventListener("click", () =>
    bajar(carteraACsv(estado.datos.cartera), nombrePlanilla("cartera", estado.hoy)));

  return seccion;
}

const yaInstalada = () =>
  window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;

/* Instalar la app en el celular, como Parecidas.

   Android avisa que se puede instalar UNA sola vez y en el momento que quiere; si no se
   atiende ese aviso, se pierde. Por eso se guarda al arrancar y se ofrece acá, cuando el
   usuario lo busca. En iPhone no existe ese aviso: hay que explicarle los dos toques. */
function instalar(estado) {
  if (yaInstalada()) {
    return nodo(html`
      <section class="tarjeta">
        <h2 class="titulo" style="font-size:17px;margin-bottom:6px">Ya la tenés instalada ✓</h2>
        <p class="apunte">Estás usando la app desde la pantalla de inicio.</p>
      </section>
    `);
  }

  const esIphone = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const seccion = nodo(html`
    <section class="tarjeta">
      <h2 class="titulo" style="font-size:17px;margin-bottom:6px">Instalarla en el celular</h2>
      <p class="apunte" style="margin-bottom:12px">
        Queda como una app más, con su ícono en la pantalla de inicio, sin la barra del
        navegador y andando aunque no tengas señal.
      </p>
      ${estado.instalador
        ? html`<button class="boton boton-primario" id="instalar">Instalar</button>`
        : esIphone
          ? html`<ol class="pasos">
               <li>Tocá el botón de <strong>Compartir</strong> (el cuadrito con la flecha para arriba).</li>
               <li>Bajá y elegí <strong>Agregar a inicio</strong>.</li>
             </ol>`
          : html`<ol class="pasos">
               <li>Tocá los <strong>tres puntitos</strong> de arriba a la derecha del navegador.</li>
               <li>Elegí <strong>Instalar aplicación</strong> o <strong>Agregar a pantalla principal</strong>.</li>
             </ol>
             <p class="apunte">Si te aparece solo el aviso de Chrome, aceptalo y listo.</p>`}
    </section>
  `);

  const boton = seccion.getElementById("instalar");
  if (boton) {
    boton.addEventListener("click", async () => {
      const aviso = estado.instalador;
      if (!aviso) return;
      boton.disabled = true;
      aviso.prompt();
      await aviso.userChoice;
      estado.instalador = null;   // Android no lo deja usar dos veces
      estado.redibujar();
    });
  }
  return seccion;
}

/* El dia anterior, para cerrar el periodo de la categoria vieja sin superponerlo. */
function ayer(iso) {
  const fecha = new Date(`${iso}T00:00:00Z`);
  fecha.setUTCDate(fecha.getUTCDate() - 1);
  return fecha.toISOString().slice(0, 10);
}

const LINK_TOKEN =
  "https://github.com/settings/personal-access-tokens/new" +
  "?description=Como%20venimos" +
  "&target_name=juanandresotero";

export function dibujarAjustes(estado) {
  const trozo = document.createDocumentFragment();
  const yaTiene = Boolean(leerToken());

  trozo.append(nodo(html`
    <section style="margin-bottom:16px">
      <p class="etiqueta">Ajustes</p>
      <h1 class="titulo" style="font-size:27px;margin-top:4px">Permiso para guardar</h1>
    </section>

    <section class="tarjeta">
      <p class="apunte" style="margin-bottom:14px">
        La app necesita una <strong>llave</strong> para poder guardar tus cambios. Se crea
        una sola vez, sirve solo para este proyecto, y la podés anular cuando quieras.
      </p>
      <ol class="pasos">
        <li>Tocá el botón de abajo. Se abre GitHub.</li>
        <li>En <strong>Token name</strong> escribí <code>Como venimos</code>. GitHub no
            deja seguir si queda vacío.</li>
        <li>En <strong>Expiration</strong> elegí <strong>No expiration</strong>, así no
            tenés que rehacerla nunca.</li>
        <li>En <strong>Repository access</strong> elegí <strong>Only select
            repositories</strong> y marcá <strong>como-venimos</strong>.</li>
        <li>En <strong>Permissions → Repository permissions</strong>, buscá
            <strong>Contents</strong> y ponelo en <strong>Read and write</strong>.</li>
        <li>Abajo de todo, <strong>Generate token</strong>. Copiá el texto que aparece
            (empieza con <code>github_pat_</code>) y pegalo acá.</li>
      </ol>
      <a class="boton boton-primario" href="${LINK_TOKEN}" target="_blank" rel="noopener">
        Abrir GitHub para crear la llave
      </a>
    </section>

    <section class="tarjeta">
      <label class="etiqueta" for="campo-token">Pegá la llave acá</label>
      <input id="campo-token" class="campo" type="password" autocomplete="off"
             spellcheck="false" placeholder="${yaTiene ? "•••••• (ya hay una guardada)" : "github_pat_..."}">
      <div class="botonera">
        <button class="boton boton-primario" id="probar">Probar y guardar</button>
        ${yaTiene ? html`<button class="boton boton-borrar" id="borrar">Borrar la llave</button>` : ""}
      </div>
      <p id="resultado" class="apunte" style="margin-top:12px"></p>
    </section>

    <section class="tarjeta">
      <h2 class="titulo" style="font-size:17px;margin-bottom:8px">Qué puede hacer esta llave</h2>
      <p class="apunte">
        Solo leer y escribir archivos del repositorio <code>${REPO}</code>. No puede tocar
        nada más de tu cuenta. Queda guardada en este teléfono; si lo perdés, entrá a
        GitHub → Settings → Developer settings → Personal access tokens y borrala.
      </p>
    </section>
  `));

  trozo.append(instalar(estado));
  trozo.append(nodo(html`
    <section class="tarjeta">
      <h2 class="titulo" style="font-size:17px;margin-bottom:6px">¿Ves algo desactualizado?</h2>
      <p class="apunte" style="margin-bottom:12px">
        La app se pone al día sola. Si aun así ves algo viejo, esto borra la copia guardada
        en el teléfono y baja la última versión. No toca tus datos ni la llave.
      </p>
      <a class="boton" href="limpiar.html">Poner la app al día</a>
    </section>
  `));
  trozo.append(bajarPlanilla(estado));
  trozo.append(tuNegocio(estado));
  trozo.append(tuFirma(estado));
  trozo.append(cuentasParaCobrar(estado));

  const campo = trozo.getElementById("campo-token");
  const resultado = trozo.getElementById("resultado");

  trozo.getElementById("probar").addEventListener("click", async () => {
    const token = campo.value.trim() || leerToken();
    if (!token) {
      resultado.textContent = "Pegá la llave primero.";
      return;
    }
    resultado.textContent = "Probando…";
    const r = await probarToken(token);
    resultado.textContent = r.mensaje;
    resultado.style.color = r.ok ? "var(--azul)" : "var(--rojo-tinta)";
    if (r.ok) {
      guardarToken(token);
      campo.value = "";
      estado.token = token;
    }
  });

  const botonBorrar = trozo.getElementById("borrar");
  if (botonBorrar) {
    botonBorrar.addEventListener("click", () => {
      borrarToken();
      estado.token = "";
      resultado.textContent = "Llave borrada de este teléfono.";
    });
  }

  return trozo;
}

/* Las reglas del negocio, editables.

   La categoria lleva fecha de inicio a proposito: si pasa a ALTO en junio, los negocios
   de enero a mayo se tienen que seguir calculando al 45%. Sin eso, cambiar de categoria
   deforma todo el historico de un saque. */
function tuNegocio(estado) {
  const a = estado.datos.ajustes || {};
  const anio = estado.hoy.slice(0, 4);
  const objetivo = (a.objetivo_personal || {})[anio] || 0;
  const vigente = (a.categorias || []).find((c) => c.hasta === null) || {};
  const escalones = a.escalones || [];
  const prob = a.probabilidades_cierre || {};
  const defaults = a.defaults_comision || { venta: {}, alquiler: {} };

  const seccion = nodo(html`
    <section class="tarjeta" style="padding:0;overflow:hidden">
      <div class="campo-fila" style="background:var(--lienzo-2)">
        <label style="font-weight:700;color:var(--tinta)">Tu negocio</label>
      </div>
      <div id="campos-negocio"></div>
    </section>

    <section class="tarjeta">
      <h2 class="titulo" style="font-size:17px;margin-bottom:8px">Qué tan seguro es cada estado</h2>
      <p class="apunte" style="margin-bottom:12px">
        Con esto se calcula la capa 3 de Salud: cuánto vale hoy lo que tenés publicado.
        Cuando el robot junte unos meses de historia, estos números se van a poder medir
        en vez de estimar.
      </p>
      <div class="datos" id="campos-prob"></div>
    </section>
  `);

  const contenedor = seccion.getElementById("campos-negocio");
  const agregar = (etiqueta, tipo, valor, alCambiar, opciones, sufijo) => {
    const fila = document.createElement("div");
    fila.className = "campo-fila";
    const id = `aj-${etiqueta.replace(/\W+/g, "-").toLowerCase()}`;
    // Los montos van en un campo de texto para poder mostrarlos con los puntos de miles:
    // 65.000 se lee de un golpe y 65000 no, y <input type="number"> no admite el punto.
    const esMoneda = tipo === "moneda";
    fila.innerHTML = html`
      <label for="${id}">${etiqueta}${sufijo ? ` <span class="apunte">${sufijo}</span>` : ""}</label>
      ${opciones
        ? html`<select class="campo" id="${id}">
             ${opciones.map(([v, t]) => `<option value="${v}"${String(v) === String(valor) ? " selected" : ""}>${t}</option>`).join("")}
           </select>`
        : esMoneda
          ? html`<input class="campo" id="${id}" type="text" inputmode="decimal"
                   value="${valor === null || valor === undefined ? "" : plata(valor)}">`
          : html`<input class="campo" id="${id}" type="${tipo}" step="any" value="${valor ?? ""}">`}
    `;
    const control = fila.querySelector(".campo");
    // Los puntos de miles aparecen mientras se escribe, no al saltar de celda.
    if (esMoneda) formatearMientrasEscribe(control);
    control.addEventListener("change", () => {
      // El navegador avisa del cambio mientras se tipea el año. Una fecha a medio escribir
      // acá deja sin categoría vigente a todo el año y hace desaparecer la ganancia.
      if (tipo === "date" && !fechaRazonable(control.value)) return;
      if (esMoneda) alCambiar(numeroDesde(control.value));
      else alCambiar(tipo === "number" ? (control.value === "" ? null : Number(control.value)) : control.value);
      estado.redibujar();
    });
    contenedor.append(fila);
  };

  agregar(`Objetivo de facturación ${anio}`, "moneda", objetivo, (v) => {
    editarAjustes(estado, {
      objetivo_personal: { ...(a.objetivo_personal || {}), [anio]: v || 0 },
    });
  }, null, "USD");

  // Cambiar de categoria CIERRA la anterior en la fecha de hoy y abre la nueva. Si en vez
  // de eso se pisara la que habia, todos los negocios del año se recalcularian con la
  // tajada nueva y el historico quedaria deformado.
  agregar("Tu categoría hoy", null, vigente.categoria, (v) => {
    const escalon = escalones.find((e) => e.categoria === v);
    if (!escalon || escalon.categoria === vigente.categoria) return;
    const anteriores = (a.categorias || []).filter((c) => c.hasta !== null);
    if (vigente.categoria) anteriores.push({ ...vigente, hasta: ayer(estado.hoy) });
    editarAjustes(estado, {
      categorias: [...anteriores, {
        categoria: escalon.categoria,
        split_pct: escalon.split_pct,
        fee_mensual_usd: escalon.fee_mensual_usd,
        desde: estado.hoy,
        hasta: null,
      }],
    });
  }, escalones.map((e) => [e.categoria, `${e.categoria} · ${Math.round(e.split_pct * 100)}% · fee ${plata(e.fee_mensual_usd)}`]));

  // La fecha NO se carga a mano: la lleva la app sola. Cuando cambiás de categoría se
  // cierra la anterior en el día de hoy y se abre la nueva, así los negocios de antes
  // se siguen calculando con la tajada que tenías entonces. Pedirla a mano no aportaba
  // nada (siempre estuvo en RAP) y era la puerta por la que se coló el año 0001.

  const comision = (familia, puntas, etiqueta) =>
    agregar(etiqueta, "number", (defaults[familia] || {})[puntas], (v) => {
      editarAjustes(estado, {
        defaults_comision: {
          ...defaults,
          [familia]: { ...(defaults[familia] || {}), [puntas]: v },
        },
      });
    }, null, familia === "venta" ? "0,03 = 3% del precio" : "1 = un mes de alquiler");

  comision("venta", 1, "Venta, 1 punta");
  comision("venta", 2, "Venta, 2 puntas");
  comision("alquiler", 1, "Alquiler, 1 punta");
  comision("alquiler", 2, "Alquiler, 2 puntas");

  // Van firmando la ficha de renta que se le manda al cliente.
  const agente = a.agente || {};
  const datoAgente = (clave, etiqueta, tipo) =>
    agregar(etiqueta, tipo, agente[clave], (v) => {
      editarAjustes(estado, { agente: { ...agente, [clave]: v } });
    });

  datoAgente("nombre", "Tu nombre en la ficha del cliente", "text");
  datoAgente("oficina", "Tu oficina", "text");
  datoAgente("telefono", "Tu teléfono", "tel");

  const NOMBRE_ESTADO = {
    reservada: "Reservada",
    en_negociacion: "En negociación",
    publicada: "Publicada",
  };
  const contenedorProb = seccion.getElementById("campos-prob");
  for (const [clave, nombre] of Object.entries(NOMBRE_ESTADO)) {
    const fila = document.createElement("div");
    fila.className = "dato";
    fila.innerHTML = html`
      <span class="dato-nombre">${nombre}</span>
      <span class="dato-valor">
        <input class="campo" type="number" step="0.05" min="0" max="1"
               style="width:90px;margin:0;padding:6px 8px;text-align:right"
               value="${prob[clave] ?? ""}">
      </span>
    `;
    fila.querySelector("input").addEventListener("change", (evento) => {
      const valor = evento.target.value === "" ? 0 : Number(evento.target.value);
      editarAjustes(estado, {
        probabilidades_cierre: { ...prob, [clave]: valor },
      });
      estado.redibujar();
    });
    contenedorProb.append(fila);
  }

  // Si la fecha de la categoria deja al año en curso sin ninguna vigente, la ganancia de
  // todos los negocios de este año no se puede calcular. Se dice acá, donde se rompe.
  const alInicioDelAnio = `${anio}-01-01`;
  const hayVigente = (a.categorias || []).some(
    (c) => (!c.desde || c.desde <= estado.hoy) && (!c.hasta || c.hasta >= alInicioDelAnio)
  );
  if (!hayVigente) {
    const alarma = document.createElement("p");
    alarma.className = "aviso";
    alarma.style.margin = "0";
    alarma.textContent =
      `Con estas fechas, en ${anio} no tenés ninguna categoría vigente y tu ganancia no se `
      + `puede calcular. Revisá desde cuándo estás en la categoría de arriba.`;
    contenedor.append(alarma);
  }

  // Un resumen en criollo de lo que significan esos numeros juntos.
  const resumen = document.createElement("p");
  resumen.className = "apunte";
  resumen.style.padding = "12px 14px";
  resumen.style.margin = "0";
  resumen.style.background = "var(--lienzo)";
  const anteriores = (a.categorias || []).filter((c) => c.hasta !== null);
  resumen.textContent =
    `Hoy: ${vigente.categoria || "sin categoría"}, te quedás con ` +
    `${pct(vigente.split_pct || 0)} de lo que factura RE/MAX y pagás ` +
    `${plata(vigente.fee_mensual_usd || 0)} por mes de fee. `
    + (anteriores.length
      ? `Antes pasaste por ${anteriores.map((c) => c.categoria).join(", ")}; `
        + `esos negocios se siguen calculando con la tajada de entonces.`
      : `Si algún día cambiás, los negocios de antes se siguen calculando con el
         ${pct(vigente.split_pct || 0)} de ahora.`.replace(/\s+/g, " "));
  contenedor.append(resumen);

  return seccion;
}

/* ---------- Cuentas para cobrar ---------- */

/* Los datos bancarios NO van al repositorio.

   El repo de esta app es publico: cualquiera puede leer los archivos. Un objetivo de
   facturacion ahi adentro no le sirve a nadie, pero un numero de cuenta si — es la pieza
   que falta para hacerse pasar por el agente y mandarle a un cliente "cambio mi cuenta,
   transferi aca". Por eso se guardan en el telefono, como las preferencias de pantalla, y
   hay que cargarlas una vez en cada aparato. Para un dato bancario, es barato. */
function cuentasParaCobrar(estado) {
  const guardadas = cuentas.leer();

  const seccion = nodo(html`
    <section class="tarjeta">
      <div class="tarjeta-titulo">
        <h2 class="titulo" style="font-size:17px">Cuentas para cobrar</h2>
        <span class="apunte">solo en este aparato</span>
      </div>
      <p class="apunte" style="margin-bottom:14px">
        Para adjuntarlas al texto que le mandás al cliente desde la calculadora de
        comisiones. <strong>No se suben a GitHub</strong>: el repositorio de esta app es
        público, y un número de cuenta ahí adentro es justo lo que le falta a alguien para
        mandarle a un cliente "cambió mi cuenta, transferí acá". Quedan en este teléfono,
        así que hay que cargarlas una vez en cada aparato.
      </p>
      <div id="cuentas"></div>
    </section>
  `);

  const contenedor = seccion.getElementById("cuentas");
  const CAMPOS = [
    ["titular", "A nombre de"],
    ["banco", "Banco"],
    ["pesos", "Cuenta en pesos"],
    ["dolares", "Cuenta en dólares"],
    ["nota", "Algo más (opcional)"],
  ];

  for (const [clave, nombre] of [["mia", "La tuya"], ["remax", "La de RE/MAX"]]) {
    const bloque = nodo(html`
      <p class="etiqueta" style="margin-top:14px">${escapar(nombre)}</p>
      <div class="lista" style="border-radius:12px" id="bloque-${clave}"></div>
    `);
    const caja = bloque.getElementById(`bloque-${clave}`);

    for (const [campo, etiqueta] of CAMPOS) {
      const fila = document.createElement("div");
      fila.className = "campo-fila";
      const id = `cuenta-${clave}-${campo}`;
      fila.innerHTML = html`
        <label for="${id}">${etiqueta}</label>
        <input class="campo" id="${id}" type="text"
               value="${escapar(guardadas[clave][campo] || "")}">
      `;
      fila.querySelector(".campo").addEventListener("change", (evento) => {
        const nuevas = cuentas.leer();
        nuevas[clave][campo] = evento.target.value;
        cuentas.guardar(nuevas);
        estado.redibujar();
      });
      caja.append(fila);
    }
    contenedor.append(bloque);
  }
  return seccion;
}

/* Tu firma, cargada UNA vez y usada en todas las cartas oferta.

   Vive en Ajustes y no adentro de la herramienta porque es un dato tuyo, no de una carta
   en particular. Antes solo se podia cargar la primera vez desde la carta oferta, y
   despues no habia forma de cambiarla: quedaba pegada la vieja para siempre.

   NUNCA sale del telefono. Es tu firma de puno y letra: no va al repositorio, que es
   publico, ni viaja en el enlace que se manda por WhatsApp. */
function tuFirma(estado) {
  const guardada = leerFirmaPropia();
  const firma = guardada ? deBytes(guardada.bytes) : null;

  const seccion = nodo(html`
    <section class="tarjeta">
      <h2 class="titulo" style="font-size:17px">Tu firma</h2>
      <p class="apunte" style="margin:4px 0 12px">Se usa en la carta oferta, en el renglón
        del DEPOSITARIO. La cargás una vez y queda.</p>

      <div class="caja-firma">
        <canvas class="caja-firma-lienzo" width="420" height="150"></canvas>
      </div>

      ${guardada && guardada.cuando
        ? `<p class="apunte" style="margin-top:6px">Cargada el ${escapar(guardada.cuando)}.</p>`
        : '<p class="apunte" style="margin-top:6px">Todavía no cargaste ninguna.</p>'}

      <div class="botonera">
        <button class="boton boton-chico boton-primario" id="firma-foto">
          ${firma ? "Cambiarla por una foto" : "Cargar desde una foto"}</button>
        <button class="boton boton-chico" id="firma-dedo">
          ${firma ? "Dibujarla de nuevo" : "Dibujarla con el dedo"}</button>
        ${firma ? '<button class="boton boton-chico boton-borrar" id="firma-borrar">Borrarla</button>' : ""}
      </div>

      <p class="apunte" style="margin-top:10px">Sirve una foto de tu firma en papel blanco
        —mejor con lapicera azul— o un PNG con el fondo transparente. Nunca sale de este
        teléfono: no se sube al repositorio ni viaja en el enlace que mandás.</p>
    </section>
  `);

  const lienzo = seccion.querySelector("canvas");
  const ctx = lienzo.getContext("2d");
  if (firma) {
    dibujarEn(ctx, firma, { x: 8, y: 8, ancho: lienzo.width - 16, alto: lienzo.height - 16 },
      { grosor: 4 });
  } else {
    ctx.strokeStyle = tintaDePantalla(lienzo);
    ctx.globalAlpha = 0.3;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(20, lienzo.height - 28);
    ctx.lineTo(lienzo.width - 20, lienzo.height - 28);
    ctx.stroke();
  }

  const quedarse = (bytes) => {
    guardarFirmaPropia(bytes, estado.hoy);
    estado.redibujar();
  };

  seccion.getElementById("firma-foto").addEventListener("click",
    () => pedirFirmaDeFoto({ alFirmar: quedarse }));

  seccion.getElementById("firma-dedo").addEventListener("click",
    () => pedirFirma({ titulo: "Tu firma", pie: "La que va en el renglón del DEPOSITARIO", alFirmar: quedarse }));

  const borrar = seccion.getElementById("firma-borrar");
  if (borrar) {
    borrar.addEventListener("click", () => {
      if (!window.confirm("¿Borrar tu firma guardada?")) return;
      olvidarFirmaPropia();
      estado.redibujar();
    });
  }

  return seccion;
}
