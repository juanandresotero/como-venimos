/* Resumen personal: cuánto tengo, cuánto debo este mes y con cuánto quedo.

   Tres números y nada más arriba. Después el que de verdad frena la mano —cuánto queda por
   día— y recién abajo las gráficas.

   Sin un párrafo de explicación en toda la pantalla: los rótulos dicen qué es cada cosa y
   los números hablan solos. */

import {
  leer, guardar, resumen, mesAMes, proyeccionDelMes, conElCambioDeducido,
  aTexto, desdeTexto, proximoId, MONEDAS,
} from "../lib/personal.js";
import { cotizacionVigente } from "../lib/cambio.js";
import { lineas } from "../lib/graficos.js";
import { bajarArchivo } from "../lib/compartir.js";
import { plata, escapar, numeroDesde, formatearMientrasEscribe } from "../lib/formato.js";
import { telon } from "./ventana.js";

const html = (c, ...v) => c.reduce((t, x, i) => t + x + (v[i] ?? ""), "");

function nodo(marca) {
  const molde = document.createElement("template");
  molde.innerHTML = marca.trim();
  return molde.content;
}

const MESES = ["ene", "feb", "mar", "abr", "may", "jun",
               "jul", "ago", "sep", "oct", "nov", "dic"];

/* Cada moneda con su símbolo. El signo va adelante del símbolo y no en el medio: "-$ 200"
   se lee mal, "$ -200" también, y lo que se entiende es "−$ 200". */
function monto(n, moneda) {
  const valor = Math.round(n || 0);
  const simbolo = moneda === "USD" ? "USD " : "$ ";
  return `${valor < 0 ? "−" : ""}${simbolo}${plata(Math.abs(valor))}`;
}

const nombreDelMes = (mes) => {
  const [a, m] = String(mes).split("-").map(Number);
  return `${MESES[m - 1]} ${String(a).slice(2)}`;
};

/* Las monedas que de verdad se están usando. Mostrar un renglón de dólares en cero cuando
   nunca hubo un dólar es ruido; en cuanto aparece uno, aparece el renglón. */
function enUso(datos, tengo) {
  /* Los pesos SIEMPRE, y primero: es la moneda del día a día, y un saldo en CERO es un dato
     —quiere decir que no queda nada— no una moneda que no existe. Que el renglón desaparezca
     justo cuando se acabó la plata es lo contrario de lo que uno necesita ver.

     Los dólares aparecen si hay saldo o si alguna vez se movió alguno. */
  const hayDolares = tengo.USD !== 0
    || datos.arranque.usd !== 0
    || datos.entradas.some((e) => e.moneda === "USD")
    || datos.variables.some((v) => v.moneda === "USD")
    || datos.cambios.length > 0
    || datos.fijos.some((f) => f.moneda === "USD");
  return hayDolares ? ["UYU", "USD"] : ["UYU"];
}

export function dibujarPersonalResumen(estado) {
  const datos = leer();
  const trozo = document.createDocumentFragment();

  if (!datos.arranque.fecha) {
    trozo.append(primeraVez(estado, datos));
    return trozo;
  }

  const r = resumen(datos, estado.datos.negocios, estado.hoy);
  const monedas = enUso(datos, r.tengo);

  trozo.append(loQueTengo(r, monedas));
  trozo.append(esteMes(r, monedas));
  trozo.append(movimientos(estado, datos));
  trozo.append(losMovimientos(estado, datos));
  if (r.hayMovimiento) trozo.append(elMesAMes(datos, estado.hoy, monedas));
  trozo.append(laCopia(estado, datos));
  return trozo;
}

/* ---------- La primera vez ---------- */

/* Sin saldo inicial no hay nada que mostrar, así que la pantalla es un solo formulario. Los
   750 y 3.800 vienen puestos porque son los números que dio Juan: si son esos, entra de un
   toque; si no, los pisa. */
function primeraVez(estado, datos) {
  const seccion = nodo(html`
    <section>
      <h1 class="titulo" style="font-size:26px;margin-bottom:16px">¿Con cuánto arrancás?</h1>
      <div class="tarjeta" style="padding:0;overflow:hidden" id="p-arranque"></div>
      <div class="botonera" style="margin-top:14px">
        <button class="boton boton-primario" id="p-empezar">Empezar</button>
      </div>
    </section>
  `);
  const caja = seccion.getElementById("p-arranque");
  const puesto = { uyu: 3800, usd: 750 };
  caja.append(campoMonto("ini-uyu", "En pesos", "$", puesto.uyu, (v) => { puesto.uyu = v; }));
  caja.append(campoMonto("ini-usd", "En dólares", "USD", puesto.usd, (v) => { puesto.usd = v; }));

  seccion.getElementById("p-empezar").addEventListener("click", () => {
    guardar({
      ...datos,
      arranque: { fecha: estado.hoy, uyu: puesto.uyu || 0, usd: puesto.usd || 0 },
    });
    estado.redibujar();
  });
  return seccion;
}

/* ---------- Los tres números ---------- */

function loQueTengo(r, monedas) {
  /* Las dos monedas del MISMO tamaño y una al lado de la otra. Estuvo un rato con los pesos
     grandes y los dólares en un renglón chico abajo, y Juan lo corrigió: no es la moneda del
     día a día contra una secundaria — son dos cajas que valen igual, sólo que una se gasta y
     la otra se guarda. */
  if (monedas.length === 1) {
    const m = monedas[0];
    return nodo(html`
      <section style="margin-bottom:18px">
        <p class="renta-nombre" style="margin-bottom:4px">Tengo</p>
        <p class="cifra cifra-heroe" style="margin:0;line-height:1.05;color:${
          r.tengo[m] < 0 ? "var(--rojo)" : "var(--azul)"}">${monto(r.tengo[m], m)}</p>
      </section>
    `);
  }

  return nodo(html`
    <section style="margin-bottom:18px">
      <p class="renta-nombre" style="margin-bottom:6px">Tengo</p>
      <div class="dos-rentas">
        ${monedas.map((m) => html`
          <div class="renta-caja ${m === "UYU" ? "principal" : ""}">
            <p class="renta-nombre">${m === "USD" ? "Dólares" : "Pesos"}</p>
            <p class="cifra cifra-grande renta-cifra" style="color:${
              r.tengo[m] < 0 ? "var(--rojo)" : "var(--azul)"}">${monto(r.tengo[m], m)}</p>
          </div>`).join("")}
      </div>
    </section>
  `);
}

/* Lo que falta pagar y con cuánto queda si lo paga. Es la pregunta que Juan escribió tal
   cual: "los gastos que tengo este mes sin pagar y cuánto me quedaría la cuenta si pago". */
function esteMes(r, monedas) {
  /* UN renglón por concepto, con las dos monedas juntas adentro. Repetir el rótulo —"Me
     queda" en pesos y otra vez "Me queda" en dólares— se lee como si fueran dos cosas
     distintas cuando es la misma pregunta contestada en dos cajas. */
  const enLasDos = (caja, { colorear = false, saltearCeros = false } = {}) => monedas
    .filter((m) => !saltearCeros || caja[m])
    .map((m) => (colorear && caja[m] < 0
      ? html`<span style="color:var(--rojo)">${monto(caja[m], m)}</span>`
      : monto(caja[m], m)))
    .join(" · ");

  return nodo(html`
    <section class="tarjeta tarjeta-resumen">
      <div class="datos">
        <div class="dato">
          <span class="dato-nombre">Falta pagar este mes
            ${r.pendientes.length
              ? html`<br><span class="apunte">${r.pendientes.length} sin pagar</span>`
              : ""}</span>
          <span class="dato-valor">${r.pendientes.length
            ? `${r.pendientes.some((p) => p.aproximado) ? "≈ " : ""}${
                enLasDos(r.falta, { saltearCeros: true })}`
            : "al día"}</span>
        </div>
        <div class="dato">
          <span class="dato-nombre"><strong>Me queda</strong></span>
          <span class="dato-valor"><strong>${enLasDos(r.queda, { colorear: true })}</strong></span>
        </div>
      </div>

      <div class="dos-rentas" style="margin-top:14px">
        <div class="renta-caja principal">
          <p class="renta-nombre">Por día</p>
          <p class="cifra cifra-grande renta-cifra" style="color:${
            r.porDia.UYU < 0 ? "var(--rojo)" : "var(--azul)"}">${monto(r.porDia.UYU, "UYU")}</p>
          <p class="renta-pie">quedan ${r.diasQueFaltan} días</p>
        </div>
        <div class="renta-caja">
          <p class="renta-nombre">Vas gastando</p>
          <p class="cifra cifra-grande renta-cifra">${monto(r.ritmo.UYU.ahora, "UYU")}</p>
          <p class="renta-pie">${comoVieneElRitmo(r.ritmo.UYU)}</p>
        </div>
      </div>
    </section>
  `);
}

/* Contra el mes pasado a la misma altura. Sin comparación, no se inventa un porcentaje. */
function comoVieneElRitmo(ritmo) {
  /* "100% menos que el mes pasado" es correcto y se lee pésimo. Si todavía no se gastó
     nada, eso es lo que hay que decir. */
  if (!ritmo.ahora) return "todavía nada";
  if (ritmo.cambio === null) return "primer mes";
  const puntos = Math.round(Math.abs(ritmo.cambio) * 100);
  if (puntos < 5) return "igual que el mes pasado";
  return `${puntos}% ${ritmo.cambio > 0 ? "más" : "menos"} que el mes pasado`;
}

/* ---------- Entró plata / cambié plata ---------- */

/* Dos cosas que pasan seguido y que sin esto rompen la cuenta: plata que entra y no viene de
   un negocio, y dólares que se venden para vivir en pesos. Sin el cambio, el saldo en pesos
   se va a negativo mientras el de dólares no baja nunca. */
function movimientos(estado, datos) {
  const seccion = nodo(html`
    <div class="botonera" style="margin:14px 0 18px">
      <button class="boton boton-chico" id="p-entro">Entró plata</button>
    </div>
  `);
  seccion.getElementById("p-entro").addEventListener("click",
    () => ventanaEntrada(estado, datos));
  return seccion;
}

function ventanaEntrada(estado, datos) {
  const puesto = { monto: null, moneda: "UYU", nota: "" };
  const cuerpo = nodo(html`
    <div class="panel-firma">
      <h2 class="titulo" style="font-size:19px;margin-bottom:14px">Entró plata</h2>
      <div class="tarjeta" style="padding:0;overflow:hidden" data-campos></div>
      <div class="botonera" style="margin-top:14px">
        <button class="filtro prendido" data-moneda="UYU">Pesos</button>
        <button class="filtro" data-moneda="USD">Dólares</button>
      </div>
      <div class="botonera" style="margin-top:14px">
        <button class="boton boton-primario" data-guardar>Guardar</button>
        <button class="boton" data-cerrar>Cerrar</button>
      </div>
    </div>
  `);
  const campos = cuerpo.querySelector("[data-campos]");
  campos.append(campoMonto("ent-monto", "Cuánto", "", null, (v) => { puesto.monto = v; }));
  campos.append(campoTexto("ent-nota", "De qué", puesto.nota, (v) => { puesto.nota = v; }));

  /* Se busca DENTRO de la ventanita y no en el documento: atrás sigue viva la pantalla de
     abajo, y un getElementById global se quedaría con el primero que encuentre. */
  const { caja, cerrar } = telon(cuerpo);
  for (const boton of caja.querySelectorAll("[data-moneda]")) {
    boton.addEventListener("click", () => {
      puesto.moneda = boton.dataset.moneda;
      for (const otro of caja.querySelectorAll("[data-moneda]")) {
        otro.classList.toggle("prendido", otro === boton);
      }
    });
  }
  caja.querySelector("[data-cerrar]").addEventListener("click", cerrar);
  caja.querySelector("[data-guardar]").addEventListener("click", () => {
    if (!puesto.monto) { cerrar(); return; }
    const entradas = [...datos.entradas, {
      id: proximoId(datos.entradas), fecha: estado.hoy,
      monto: puesto.monto, moneda: puesto.moneda, nota: puesto.nota,
    }];
    guardar({ ...datos, entradas });
    cerrar();
    estado.redibujar();
  });
}

/* ---------- Lo que ya se cargó, para poder deshacerlo ---------- */

/* Sin esto, una entrada mal cargada quedaba para siempre inflando el saldo y no había forma
   de sacarla: los gastos se pueden borrar desde su pantalla, pero la plata que entra y los
   cambios de moneda no vivían en ninguna lista.

   Va plegado —se mira cuando algo no cierra, no todos los días— pero con la cuenta en la
   tapa, para que se sepa que está ahí sin tener que abrirlo. */
function losMovimientos(estado, datos) {
  const filas = [
    ...datos.entradas.map((e) => ({
      tipo: "entradas", id: e.id, fecha: e.fecha,
      que: e.nota || "Entró plata",
      cuanto: monto(e.monto, e.moneda),
    })),
    ...datos.cambios.map((c) => ({
      tipo: "cambios", id: c.id, fecha: c.fecha,
      /* Los deducidos se nombran distinto a propósito: es una cuenta que hizo la app, no algo
         que Juan anotó, y tiene que poder mirarla con desconfianza. */
      que: `${c.de === "USD" ? "Vendiste dólares" : "Compraste dólares"}${
        c.automatico ? " (deducido)" : ""}`,
      cuanto: `${monto(c.monto_de, c.de)} → ${monto(c.monto_a, c.a)}`,
    })),
  ].sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));

  if (!filas.length) return document.createDocumentFragment();

  const seccion = nodo(html`
    <details class="grupo" style="margin-bottom:18px">
      <summary class="grupo-cabeza">
        <span class="grupo-nombre">Plata que entró y cambios de moneda</span>
        <span class="apunte grupo-resumen">${filas.length}</span>
        <span class="grupo-flecha" aria-hidden="true">›</span>
      </summary>
      <div class="lista" style="margin-top:6px" data-lista></div>
    </details>
  `);

  const lista = seccion.querySelector("[data-lista]");
  for (const f of filas) {
    const fila = nodo(html`
      <div class="fila">
        <span class="fila-cuerpo">
          <span class="fila-titulo">${escapar(f.que)}</span>
          <span class="fila-sub">${escapar(String(f.fecha).slice(8, 10))}/${
            escapar(String(f.fecha).slice(5, 7))}</span>
        </span>
        <span class="fila-derecha">
          <span class="cifra cifra-media">${f.cuanto}</span>
          <span class="chip-apagado" data-borrar>borrar</span>
        </span>
      </div>
    `);
    fila.querySelector("[data-borrar]").addEventListener("click", () => {
      guardar({ ...datos, [f.tipo]: datos[f.tipo].filter((x) => x.id !== f.id) });
      estado.redibujar();
    });
    lista.append(fila);
  }
  return seccion;
}

/* ---------- Mes a mes y la proyección ---------- */

function elMesAMes(datos, hoy, monedas) {
  const serie = mesAMes(datos, hoy, 6);
  const p = proyeccionDelMes(datos, hoy);

  const grafica = (m) => {
    const puntos = serie.map((x) => ({ gasto: x.gastado[m] }));
    if (!puntos.some((x) => x.gasto > 0)) return "";
    return html`
      <div style="margin-top:12px">
        <p class="apunte" style="margin-bottom:4px">${m === "USD" ? "En dólares" : "En pesos"}</p>
        ${lineas([{ puntos, destacada: true }], { campo: "gasto", relleno: true,
          titulo: "gasto mes a mes" })}
      </div>`;
  };

  return nodo(html`
    <section class="tarjeta">
      <div class="tarjeta-titulo">
        <h2 class="titulo" style="font-size:17px">Mes a mes</h2>
        <span class="apunte">${nombreDelMes(serie[0].mes)} — ${nombreDelMes(serie[5].mes)}</span>
      </div>
      ${monedas.map(grafica).join("")}
      ${p && p.proyectado.UYU > 0
        ? html`<p class="apunte" style="margin-top:14px">
             Al ritmo de estos ${p.dia} días, ${nombreDelMes(p.mes)} termina en
             <strong>${monto(p.proyectado.UYU, "UYU")}</strong>.</p>`
        : ""}
    </section>
  `);
}

/* ---------- La copia de respaldo ---------- */

/* La contracara de guardar sólo en el teléfono: si no se puede bajar una copia, cambiar de
   celular es perder todo el historial. Va plegado porque se toca una vez por mes, no todos
   los días — pero el aviso de que el archivo lleva todo adentro va SIEMPRE a la vista. */
function laCopia(estado, datos) {
  const seccion = nodo(html`
    <details class="grupo" style="margin-top:18px">
      <summary class="grupo-cabeza">
        <span class="grupo-nombre">Copia de seguridad</span>
        <span class="grupo-flecha" aria-hidden="true">›</span>
      </summary>
      <div class="tarjeta" style="margin-top:6px">
        <p class="apunte">Esto vive sólo en este teléfono. Si lo cambiás o borrás los datos
          del navegador, se pierde. Acá bajás una copia de <strong>lo personal</strong>; en
          Ajustes hay una que trae <strong>todo</strong> lo del teléfono junto.</p>
        <div class="botonera" style="margin-top:12px">
          <button class="boton boton-chico" id="p-bajar">Bajar una copia</button>
          <button class="boton boton-chico" id="p-subir">Cargar una copia</button>
        </div>
        <p class="apunte" style="margin-top:12px;color:var(--rojo-tinta)">
          El archivo lleva adentro cuánta plata tenés y en qué la gastás. Guardalo donde
          guardarías un resumen del banco.</p>
        <input type="file" id="p-archivo" accept="application/json,.json" hidden>
      </div>
    </details>
  `);

  seccion.getElementById("p-bajar").addEventListener("click", async () => {
    const trozo = new Blob([aTexto(datos)], { type: "application/json" });
    await bajarArchivo(trozo, `como-venimos-personal-${estado.hoy}.json`);
  });

  const archivo = seccion.getElementById("p-archivo");
  seccion.getElementById("p-subir").addEventListener("click", () => archivo.click());
  archivo.addEventListener("change", async () => {
    const elegido = archivo.files && archivo.files[0];
    if (!elegido) return;
    const leido = desdeTexto(await elegido.text());
    if (!leido) {
      window.alert("Ese archivo no es una copia de esta app.");
      return;
    }
    /* Cargar una copia PISA lo que hay. Se pregunta antes porque no hay vuelta atrás. */
    if (!window.confirm("Esto reemplaza todo lo que tenés cargado. ¿Seguimos?")) return;
    guardar(leido);
    estado.redibujar();
  });
  return seccion;
}

/* ---------- Campos ---------- */

function campoMonto(id, etiqueta, sufijo, valor, alCambiar) {
  const fila = document.createElement("div");
  fila.className = "campo-fila";
  fila.innerHTML = html`
    <label for="${id}">${escapar(etiqueta)}
      ${sufijo ? html`<span class="apunte">${escapar(sufijo)}</span>` : ""}</label>
    <input class="campo" id="${id}" type="text" inputmode="decimal"
           value="${valor === null || valor === undefined ? "" : plata(valor)}" placeholder="0">
  `;
  const control = fila.querySelector(".campo");
  formatearMientrasEscribe(control);
  control.addEventListener("input", () => alCambiar(numeroDesde(control.value)));
  return fila;
}

function campoTexto(id, etiqueta, valor, alCambiar) {
  const fila = document.createElement("div");
  fila.className = "campo-fila";
  fila.innerHTML = html`
    <label for="${id}">${escapar(etiqueta)}</label>
    <input class="campo" id="${id}" type="text" value="${escapar(valor || "")}">
  `;
  const control = fila.querySelector(".campo");
  control.addEventListener("input", () => alCambiar(control.value));
  return fila;
}

/* Guardar, y si al hacerlo una caja quedó en rojo, anotar el cambio de moneda que lo
   explica. Lo usan las tres pantallas: es la única puerta por la que sale plata.

   Nadie paga en pesos con plata que no tiene — si la caja de pesos queda negativa y hay
   dólares, lo que pasó de verdad es que se cambiaron. El movimiento queda anotado y visible
   en "Plata que entró y cambios de moneda", donde se puede corregir o borrar: es una
   deducción de la app, no algo que el usuario dijo.

   La cotización es la que la app tiene ese día. NO es la del BBVA: el BCU la publica pero no
   deja leerla desde una página estática, y el BBVA no contesta. Por eso el cambio se guarda
   con la cotización usada adentro, para poder auditarlo después. */
export function guardarConCambio(estado, datos) {
  const dolar = cotizacionVigente(estado.datos.ajustes, null).valor;
  const { datos: conCambio } = conElCambioDeducido(
    datos, estado.datos.negocios, estado.hoy, dolar);
  guardar(conCambio);
}

export { campoMonto, campoTexto, monto, nombreDelMes };
