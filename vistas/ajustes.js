/* Ajustes: la pantalla guiada para crear el token de GitHub.

   El usuario no es tecnico. Aca no alcanza con un campo que diga "token": hay que
   explicarle que es, para que sirve, y darle el link directo con todo preseleccionado. */

import { guardarToken, leerToken, borrarToken, probarToken, REPO } from "../lib/github.js";
import { editarAjustes } from "../lib/guardado.js";
import { plata, pct } from "../lib/formato.js";

const html = (c, ...v) => c.reduce((t, x, i) => t + x + (v[i] ?? ""), "");

function nodo(marca) {
  const molde = document.createElement("template");
  molde.innerHTML = marca.trim();
  return molde.content;
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

  trozo.append(tuNegocio(estado));

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
    fila.innerHTML = html`
      <label for="${id}">${etiqueta}${sufijo ? ` <span class="apunte">${sufijo}</span>` : ""}</label>
      ${opciones
        ? html`<select class="campo" id="${id}">
             ${opciones.map(([v, t]) => `<option value="${v}"${String(v) === String(valor) ? " selected" : ""}>${t}</option>`).join("")}
           </select>`
        : html`<input class="campo" id="${id}" type="${tipo}" step="any" value="${valor ?? ""}">`}
    `;
    const control = fila.querySelector(".campo");
    control.addEventListener("change", () => {
      alCambiar(tipo === "number" ? (control.value === "" ? null : Number(control.value)) : control.value);
      estado.redibujar();
    });
    contenedor.append(fila);
  };

  agregar(`Objetivo de facturación ${anio}`, "number", objetivo, (v) => {
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
  }, escalones.map((e) => [e.categoria, `${e.categoria} · ${Math.round(e.split_pct * 100)}% · fee ${e.fee_mensual_usd}`]));

  agregar("Desde cuándo estás en esa categoría", "date", vigente.desde, (v) => {
    editarAjustes(estado, {
      categorias: [...(a.categorias || []).filter((c) => c.hasta !== null), { ...vigente, desde: v }],
    });
  }, null, "los negocios anteriores se siguen calculando con la vieja");

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

  // Un resumen en criollo de lo que significan esos numeros juntos.
  const resumen = document.createElement("p");
  resumen.className = "apunte";
  resumen.style.padding = "12px 14px";
  resumen.style.margin = "0";
  resumen.style.background = "var(--lienzo)";
  resumen.textContent =
    `Hoy: ${vigente.categoria || "sin categoría"}, te quedás con ` +
    `${pct(vigente.split_pct || 0)} de lo que factura RE/MAX y pagás ` +
    `${plata(vigente.fee_mensual_usd || 0)} por mes de fee.`;
  contenedor.append(resumen);

  return seccion;
}
