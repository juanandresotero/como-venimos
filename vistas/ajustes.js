/* Ajustes: la pantalla guiada para crear el token de GitHub.

   El usuario no es tecnico. Aca no alcanza con un campo que diga "token": hay que
   explicarle que es, para que sirve, y darle el link directo con todo preseleccionado. */

import { guardarToken, leerToken, borrarToken, probarToken, REPO } from "../lib/github.js";

const html = (c, ...v) => c.reduce((t, x, i) => t + x + (v[i] ?? ""), "");

function nodo(marca) {
  const molde = document.createElement("template");
  molde.innerHTML = marca.trim();
  return molde.content;
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
