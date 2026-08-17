/* Salud del Negocio: las tres capas, el ritmo contra el calendario y las metricas.

   La barra de ritmo es el elemento central: muestra el avance real contra un marcador
   de calendario. La distancia entre los dos es toda la informacion. */

import { capas, ritmo, metricas, porAnio, porMes, comparativaCategorias } from "../lib/salud.js";
import { recomendaciones, contarPendientes } from "../lib/recomendaciones.js";
import { armarReporte, nombreArchivo } from "../lib/reporte.js";
import { plata, plataUSD, compacto, pct, escapar } from "../lib/formato.js";

const html = (cadenas, ...valores) =>
  cadenas.reduce((t, c, i) => t + c + (valores[i] ?? ""), "");

function nodo(marca) {
  const molde = document.createElement("template");
  molde.innerHTML = marca.trim();
  return molde.content;
}

export function dibujarSalud(estado) {
  const { negocios, cartera, ajustes } = estado.datos;
  const anio = estado.hoy.slice(0, 4);
  const c = capas(negocios, cartera, ajustes, anio);
  const objetivo = (ajustes.objetivo_personal || {})[anio] || 0;
  const r = ritmo(c.cobrado.facturacion, objetivo, anio, estado.hoy);
  const m = metricas(negocios, anio);
  const anios = porAnio(negocios);
  const cats = comparativaCategorias(negocios, ajustes, anio, estado.hoy);

  const eventosSinAtender = (estado.datos.eventos || []).filter((e) => {
    const atendidos = new Set((estado.datos.mis_datos || {}).eventos_atendidos || []);
    return !atendidos.has(e.id) && !e.atendido;
  });
  const consejos = recomendaciones(
    estado.datos, anio, estado.hoy, contarPendientes(negocios, eventosSinAtender)
  );

  const trozo = document.createDocumentFragment();
  trozo.append(cabecera(anio, c));
  if (r) trozo.append(barraDeRitmo(r, objetivo, c, anio));
  trozo.append(tresCapas(c));
  if (consejos.length) trozo.append(queHacer(consejos));
  trozo.append(graficaMensual(porMes(negocios, anio), anio));
  if (anios.length) trozo.append(graficaAnual(anios, anio));
  trozo.append(metricasDelAnio(m));
  if (cats.length) trozo.append(comparativa(cats));
  if (c.publicado.detalle.length) trozo.append(propiedadesUsadas(c.publicado, estado));
  trozo.append(descargarReporte(estado, anio));
  return trozo;
}

const ROJAS = new Set(["falta_volumen", "categoria", "concentracion", "trabadas"]);

function queHacer(consejos) {
  return nodo(html`
    <section class="tarjeta">
      <div class="tarjeta-titulo">
        <h2 class="titulo">Qué hacer</h2>
        <span class="apunte">con tus propios números</span>
      </div>
      ${consejos.map((c) => html`
        <div class="consejo ${ROJAS.has(c.clave) ? "rojo" : ""}">
          <p class="consejo-titulo">${escapar(c.titulo)}</p>
          <p class="consejo-detalle">${escapar(c.detalle)}</p>
        </div>`).join("")}
    </section>
  `);
}

const MESES_CORTOS = ["E", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];

function graficaMensual(meses, anio) {
  const tope = Math.max(...meses.map((m) => m.ganancia), 1);
  const mesActual = new Date().getMonth() + 1;
  const total = meses.reduce((t, m) => t + m.ganancia, 0);
  const mejor = meses.reduce((a, b) => (b.ganancia > a.ganancia ? b : a), meses[0]);
  return nodo(html`
    <section class="tarjeta">
      <div class="tarjeta-titulo">
        <h2 class="titulo">Tu ganancia mes a mes</h2>
        <span class="apunte">${plataUSD(total)} en ${anio}</span>
      </div>
      <div class="barras">
        ${meses.map((m, i) => html`
          <div class="barras-columna ${m.mes === mesActual ? "actual" : ""}">
            <span class="barras-tope">${m.ganancia ? compacto(m.ganancia) : ""}</span>
            <div class="barras-cana" style="height:${(m.ganancia / tope) * 100}%"></div>
            <span class="barras-pie">${MESES_CORTOS[i]}</span>
          </div>`).join("")}
      </div>
      ${mejor && mejor.ganancia
        ? html`<p class="apunte" style="margin-top:10px">Tu mejor mes fue
             ${["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto",
                "septiembre", "octubre", "noviembre", "diciembre"][mejor.mes - 1]}, con
             ${plataUSD(mejor.ganancia)}.</p>`
        : ""}
    </section>
  `);
}

/* El reporte se arma en el momento y se baja como archivo. No hay servidor atras: es el
   mismo navegador el que escribe el HTML. */
function descargarReporte(estado, anio) {
  const seccion = nodo(html`
    <section class="tarjeta">
      <h2 class="titulo" style="font-size:17px;margin-bottom:6px">Llevate el reporte</h2>
      <p class="apunte" style="margin-bottom:12px">
        Un archivo con todo esto adentro: capas, ritmo, gráficas y qué hacer para llegar.
        Se abre en cualquier teléfono, aunque no haya señal.
      </p>
      <div class="botonera" style="margin-top:0">
        <button class="boton boton-primario" id="bajar-reporte">Descargar</button>
        <button class="boton" id="compartir-reporte">Compartir</button>
      </div>
      <p class="apunte" id="aviso-reporte" style="margin-top:10px"></p>
    </section>
  `);

  const construir = () => armarReporte(estado.datos, anio, estado.hoy);
  const aviso = seccion.getElementById("aviso-reporte");

  seccion.getElementById("bajar-reporte").addEventListener("click", () => {
    const blob = new Blob([construir()], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const enlace = document.createElement("a");
    enlace.href = url;
    enlace.download = nombreArchivo(anio, estado.hoy);
    enlace.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    aviso.textContent = "Descargado.";
  });

  seccion.getElementById("compartir-reporte").addEventListener("click", async () => {
    const archivo = new File([construir()], nombreArchivo(anio, estado.hoy), { type: "text/html" });
    if (navigator.canShare && navigator.canShare({ files: [archivo] })) {
      try {
        await navigator.share({ files: [archivo], title: `¿Cómo venimos? ${anio}` });
        return;
      } catch {
        return;   // se cancelo
      }
    }
    aviso.textContent = "Este navegador no comparte archivos. Descargalo y adjuntalo.";
  });

  return seccion;
}

/* Los dos números que el usuario pidió tener siempre a mano: lo que lleva ganado hasta
   hoy, y lo que va a tener si cierra todo lo que ya está avanzado. Los dos con las dos
   caras de la plata: lo que factura RE/MAX y lo que le queda a él. */
function cabecera(anio, c) {
  const suma = (campo) => c.cobrado[campo] + c.avanzado[campo];
  return nodo(html`
    <section class="tarjeta">
      <p class="etiqueta">Cobrado en ${anio}</p>
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
    </section>
  `);
}

function barraDeRitmo(r, objetivo, c, anio) {
  const relleno = Math.min(100, r.avance * 100);
  const marca = Math.min(100, r.calendario * 100);
  const veredicto = r.aRitmo ? "Vas a ritmo" : "Vas atrasado";
  return nodo(html`
    <section class="tarjeta">
      <div class="tarjeta-titulo">
        <h2 class="titulo">Ritmo</h2>
        <span class="ritmo-veredicto ${r.aRitmo ? "bien" : "mal"}">${veredicto}</span>
      </div>
      <div class="ritmo">
        <div class="ritmo-pista ${r.aRitmo ? "" : "atrasado"}">
          <div class="ritmo-relleno" style="width:${relleno}%"></div>
          <div class="ritmo-marca" style="left:${marca}%" data-texto="hoy"></div>
        </div>
        <div class="ritmo-pies">
          <span><strong>${pct(r.avance)}</strong> del objetivo</span>
          <span>${pct(r.calendario)} del año</span>
        </div>
      </div>
      <div class="datos" style="margin-top:16px">
        <div class="dato"><span class="dato-nombre">Objetivo ${anio}</span><span class="dato-valor">${plata(objetivo)}</span></div>
        <div class="dato"><span class="dato-nombre">Te faltan</span><span class="dato-valor">${plata(r.falta)}</span></div>
        <div class="dato"><span class="dato-nombre">Por mes, para llegar</span><span class="dato-valor">${plata(r.porMes)}</span></div>
        <div class="dato"><span class="dato-nombre">A fin de año, a este paso</span><span class="dato-valor">${plata(r.proyeccion)}</span></div>
        <div class="dato"><span class="dato-nombre">Si cierra toda tu cartera</span><span class="dato-valor">${plata(c.total.facturacion)} · ${plata(c.total.ganancia)} tuyos</span></div>
      </div>
      ${r.falta > 0 && c.total.facturacion < objetivo
        ? html`<p class="aviso">Aun cerrando <strong>todo</strong> lo que tenés hoy llegás a
             ${plata(c.total.facturacion)}. Te faltan <strong>${plata(objetivo - c.total.facturacion)}</strong>
             de negocio nuevo para el objetivo.</p>`
        : ""}
    </section>
  `);
}

/* Los cuatro momentos del camino de la plata. Cada uno al 100%: la pregunta es "cuánto
   cobro si esto cierra", no "cuánto vale hoy". */
/* Los tres momentos que SUMAN — cobrado, reservado y en negociación — y abajo, separado,
   lo potencial: lo que está publicado y todavía no se movió.

   Lo potencial no suma a propósito. Es lo que hay dando vueltas, no lo que está por
   entrar, y mezclarlo con lo demás daba un número que no se podía leer de un vistazo. */
function tresCapas(c) {
  const suma = c.encaminado.facturacion || 1;
  const ancho = (x) => `${Math.min(100, (x / suma) * 100)}%`;
  const cuantas = (n, uno, muchos) => `${n} ${n === 1 ? uno : muchos}`;

  const fila = (clase, nombre, sub, grupo, aparte) => html`
    <div class="capa${aparte ? " aparte" : ""}">
      <span class="capa-punto ${clase}"></span>
      <span><span class="capa-nombre">${nombre}</span><br><span class="capa-sub">${sub}</span></span>
      <span class="capa-monto">
        <span class="cifra cifra-media">${plata(grupo.ganancia)}</span><br>
        <span class="capa-sub">de ${plata(grupo.facturacion)} facturados</span>
      </span>
    </div>`;

  return nodo(html`
    <section class="tarjeta">
      <h2 class="titulo" style="margin-bottom:14px">De dónde sale la plata</h2>
      <div class="capas-barra">
        <div class="capas-tramo uno" style="width:${ancho(c.cobrado.facturacion)}"></div>
        <div class="capas-tramo dos" style="width:${ancho(c.reservado.facturacion)}"></div>
        <div class="capas-tramo tres" style="width:${ancho(c.negociacion.facturacion)}"></div>
      </div>
      ${fila("uno", "Cobrado", cuantas(c.cobrado.negocios, "negocio cerrado", "negocios cerrados"), c.cobrado)}
      ${fila("dos", "Reservado", `${cuantas(c.reservado.cantidad, "propiedad", "propiedades")} · falta escriturar`, c.reservado)}
      ${fila("tres", "En negociación", `${cuantas(c.negociacion.cantidad, "propiedad", "propiedades")} · hay oferta`, c.negociacion)}

      <div class="capa capa-total">
        <span></span>
        <span class="capa-nombre">Total</span>
        <span class="capa-monto">
          <span class="cifra cifra-media">${plata(c.encaminado.ganancia)}</span><br>
          <span class="capa-sub">de ${plata(c.encaminado.facturacion)} facturados</span>
        </span>
      </div>

      ${fila("cuatro", "Potencial", `${cuantas(c.publicado.cantidad, "propiedad", "propiedades")} publicadas · no suma`, c.publicado, true)}
    </section>
  `);
}

function graficaAnual(anios, anioActual) {
  const tope = Math.max(...anios.map((a) => a.facturacion), 1);
  const columnas = anios
    .map(
      (a) => html`
      <div class="barras-columna ${a.anio === anioActual ? "actual" : ""}">
        <span class="barras-tope">${compacto(a.facturacion)}</span>
        <div class="barras-cana" style="height:${(a.facturacion / tope) * 100}%"></div>
        <span class="barras-pie">${a.anio.slice(2)}</span>
      </div>`
    )
    .join("");
  const totalCarrera = anios.reduce((t, a) => t + a.facturacion, 0);
  return nodo(html`
    <section class="tarjeta">
      <div class="tarjeta-titulo">
        <h2 class="titulo">Tu carrera</h2>
        <span class="apunte">${plataUSD(totalCarrera)} facturados</span>
      </div>
      <div class="barras">${columnas}</div>
    </section>
  `);
}

function metricasDelAnio(m) {
  const barrio = m.barrios[0];
  const origen = m.origenes[0];
  return nodo(html`
    <section class="tarjeta">
      <h2 class="titulo" style="margin-bottom:14px">Cómo trabajás</h2>
      <div class="datos">
        <div class="dato"><span class="dato-nombre">Negocios cerrados</span><span class="dato-valor">${m.total} · ${m.ventas} venta / ${m.alquileres} alquiler</span></div>
        <div class="dato"><span class="dato-nombre">Ticket mediano de venta</span><span class="dato-valor">${plata(m.ticketVenta)}</span></div>
        <div class="dato"><span class="dato-nombre">Puntas por negocio</span><span class="dato-valor">${m.puntasPromedio.toFixed(2).replace(".", ",")}</span></div>
        <div class="dato"><span class="dato-nombre">De inicio a firma (venta)</span><span class="dato-valor">${m.plazoVenta ? `${m.plazoVenta} días` : "—"}</span></div>
        ${barrio ? html`<div class="dato"><span class="dato-nombre">Barrio que más te dio</span><span class="dato-valor">${escapar(barrio.nombre)}</span></div>` : ""}
        ${origen ? html`<div class="dato"><span class="dato-nombre">Canal que más te dio</span><span class="dato-valor">${escapar(origen.nombre)} · ${pct(origen.porcentaje)}</span></div>` : ""}
      </div>
    </section>
  `);
}

function comparativa(cats) {
  const mejor = [...cats].sort((a, b) => b.neto - a.neto)[0];
  const actual = cats.find((c) => c.actual);
  const filas = cats
    .map(
      (c) => html`
      <div class="dato">
        <span class="dato-nombre">${c.categoria} · ${Math.round(c.split * 100)}%${c.actual ? " (tu categoría)" : ""}</span>
        <span class="dato-valor" style="${c.diferencia > 0 ? "color:var(--azul)" : ""}">
          ${plata(c.neto)}${c.diferencia ? ` (${c.diferencia > 0 ? "+" : ""}${plata(c.diferencia)})` : ""}
        </span>
      </div>`
    )
    .join("");
  return nodo(html`
    <section class="tarjeta">
      <div class="tarjeta-titulo">
        <h2 class="titulo">Tu categoría</h2>
        <span class="apunte">ganancia neta del año</span>
      </div>
      <div class="datos">${filas}</div>
      ${mejor && actual && mejor.categoria !== actual.categoria
        ? html`<p class="aviso">Con <strong>${mejor.categoria}</strong> habrías ganado
             <strong>${plata(mejor.neto - actual.neto)}</strong> más en lo que va del año,
             descontando el fee mensual.</p>`
        : ""}
    </section>
  `);
}

function propiedadesUsadas(publicado, estado) {
  const filas = publicado.detalle
    .map(
      (p) => html`
      <button class="fila" data-propiedad="${escapar(p.entity_id)}">
        <span class="fila-cuerpo">
          <span class="fila-titulo">${escapar(p.direccion || "Sin dirección")}</span>
          <span class="fila-sub">
            ${plata(p.precio)}${p.estimado
              ? ` × ${pct(p.pct)}`
              : " · con tu negocio ya cargado"}
          </span>
        </span>
        <span class="fila-plata">
          <span class="cifra cifra-media">${plata(p.ganancia)}</span>
          <span class="fila-sub">${plata(p.facturacion)} fact.</span>
        </span>
      </button>`
    )
    .join("");

  // Cómo se llegó a ese porcentaje, con los números que él conoce.
  const muestra = publicado.detalle.find((p) => p.estimado);
  const seccion = nodo(html`
    <section class="tarjeta">
      <div class="tarjeta-titulo">
        <h2 class="titulo">Lo potencial, una por una</h2>
        <span class="apunte">${publicado.cantidad} propiedades</span>
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
