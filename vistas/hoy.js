/* Hoy: lo primero que se ve al abrir la app.

   Tres cosas, en este orden: cómo viene el año, en qué categoría estás, y qué te falta
   completar. Los números van ARRIBA de los pendientes a propósito — con cincuenta cosas
   en la bandeja, un número que quedara abajo no se miraba nunca, y la pregunta que uno
   se hace al abrir es "¿cómo venimos?", no "¿qué me falta?".

   Antes los números solo aparecían cuando NO había pendientes. Era justo al revés de lo
   que sirve. */

import { derivar } from "../lib/pendientes.js";
import { capas, ritmo, comparativaCategorias } from "../lib/salud.js";
import { marcarAtendido } from "../lib/guardado.js";
import { plata, plataUSD, pct, fechaCorta, escapar } from "../lib/formato.js";

const html = (cadenas, ...valores) =>
  cadenas.reduce((t, c, i) => t + c + (valores[i] ?? ""), "");

function nodo(marca) {
  const molde = document.createElement("template");
  molde.innerHTML = marca.trim();
  return molde.content;
}

export function dibujarHoy(estado) {
  // Los eventos que el usuario ya despacho no se vuelven a mostrar.
  const atendidos = new Set((estado.datos.mis_datos || {}).eventos_atendidos || []);
  const eventos = (estado.datos.eventos || []).filter((e) => !atendidos.has(e.id));
  const grupos = derivar(estado.datos.negocios, eventos, estado.hoy);
  const total = grupos.reduce((t, g) => t + g.items.length, 0);

  const trozo = document.createDocumentFragment();
  trozo.append(encabezado(estado, total));
  trozo.append(comoVieneElAnio(estado));
  trozo.append(tuCategoria(estado));
  trozo.append(pendientes(estado, grupos, total));
  for (const grupo of grupos) trozo.append(dibujarGrupo(grupo, estado));
  return trozo;
}

function encabezado(estado, total) {
  const anio = estado.hoy.slice(0, 4);
  return nodo(html`
    <section style="margin-bottom:16px">
      <p class="etiqueta">${anio}</p>
      <h1 class="titulo" style="font-size:27px;margin-top:4px">¿Cómo venimos?</h1>
      <p class="apunte">${total ? `${total} ${total === 1 ? "cosa" : "cosas"} para revisar` : "Todo al día"}</p>
    </section>
  `);
}

/* Lo cobrado y lo que está por entrar, con las dos caras de la plata: lo que factura
   RE/MAX y lo que le queda a él. Las dos cifras siempre juntas. */
function comoVieneElAnio(estado) {
  const { negocios, cartera, ajustes } = estado.datos;
  const anio = estado.hoy.slice(0, 4);
  const c = capas(negocios, cartera, ajustes, anio);
  const objetivo = (ajustes.objetivo_personal || {})[anio] || 0;
  const r = ritmo(c.cobrado.facturacion, objetivo, anio, estado.hoy);

  const suma = (campo) => c.cobrado[campo] + c.avanzado[campo];
  return nodo(html`
    <section class="tarjeta">
      <p class="etiqueta">Cobrado</p>
      <p class="cifra cifra-heroe" style="margin:6px 0 2px">${plata(c.cobrado.ganancia)}</p>
      <p class="apunte" style="margin-bottom:16px">
        <strong>a tu bolsillo</strong> · ${plataUSD(c.cobrado.facturacion)} facturados
        · ${c.cobrado.negocios} ${c.cobrado.negocios === 1 ? "negocio" : "negocios"}
      </p>

      <div class="cierre">
        <p class="etiqueta">Si cierra lo reservado y lo que está en negociación</p>
        <p class="cifra cifra-grande" style="margin:6px 0 2px;color:var(--azul)">${plata(suma("ganancia"))}</p>
        <p class="apunte">
          a tu bolsillo · <strong>${plataUSD(suma("facturacion"))}</strong> facturados
        </p>
      </div>

      ${r ? html`
        <div class="ritmo" style="margin-top:16px">
          <div class="ritmo-pista ${r.aRitmo ? "" : "atrasado"}">
            <div class="ritmo-relleno" style="width:${Math.min(100, r.avance * 100)}%"></div>
            <div class="ritmo-marca" style="left:${Math.min(100, r.calendario * 100)}%" data-texto="hoy"></div>
          </div>
          <div class="ritmo-pies">
            <span><strong>${pct(r.avance)}</strong> del objetivo de ${plata(objetivo)}</span>
            <span>${r.aRitmo ? "vas a ritmo" : "vas atrasado"}</span>
          </div>
        </div>` : ""}
    </section>
  `);
}

/* En qué escalón estás y qué habrías ganado en los otros.

   Se recalcula negocio por negocio y NO sobre el total, porque cada régimen de comisión
   reacciona distinto al cambio de tajada: el arreglo con Martin es fijo y no se mueve, y
   las suplencias tampoco. El fee mensual ya viene descontado. */
function tuCategoria(estado) {
  const { negocios, ajustes } = estado.datos;
  const anio = estado.hoy.slice(0, 4);
  const filas = comparativaCategorias(negocios, ajustes, anio, estado.hoy);
  if (!filas.length) return document.createDocumentFragment();

  const actual = filas.find((f) => f.actual);
  const mejor = [...filas].sort((a, b) => b.neto - a.neto)[0];

  return nodo(html`
    <section class="tarjeta">
      <div class="tarjeta-titulo">
        <h2 class="titulo">Tu categoría</h2>
        <span class="apunte">${actual ? escapar(actual.categoria) : "—"} · ganancia neta ${anio}</span>
      </div>
      <div class="datos">
        ${filas.map((f) => html`
          <div class="dato">
            <span class="dato-nombre">
              ${escapar(f.categoria)} · ${Math.round(f.split * 100)}%${f.actual ? " <strong>(la tuya)</strong>" : ""}
              <br><span class="apunte">fee de ${plata(f.fee)} en el año</span>
            </span>
            <span class="dato-valor" style="${f.diferencia > 0 ? "color:var(--azul)" : ""}">
              ${plata(f.neto)}
              ${f.diferencia ? html`<br><span class="apunte">${f.diferencia > 0 ? "+" : ""}${plata(f.diferencia)}</span>` : ""}
            </span>
          </div>`).join("")}
      </div>
      ${mejor && actual && mejor.categoria !== actual.categoria
        ? html`<p class="aviso">Con <strong>${escapar(mejor.categoria)}</strong> habrías ganado
             <strong>${plata(mejor.neto - actual.neto)}</strong> más en lo que va del año,
             descontando el fee mensual.</p>`
        : html`<p class="apunte" style="margin-top:10px">
             ${actual ? escapar(actual.categoria) : "Tu categoría"} es la que más te deja
             con los números de este año.</p>`}
    </section>
  `);
}

function pendientes(estado, grupos, total) {
  if (!total) {
    return nodo(html`
      <section class="vacio">
        <p class="vacio-signo">✓</p>
        <p class="vacio-texto">No hay nada esperándote.</p>
      </section>
    `);
  }
  return nodo(html`
    <section style="margin:22px 0 10px">
      <p class="etiqueta">Pendientes</p>
      <h2 class="titulo" style="font-size:19px;margin-top:2px">
        ${total} ${total === 1 ? "cosa para revisar" : "cosas para revisar"}
      </h2>
    </section>
  `);
}

function dibujarGrupo(grupo, estado) {
  const anio = Number(estado.hoy.slice(0, 4));
  const marca = nodo(html`
    <details class="grupo ${grupo.urgente ? "urgente" : ""}">
      <summary class="grupo-cabeza">
        <span class="grupo-cuenta">${grupo.items.length}</span>
        <span class="grupo-nombre">${escapar(grupo.nombre)}</span>
        <span class="grupo-flecha" aria-hidden="true">›</span>
      </summary>
      <ul class="grupo-lista"></ul>
    </details>
  `);

  const lista = marca.querySelector(".grupo-lista");
  for (const item of grupo.items) {
    const li = document.createElement("li");
    li.className = "grupo-item";
    li.innerHTML = html`
      <p class="grupo-item-titulo">${escapar(item.titulo)}${
        item.fecha ? ` <span class="capa-sub">· ${fechaCorta(item.fecha, anio)}</span>` : ""
      }</p>
      <p class="grupo-item-detalle">${escapar(item.detalle)}</p>
      <div class="botonera">
        ${item.negocio_id
          ? `<button class="boton" data-ir="${item.negocio_id}" style="padding:8px 13px;font-size:13px">Abrir y completar</button>`
          : `<button class="boton" data-listo="${item.evento_id}" style="padding:8px 13px;font-size:13px">Ya lo resolví</button>`}
      </div>
    `;
    const abrir = li.querySelector("[data-ir]");
    if (abrir) abrir.addEventListener("click", () => estado.irA("ficha", abrir.dataset.ir));
    const listo = li.querySelector("[data-listo]");
    if (listo) {
      listo.addEventListener("click", () => {
        marcarAtendido(estado, listo.dataset.listo);
        estado.redibujar();
      });
    }
    lista.append(li);
  }
  return marca;
}
