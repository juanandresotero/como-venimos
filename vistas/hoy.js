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

import {
  bandeja, cuantosPendientes, accionesDe, sinAtender,
} from "../lib/pendientes.js";
import { capas, ritmo, formaDelAnio, comparativaCategorias } from "../lib/salud.js";
import { marcarAtendido, editarPropiedad } from "../lib/guardado.js";
import { mandarAlRobot, comoVaElRobot } from "../lib/github.js";
import { medir, vale_la_pena_ajustar } from "../lib/seguridad.js";
import { nivelDe, nivelDelObjetivo } from "../lib/niveles.js";
import { plata, pct, fechaCorta, escapar } from "../lib/formato.js";

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
  const eventos = sinAtender(
    estado.datos.eventos, estado.datos.mis_datos, estado.datos.cartera);
  const grupos = bandeja(estado.datos.negocios, eventos, estado.hoy, estado.datos.cartera);
  const total = cuantosPendientes(grupos);

  const trozo = document.createDocumentFragment();
  trozo.append(encabezado(estado, total));
  trozo.append(cuantoFalta(estado));
  trozo.append(tuNivel(estado));
  trozo.append(tuCategoria(estado));
  trozo.append(queTanSeguro(estado));
  trozo.append(pendientes(total));
  for (const grupo of grupos) trozo.append(dibujarGrupo(grupo, estado));
  trozo.append(mirarLaCartera(estado));
  return trozo;
}

/* ---------- Mandar al robot a mirar ahora ---------- */

/* El robot mira la cartera solo, una vez por dia a las 6 de la mañana. Esto lo manda AHORA.

   Sirve cuando algo cambio en RE/MAX y no se quiere esperar: se publico una propiedad, una
   paso a negociacion, o —el caso que lo pidio— una volvio al mercado y hay que ver que la app
   la de por caida.

   La app no puede correr el robot: es Python y necesita las credenciales de RE/MAX. Lo que
   hace es pedirle a GitHub que lo corra. Por eso tarda un par de minutos y por eso hace falta
   un permiso mas en la llave. */
function mirarLaCartera(estado) {
  const seccion = nodo(html`
    <section style="margin-top:26px;text-align:center">
      <button class="boton boton-chico" id="mirar-cartera">Mirar mi cartera ahora</button>
      <p class="apunte" id="mirar-resultado" style="margin-top:10px"></p>
    </section>
  `);

  const boton = seccion.getElementById("mirar-cartera");
  const resultado = seccion.getElementById("mirar-resultado");

  boton.addEventListener("click", async () => {
    boton.disabled = true;
    boton.textContent = "Mandando…";
    resultado.textContent = "";

    const salida = await mandarAlRobot(estado.token);
    if (!salida.ok) {
      boton.disabled = false;
      boton.textContent = "Mirar mi cartera ahora";
      resultado.textContent = salida.mensaje;
      return;
    }

    boton.textContent = "Mirando…";
    resultado.textContent = "El robot está mirando RE/MAX. Tarda un par de minutos.";
    esperarAlRobot(estado, boton, resultado);
  });

  return seccion;
}

/* Se pregunta cada diez segundos si termino, hasta cuatro minutos.

   Cuatro minutos es el doble de lo que tarda una corrida buena. Pasado eso se deja de
   preguntar y se dice como mirarlo, en vez de quedar dando vueltas para siempre: una rueda
   que gira sin fin es peor que un cartel que dice que no se sabe. */
const CADA = 10000;
const HASTA = 24;

async function esperarAlRobot(estado, boton, resultado) {
  for (let vuelta = 0; vuelta < HASTA; vuelta += 1) {
    await new Promise((seguir) => setTimeout(seguir, CADA));
    const como = await comoVaElRobot(estado.token);
    if (!como.ok || !como.terminada) continue;

    if (!como.salioBien) {
      boton.disabled = false;
      boton.textContent = "Mirar mi cartera ahora";
      resultado.textContent = "El robot falló. Fijate el aviso rojo de arriba en un rato.";
      return;
    }
    boton.textContent = "Listo";
    resultado.textContent = "Terminó. Traigo lo nuevo…";
    /* Los datos ya estan en el repo: se recarga la app entera para bajarlos. Es lo mas
       simple y lo unico que garantiza que TODO quede al dia, no solo la cartera. */
    setTimeout(() => location.reload(), 1200);
    return;
  }
  boton.disabled = false;
  boton.textContent = "Mirar mi cartera ahora";
  resultado.textContent = "Está tardando más de lo normal. Cerrá y volvé a abrir la app en un rato.";
}

function encabezado(estado, total) {
  const mes = MESES[Number(estado.hoy.slice(5, 7)) - 1];
  return nodo(html`
    <section class="cabecera-hoy">
      <p class="etiqueta cabecera-mes">${mes} de ${estado.hoy.slice(0, 4)}</p>
      <div class="cabecera-linea">
        <h1 class="titulo" style="font-size:27px">¿Cómo venimos?</h1>
        ${total
          ? html`<span class="chapa-atencion">⚠ Atención ${total}</span>`
          : html`<span class="apunte">Todo al día</span>`}
      </div>
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

  const forma = formaDelAnio(estado.datos.negocios, anio);
  const r = ritmo(c.cobrado.facturacion, objetivo, anio, estado.hoy, forma);
  const encaminado = c.avanzado.facturacion;
  const descubierto = Math.max(0, objetivo - c.cobrado.facturacion - encaminado);
  const parte = (x) => `${Math.max(0, Math.min(100, (x / objetivo) * 100))}%`;

  return nodo(html`
    <section class="tarjeta">
      <div class="tarjeta-titulo" style="margin-bottom:2px">
        <h2 class="titulo" style="font-size:17px">Para llegar a ${plata(objetivo)}</h2>
        <span class="ritmo-veredicto ${r.aRitmo ? "bien" : "mal"}">
          ${r.aRitmo ? "Vas a ritmo" : "Vas atrasado"}
        </span>
      </div>

      <div class="camino-caja">
        <div class="camino">
          <div class="camino-tramo cobrado" style="width:${parte(c.cobrado.facturacion)}"></div>
          <div class="camino-tramo encaminado" style="width:${parte(encaminado)}"></div>
          <div class="camino-marca" style="left:${parte(objetivo * r.esperado)}"></div>
        </div>
        <!-- La marca decia con un parrafo lo que ahora dice ella misma. Se corre para
             adentro en los bordes para que la etiqueta no se salga de la tarjeta. -->
        <span class="camino-hoy" style="left:${Math.min(78, Math.max(22, (r.esperado * 100)))}%">
          deberías ir acá</span>
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

      <p class="apunte" style="margin-top:10px">Ganancia
        <strong>${plata(c.cobrado.ganancia)}</strong></p>
    </section>
  `);
}

/* En qué escalón estás, en una frase, y recién después los números.

   Antes era una tabla de tres filas con el neto y la diferencia de cada una, y había que
   compararlas de a pares para sacar la conclusión. La conclusión es lo único que importa
   y ahora va primero, escrita. */
/* El nivel de RE/MAX.

   Es el OTRO objetivo, y no se parece al personal: ese lo pone uno y este no lo negocia
   nadie. Van los dos en Hoy porque son dos preguntas distintas — "¿llego a lo que me
   propuse?" y "¿qué nivel me corresponde este año?".

   La barra va del escalon anterior al siguiente y no desde cero: lo que se quiere saber
   es cuanto falta de ESTE tramo. */
function tuNivel(estado) {
  const { negocios, cartera, ajustes } = estado.datos;
  const anio = estado.hoy.slice(0, 4);
  const facturado = capas(negocios, cartera, ajustes, anio).cobrado.facturacion;
  const n = nivelDe(facturado);
  const objetivo = (ajustes.objetivo_personal || {})[anio] || 0;
  const coincide = n.siguiente && nivelDelObjetivo(objetivo) === n.siguiente;

  return nodo(html`
    <section class="tarjeta">
      <h2 class="titulo" style="font-size:17px;margin-bottom:10px">Tu nivel RE/MAX</h2>
      <p class="cifra cifra-grande" style="margin:0 0 2px">
        ${n.actual ? escapar(n.actual.nombre) : "Todavía sin nivel"}
      </p>
      ${n.esElUltimo
        ? html`<p class="frase">✓ Es el nivel más alto. ${plata(n.facturacion)} facturados.</p>`
        : html`
          ${coincide
            ? html`<p class="apunte"><strong>${escapar(n.siguiente.nombre)}</strong> es justo
                tu objetivo del año.</p>`
            : ""}
          ${barraDelNivel(n)}
          <div class="datos" style="margin-top:10px">
            <div class="dato">
              <span class="dato-nombre">${escapar(n.siguiente.nombre)}</span>
              <span class="dato-valor">${plata(n.siguiente.desde)}</span>
            </div>
          </div>`}
    </section>
  `);
}

/* La barra del nivel, con los numeros ADENTRO de cada tramo.

   Cuando un tramo queda muy angosto el numero no entra, asi que sale afuera en un globo
   de historieta que apunta a su tramo. Los dos tramos suman 100%, asi que nunca puede
   pasar que los dos sean angostos a la vez: hay a lo sumo un globo y no se pueden pisar. */
const ENTRA_EL_NUMERO = 22;   // % del ancho de la barra que necesita un monto para caber

function barraDelNivel(n) {
  const hecho = Math.round(n.avance * 100);
  const falta = 100 - hecho;
  const globo = (centro, texto) => html`
    <span class="nivel-globo" style="left:${Math.min(88, Math.max(12, centro))}%">
      ${plata(texto)}</span>`;

  return html`
    <div class="nivel-caja">
      ${hecho < ENTRA_EL_NUMERO ? globo(hecho / 2, n.facturacion) : ""}
      ${falta < ENTRA_EL_NUMERO ? globo(hecho + falta / 2, n.falta) : ""}
      <div class="camino">
        <div class="camino-tramo cobrado" style="width:${hecho}%">
          ${hecho >= ENTRA_EL_NUMERO ? html`<span class="nivel-numero">${plata(n.facturacion)}</span>` : ""}
        </div>
        <div class="camino-tramo" style="width:${falta}%">
          ${falta >= ENTRA_EL_NUMERO ? html`<span class="nivel-numero apagado">${plata(n.falta)}</span>` : ""}
        </div>
      </div>
    </div>`;
}

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
      <p class="apunte">${Math.round(actual.split * 100)}% de cada comisión ·
        ${plata(actual.fee / Math.max(1, Number(estado.hoy.slice(5, 7))))} de fee por mes</p>

      <p class="frase ${conviene ? "" : "alerta"}">
        ${conviene
          ? html`✓ Es la que más te deja este año.`
          : html`Con <strong>${escapar(mejor.categoria)}</strong> habrías ganado
             <strong>${plata(mejor.neto - actual.neto)} más</strong>.`}
      </p>

      <div class="datos">
        ${otras.map((f) => html`
          <div class="dato">
            <span class="dato-nombre">${escapar(f.categoria)}
              <span class="apunte">${Math.round(f.split * 100)}%</span></span>
            <span class="dato-valor" style="color:${f.diferencia > 0 ? "var(--azul)" : "var(--tinta-2)"}">
              ${f.diferencia > 0 ? "+" : ""}${plata(f.diferencia)}
            </span>
          </div>`).join("")}
      </div>
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
      ${item.mas
        ? html`<ul class="grupo-item-mas">${item.mas
            .map((d) => `<li>${escapar(d)}</li>`).join("")}</ul>`
        : html`<p class="grupo-item-detalle">${escapar(item.detalle)}</p>`}
      <div class="botonera"></div>
    `;

    /* El primero es el que resuelve, y va pintado. "Ya lo resolví" viene despues y
       apagado: descartar el aviso no arregla lo que el aviso decia. */
    const botonera = li.querySelector(".botonera");
    accionesDe(item).forEach((accion, i) => {
      const boton = document.createElement("button");
      boton.className = `boton boton-chico${i === 0 ? " boton-primario" : ""}`;
      boton.textContent = accion.texto;
      boton.addEventListener("click", async () => {
        if (accion.tipo === "atendido") {
          // Puede traer varios: un pendiente juntado despacha todos sus avisos de una.
          for (const id of accion.destino) marcarAtendido(estado, id);
          estado.redibujar();
        } else if (accion.tipo === "cuenta" || accion.tipo === "no-cuenta") {
          /* El duplicado: la unica pregunta que hay que contestar es si esa propiedad cuenta
             en los numeros. El robot ya la saco de la proyeccion al detectarla; esto la
             devuelve, o confirma que se queda afuera. */
          editarPropiedad(estado, accion.destino, {
            usar_en_proyeccion: accion.tipo === "cuenta",
            posible_duplicado_de: accion.tipo === "cuenta" ? null : undefined,
          });
          for (const id of item.eventos || []) marcarAtendido(estado, id);
          await estado.guardar();
          estado.redibujar();
        } else {
          estado.irA(accion.tipo, accion.destino);
        }
      });
      botonera.append(boton);
    });
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
        <span class="apunte">${medidas.length ? "medido" : "tus números"}</span>
      </div>
      <div class="datos">
        ${filas.map((f) => html`
          <div class="dato">
            <span class="dato-nombre">${escapar(f.nombre)}</span>
            <span class="dato-valor">${pct(f.usar, 0)}
              ${f.casos
                ? html`<br><span class="apunte">${f.cerraron} de ${f.casos}${f.alcanza ? "" : " · pocas todavía"}</span>`
                : ""}
            </span>
          </div>`).join("")}
      </div>
      ${paraAjustar.length
        ? html`<p class="frase alerta">No coincide con lo que tenés cargado:
             ${paraAjustar.map((f) => `${f.nombre.toLowerCase()} da ${pct(f.medido, 0)}`).join("; ")}.
             Cambialo en Ajustes.</p>`
        : ""}
    </section>
  `);
}
