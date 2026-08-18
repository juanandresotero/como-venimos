/* Hoy: lo primero que se ve al abrir la app.

   Tres cosas, en este orden: cómo viene el año, en qué categoría estás, y qué te falta
   completar. Los números van ARRIBA de los pendientes a propósito — con cincuenta cosas
   en la bandeja, un número que quedara abajo no se miraba nunca, y la pregunta que uno
   se hace al abrir es "¿cómo venimos?", no "¿qué me falta?".

   NO repite la tarjeta de Salud. Allá el protagonista es lo COBRADO — la cifra enorme,
   lo que ya entró. Acá el protagonista es LO QUE FALTA: una sola barra donde se ve
   cuánto del objetivo cubre lo cobrado, cuánto cubriría lo que está en curso, y qué
   queda descubierto. Los mismos números contando otra cosa: allá se mira hacia atrás,
   acá hacia adelante. Ver dos veces la misma tarjeta no le sirve a nadie. */

import { derivar } from "../lib/pendientes.js";
import { capas, ritmo, comparativaCategorias } from "../lib/salud.js";
import { marcarAtendido } from "../lib/guardado.js";
import { medir, vale_la_pena_ajustar, MINIMO_PARA_MEDIR } from "../lib/seguridad.js";
import { plata, plataUSD, pct, fechaCorta, escapar } from "../lib/formato.js";

const html = (cadenas, ...valores) =>
  cadenas.reduce((t, c, i) => t + c + (valores[i] ?? ""), "");

function nodo(marca) {
  const molde = document.createElement("template");
  molde.innerHTML = marca.trim();
  return molde.content;
}

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto",
  "septiembre", "octubre", "noviembre", "diciembre"];

export function dibujarHoy(estado) {
  // Los eventos que el usuario ya despacho no se vuelven a mostrar.
  const atendidos = new Set((estado.datos.mis_datos || {}).eventos_atendidos || []);
  const eventos = (estado.datos.eventos || []).filter((e) => !atendidos.has(e.id));
  const grupos = derivar(estado.datos.negocios, eventos, estado.hoy, estado.datos.cartera);
  const total = grupos.reduce((t, g) => t + g.items.length, 0);

  const trozo = document.createDocumentFragment();
  trozo.append(encabezado(estado, total));
  trozo.append(cuantoFalta(estado));
  trozo.append(tuCategoria(estado));
  trozo.append(queTanSeguro(estado));
  trozo.append(pendientes(total));
  for (const grupo of grupos) trozo.append(dibujarGrupo(grupo, estado));
  return trozo;
}

function encabezado(estado, total) {
  const mes = MESES[Number(estado.hoy.slice(5, 7)) - 1];
  return nodo(html`
    <section style="margin-bottom:16px">
      <p class="etiqueta">${mes} de ${estado.hoy.slice(0, 4)}</p>
      <h1 class="titulo" style="font-size:27px;margin-top:4px">¿Cómo venimos?</h1>
      <p class="apunte">${total
        ? `${total} ${total === 1 ? "cosa" : "cosas"} para revisar`
        : "Todo al día"}</p>
    </section>
  `);
}

/* Una sola barra contra el objetivo, en tres tramos: lo cobrado, lo que está encaminado
   y lo que queda descubierto. Y abajo, en una frase, cuánto hay que hacer por mes. */
function cuantoFalta(estado) {
  const { negocios, cartera, ajustes } = estado.datos;
  const anio = estado.hoy.slice(0, 4);
  const c = capas(negocios, cartera, ajustes, anio);
  const objetivo = (ajustes.objetivo_personal || {})[anio] || 0;

  if (!objetivo) {
    return nodo(html`
      <section class="tarjeta">
        <p class="apunte">Cargá tu objetivo del año en Ajustes y acá vas a ver cuánto te
        falta y cuánto tenés que hacer por mes.</p>
      </section>
    `);
  }

  const r = ritmo(c.cobrado.facturacion, objetivo, anio, estado.hoy);
  const encaminado = c.avanzado.facturacion;
  const descubierto = Math.max(0, objetivo - c.cobrado.facturacion - encaminado);
  const parte = (x) => `${Math.max(0, Math.min(100, (x / objetivo) * 100))}%`;
  const mesesQuedan = Math.max(1, 12 - Number(estado.hoy.slice(5, 7)));

  return nodo(html`
    <section class="tarjeta">
      <div class="tarjeta-titulo" style="margin-bottom:12px">
        <h2 class="titulo" style="font-size:17px">Para llegar a ${plata(objetivo)}</h2>
        <span class="ritmo-veredicto ${r.aRitmo ? "bien" : "mal"}">
          ${r.aRitmo ? "Vas a ritmo" : "Vas atrasado"}
        </span>
      </div>

      <div class="camino">
        <div class="camino-tramo cobrado" style="width:${parte(c.cobrado.facturacion)}"></div>
        <div class="camino-tramo encaminado" style="width:${parte(encaminado)}"></div>
        <div class="camino-marca" style="left:${parte(objetivo * r.calendario)}"></div>
      </div>

      <div class="camino-pies">
        <span class="camino-pie">
          <span class="camino-punto cobrado"></span>
          <strong>${plata(c.cobrado.facturacion)}</strong> cobrado
        </span>
        <span class="camino-pie">
          <span class="camino-punto encaminado"></span>
          <strong>${plata(encaminado)}</strong> encaminado
        </span>
        <span class="camino-pie">
          <span class="camino-punto sin-cubrir"></span>
          <strong>${plata(descubierto)}</strong> sin cubrir
        </span>
      </div>

      <p class="frase">
        ${descubierto > 0
          ? html`Si cerrás todo lo que ya está en marcha te faltan
             <strong>${plataUSD(descubierto)}</strong> de negocio nuevo, en los
             ${mesesQuedan} ${mesesQuedan === 1 ? "mes" : "meses"} que quedan.`
          : html`Con lo que ya está en marcha <strong>llegás al objetivo</strong>.
             Falta cerrarlo.`}
      </p>
      <p class="apunte" style="margin-top:8px">
        La marca del medio es dónde deberías estar hoy: ${pct(r.calendario)} del año.
        Al bolsillo llevás <strong>${plata(c.cobrado.ganancia)}</strong>.
      </p>
    </section>
  `);
}

/* En qué escalón estás, en una frase, y recién después los números.

   Antes era una tabla de tres filas con el neto y la diferencia de cada una, y había que
   compararlas de a pares para sacar la conclusión. La conclusión es lo único que importa
   y ahora va primero, escrita. */
function tuCategoria(estado) {
  const { negocios, ajustes } = estado.datos;
  const anio = estado.hoy.slice(0, 4);
  const filas = comparativaCategorias(negocios, ajustes, anio, estado.hoy);
  if (!filas.length) return document.createDocumentFragment();

  const actual = filas.find((f) => f.actual);
  const mejor = [...filas].sort((a, b) => b.neto - a.neto)[0];
  if (!actual) return document.createDocumentFragment();

  const conviene = mejor.categoria === actual.categoria;
  const otras = filas.filter((f) => !f.actual);

  return nodo(html`
    <section class="tarjeta">
      <p class="etiqueta">Tu categoría</p>
      <p class="cifra cifra-grande" style="margin:4px 0 2px">${escapar(actual.categoria)}</p>
      <p class="apunte">
        Te quedás con el <strong>${Math.round(actual.split * 100)}%</strong> de cada
        comisión y pagás <strong>${plata(actual.fee / Math.max(1, Number(estado.hoy.slice(5, 7))))}</strong>
        por mes de fee.
      </p>

      <p class="frase ${conviene ? "" : "alerta"}">
        ${conviene
          ? html`✓ Es la que más te deja con los números de este año.`
          : html`Con <strong>${escapar(mejor.categoria)}</strong> habrías ganado
             <strong>${plata(mejor.neto - actual.neto)} más</strong> en lo que va del año.`}
      </p>

      <div class="datos">
        ${otras.map((f) => html`
          <div class="dato">
            <span class="dato-nombre">Si estuvieras en <strong>${escapar(f.categoria)}</strong>
              <br><span class="apunte">te quedarías con el ${Math.round(f.split * 100)}%,
                pagando ${plata(f.fee)} de fee</span></span>
            <span class="dato-valor" style="color:${f.diferencia > 0 ? "var(--azul)" : "var(--tinta-2)"}">
              ${f.diferencia > 0 ? "+" : ""}${plata(f.diferencia)}
              <br><span class="apunte">${f.diferencia > 0 ? "ganarías más" : "ganarías menos"}</span>
            </span>
          </div>`).join("")}
      </div>
      <p class="apunte" style="margin-top:10px">
        Comparado sobre tus ${filas.length ? "" : ""}negocios cerrados de ${anio}, con el
        fee ya descontado. Los referidos de Martín no cambian: ese arreglo es fijo.
      </p>
    </section>
  `);
}

function pendientes(total) {
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
          : item.evento_id
            ? `<button class="boton" data-listo="${item.evento_id}" style="padding:8px 13px;font-size:13px">Ya lo resolví</button>`
            : `<button class="boton" data-propiedad="${item.entity_id}" style="padding:8px 13px;font-size:13px">Abrir la propiedad</button>`}
      </div>
    `;
    const abrir = li.querySelector("[data-ir]");
    if (abrir) abrir.addEventListener("click", () => estado.irA("ficha", abrir.dataset.ir));
    const propiedad = li.querySelector("[data-propiedad]");
    if (propiedad) {
      propiedad.addEventListener("click", () => estado.irA("propiedad", propiedad.dataset.propiedad));
    }
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

/* Qué tan seguro es cada paso del camino.

   Uno es "cierra seguro" y cero es "no cierra nunca". Estos tres números son los que
   usa la app para proyectar: cuánto de lo que está en la cartera se va a convertir en
   plata de verdad.

   Arrancan cargados a mano en Ajustes, pero la idea es que dejen de serlo. Cada vez que
   una propiedad se va de la cartera se anota en qué estado estaba y cómo terminó, y con
   esos casos se calcula la proporción real. Hasta que haya suficientes se sigue usando lo
   cargado: con dos o tres casos el número salta de 0 a 100 con una sola propiedad, y eso
   parece medido pero es azar. */
function queTanSeguro(estado) {
  const filas = medir(estado.datos.cartera, estado.datos.ajustes).filter((f) => f.usar !== null);
  if (!filas.length) return document.createDocumentFragment();

  const medidas = filas.filter((f) => f.alcanza);
  const paraAjustar = filas.filter(vale_la_pena_ajustar);

  return nodo(html`
    <section class="tarjeta">
      <div class="tarjeta-titulo">
        <h2 class="titulo" style="font-size:17px">Qué tan seguro es cada paso</h2>
        <span class="apunte">${medidas.length ? "medido con lo que pasó" : "tus números"}</span>
      </div>
      <div class="datos">
        ${filas.map((f) => html`
          <div class="dato">
            <span class="dato-nombre">${escapar(f.nombre)}
              <br><span class="apunte">${escapar(f.sub)}</span>
            </span>
            <span class="dato-valor">${pct(f.usar, 0)}
              ${f.casos
                ? html`<br><span class="apunte">${f.cerraron} de ${f.casos}${f.alcanza ? "" : " · pocas todavía"}</span>`
                : ""}
            </span>
          </div>`).join("")}
      </div>
      ${paraAjustar.length
        ? html`<p class="frase alerta">
             Lo que viste hasta ahora no coincide con lo que tenés cargado:
             ${paraAjustar.map((f) => `${f.nombre.toLowerCase()} da ${pct(f.medido, 0)} y no ${pct(f.configurado, 0)}`).join("; ")}.
             Cambialo en Ajustes y la proyección se acomoda.</p>`
        : html`<p class="apunte" style="margin-top:10px">
             ${medidas.length
               ? "Salen de las propiedades que ya se fueron de tu cartera."
               : `Son los que cargaste. Cuando ${MINIMO_PARA_MEDIR} propiedades se hayan ido de un estado, la app lo mide sola.`}
           </p>`}
    </section>
  `);
}
