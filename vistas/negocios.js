/* La lista de los 85 negocios, con filtros. Tocar uno abre su ficha. */

import { plata, plataUSD, pct, fechaCorta, escapar } from "../lib/formato.js";
import { capas } from "../lib/salud.js";
import { crearNegocio } from "../lib/guardado.js";
import { esBusqueda } from "../lib/motor.js";

const html = (c, ...v) => c.reduce((t, x, i) => t + x + (v[i] ?? ""), "");

function nodo(marca) {
  const molde = document.createElement("template");
  molde.innerHTML = marca.trim();
  return molde.content;
}

/* Como se ordena la lista. Cada uno tiene su desempate y su direccion natural: las fechas
   y la plata van de mayor a menor (lo ultimo y lo mas grande primero), la direccion al
   reves. Los que no tienen el dato caen al final en vez de mezclarse arriba con ceros. */
export const ORDENES = [
  { clave: "cierre", nombre: "Fecha de cierre", campo: (n) => n.fecha_fin || "" },
  { clave: "inicio", nombre: "Fecha de publicación", campo: (n) => n.fecha_inicio || "" },
  { clave: "ticket", nombre: "Ticket", campo: (n) => n.precio_operacion || 0 },
  /* `ganancia` es lo que ya calculo el motor, y ahi las puntas YA estan adentro: la
     facturacion sale del precio por el porcentaje que corresponde a una punta o a dos, y
     la ganancia es tu tajada de esa facturacion. Ordenar por esto ordena por plata real
     en el bolsillo, no por precio de la propiedad. */
  { clave: "ganancia", nombre: "Ganancia", campo: (n) => n.ganancia || 0 },
  { clave: "direccion", nombre: "Dirección", campo: (n) => (n.direccion || "").toLowerCase() },
];

export function ordenar(negocios, clave) {
  const orden = ORDENES.find((o) => o.clave === clave) || ORDENES[0];
  const alReves = orden.clave === "direccion";
  return [...negocios].sort((a, b) => {
    const x = orden.campo(a);
    const y = orden.campo(b);
    // Sin dato, al fondo: un negocio sin precio no es "el mas barato".
    const vacio = (v) => v === "" || v === 0 || v === null || v === undefined;
    if (vacio(x) !== vacio(y)) return vacio(x) ? 1 : -1;
    if (typeof x === "string") return alReves ? x.localeCompare(y) : y.localeCompare(x);
    return y - x;
  });
}

const filtro = { anio: "todos", tipo: "todos", conAvisos: false, orden: "cierre" };
// Cual de los desplegables del menu esta abierto. Fuera del dibujado: si viviera en el
// HTML se cerraria solo en cada redibujado.
let menuAbierto = null;
// Fuera del dibujado: tocar una propiedad redibuja, y si el estado viviera en el HTML la
// solapa se cerraria sola en cada toque.
let potencialesAbierto = false;

function aplicarFiltros(negocios) {
  return negocios.filter((n) => {
    if (filtro.anio !== "todos" && (n.fecha_fin || "").slice(0, 4) !== filtro.anio) return false;
    if (filtro.tipo !== "todos" && n.tipo_negocio !== filtro.tipo) return false;
    if (filtro.conAvisos && !(n.avisos || []).length) return false;
    return true;
  });
}

export function dibujarNegocios(estado) {
  const todos = estado.datos.negocios || [];
  const anios = [...new Set(todos.map((n) => (n.fecha_fin || "").slice(0, 4)).filter(Boolean))]
    .sort().reverse();
  /* Una sola lista, con el orden que el usuario haya elegido. Las busquedas van mezcladas
     y se reconocen por su chip: separarlas es util en Cartera, donde se mira lo que esta
     en marcha, pero aca se viene a buscar UN negocio y partir la lista solo obliga a
     mirar en dos lugares. */
  const lista = ordenar(aplicarFiltros(todos), filtro.orden);

  const totalFact = lista.reduce((t, n) => t + (n.estado === "cerrado" ? n.facturacion || 0 : 0), 0);
  const totalGan = lista.reduce((t, n) => t + (n.estado === "cerrado" ? n.ganancia || 0 : 0), 0);

  const trozo = document.createDocumentFragment();

  trozo.append(nodo(html`
    <section style="margin-bottom:12px">
      <div class="cabecera-linea">
        <h1 class="titulo" style="font-size:27px">${lista.length} de ${todos.length}</h1>
        <div class="colgante">
          <button class="boton boton-primario boton-chico" id="abrir-alta">+ Nuevo</button>
          <div class="colgante-menu" id="menu-alta" hidden></div>
        </div>
      </div>
      <div class="resumen-cartera resumen-dos">
        <div class="resumen-dato">
          <span class="resumen-cifra">${plataUSD(totalGan)}</span>
          <span class="resumen-nombre">a tu bolsillo</span>
        </div>
        <div class="resumen-dato">
          <span class="resumen-cifra">${plataUSD(totalFact)}</span>
          <span class="resumen-nombre">facturado</span>
        </div>
      </div>
    </section>
  `));

  trozo.append(barraDeFiltros(estado, todos, anios));



  // Lo publicado que todavia no se movio. Vive aca y no en Salud porque es una lista de
  // propiedades sobre las que hay algo para HACER: entrar, revisar el precio, o apagarla
  // si no deberia contar. En Salud era un dato mas para mirar.
  const c = capas(estado.datos.negocios, estado.datos.cartera, estado.datos.ajustes,
    estado.hoy.slice(0, 4));
  if (c.publicado.detalle.length) trozo.append(loPotencial(c.publicado, estado));

  const contenedor = document.createElement("div");
  contenedor.className = "lista";
  for (const n of lista) contenedor.append(fila(n, estado));
  if (!lista.length) {
    contenedor.append(nodo(html`<p class="pronto">Ningún negocio con esos filtros.</p>`));
  }
  trozo.append(contenedor);

  /* El menú se abre y se cierra SIN redibujar la pantalla: redibujar por abrir un menú
     manda el scroll arriba y hace pestañear la lista entera. */
  const boton = trozo.getElementById("abrir-alta");
  const menu = trozo.getElementById("menu-alta");
  llenarMenuDeAlta(menu, estado);

  boton.addEventListener("click", (evento) => {
    evento.stopPropagation();
    menu.hidden = !menu.hidden;
    if (!menu.hidden) llenarMenuDeAlta(menu, estado);
  });

  /* Un toque en cualquier otro lado lo cierra: es lo que hace todo menú, y sin eso queda
     abierto tapando la lista hasta que alguien se acuerde de tocar el botón otra vez. */
  document.addEventListener("click", (evento) => {
    if (!menu.hidden && !menu.contains(evento.target)) menu.hidden = true;
  });

  return trozo;
}

/* La barra de filtros, con el mismo molde que el menu de Salud.

   Antes eran cinco cosas sueltas en una fila: el boton de "+ Nuevo" mezclado con los
   filtros, dos <select> nativos que en el telefono abren la rueda del sistema, y un boton
   que prendia y apagaba. Nada indicaba que unas cosas filtran y otra crea.

   Ahora "+ Nuevo" esta arriba con el titulo, y abajo hay una barra pareja de cuatro:
   tres que despliegan y una que prende. Cada boton adelanta lo que tiene adentro. */
const PANELES = [
  { clave: "anio", nombre: "Año" },
  { clave: "tipo", nombre: "Operación" },
  { clave: "orden", nombre: "Orden" },
];

function barraDeFiltros(estado, todos, anios) {
  const porTipo = (t) => todos.filter((n) => n.tipo_negocio === t).length;
  const nombreOrden = (ORDENES.find((o) => o.clave === filtro.orden) || ORDENES[0]).nombre;
  const resumen = {
    anio: filtro.anio === "todos" ? "Todos" : filtro.anio,
    tipo: filtro.tipo === "todos" ? "Todas" : (filtro.tipo === "venta" ? "Venta" : "Alquiler"),
    // "Fecha de cierre" no entra en un boton de 95px: adentro del panel esta el nombre
    // largo, aca alcanza con la palabra que distingue.
    orden: nombreOrden.replace("Fecha de cierre", "Cierre").replace("Fecha de publicación", "Publicación"),
  };
  const indice = PANELES.findIndex((p) => p.clave === menuAbierto);

  const barra = nodo(html`
    <div class="menu-caja">
      <div class="barra-menu barra-filtros">
        ${PANELES.map((p) => html`
          <button class="menu-boton ${menuAbierto === p.clave ? "abierto" : ""}"
                  data-panel="${p.clave}" aria-expanded="${menuAbierto === p.clave}">
            <span class="menu-nombre">${escapar(p.nombre)}</span>
            <span class="menu-dato">${escapar(resumen[p.clave])}</span>
          </button>`).join("")}
        <button class="menu-boton ${filtro.conAvisos ? "abierto" : ""}" id="f-avisos">
          <span class="menu-nombre">Pendientes</span>
          <span class="menu-dato">${filtro.conAvisos ? "Solo" : "Todos"}</span>
        </button>
      </div>
      ${menuAbierto
        ? html`<div class="menu-globo ${indice >= 2 ? "derecha" : ""}"
                    style="--desde:${indice}" id="menu-panel"></div>`
        : ""}
    </div>
  `);

  const opcion = (activo, valor, texto, extra = "") => html`
    <button class="menu-opcion ${activo ? "activo" : ""}" data-valor="${escapar(valor)}">
      ${escapar(texto)}${extra ? html`<span class="menu-dato">${escapar(extra)}</span>` : ""}
      ${activo ? '<span class="tilde" aria-hidden="true">✓</span>' : ""}
    </button>`;

  const panel = barra.getElementById("menu-panel");
  if (panel) {
    let opciones = "";
    if (menuAbierto === "anio") {
      opciones = opcion(filtro.anio === "todos", "todos", "Todos los años")
        + anios.map((a) => opcion(filtro.anio === a, a, a,
          String(todos.filter((n) => (n.fecha_fin || "").slice(0, 4) === a).length))).join("");
    }
    if (menuAbierto === "tipo") {
      // Con la cantidad al lado: saber cuantas hay ANTES de tocar evita el filtro vacio.
      opciones = opcion(filtro.tipo === "todos", "todos", "Todas", String(todos.length))
        + opcion(filtro.tipo === "venta", "venta", "Venta", String(porTipo("venta")))
        + opcion(filtro.tipo === "alquiler", "alquiler", "Alquiler", String(porTipo("alquiler")));
    }
    if (menuAbierto === "orden") {
      opciones = ORDENES.map((o) => opcion(filtro.orden === o.clave, o.clave, o.nombre)).join("");
    }
    const lista = nodo(html`<div class="menu-lista">${opciones}</div>`);
    for (const boton of lista.querySelectorAll("[data-valor]")) {
      boton.addEventListener("click", () => {
        filtro[menuAbierto === "anio" ? "anio" : menuAbierto] = boton.dataset.valor;
        menuAbierto = null;
        estado.redibujar();
      });
    }
    panel.append(lista);
  }

  for (const boton of barra.querySelectorAll("[data-panel]")) {
    boton.addEventListener("click", () => {
      menuAbierto = menuAbierto === boton.dataset.panel ? null : boton.dataset.panel;
      estado.redibujar();
    });
  }
  barra.getElementById("f-avisos").addEventListener("click", () => {
    filtro.conAvisos = !filtro.conAvisos;
    menuAbierto = null;
    estado.redibujar();
  });

  /* El telon va DEBAJO del panel en el apilado: si va encima, cada toque cae en el telon
     —cuyo unico trabajo es cerrar— y parece que la app tintinea sin hacer nada. */
  if (menuAbierto) {
    const telon = document.createElement("button");
    telon.className = "menu-telon";
    telon.setAttribute("aria-label", "Cerrar");
    telon.addEventListener("click", () => { menuAbierto = null; estado.redibujar(); });
    barra.querySelector(".menu-caja").prepend(telon);
  }
  return barra;
}

/* EL MENU DE "+ Nuevo": cinco opciones y nada mas.

   Antes era una tarjeta al final de la pantalla, con tres titulos de grupo, un apunte por
   grupo y una explicacion abajo de cada opcion. Juan lo corto: "tiene muchisimo texto, no
   tiene que estar explicado porque yo entiendo bien que es cada cosa".

   Y cuelga DEL BOTON, no del final de la pantalla: un menu que aparece a tres pantallazos de
   distancia del boton que lo abrio no se lee como un menu, se lee como otra seccion.

   La busqueda se despliega en dos —venta o alquiler— en vez de ocupar dos renglones: es la
   unica que tiene esa pregunta, y ponerla como dos opciones sueltas alarga la lista para
   todos los demas casos. */
const OPCIONES = [
  { clave: "busqueda", nombre: "Búsqueda", abre: ["busqueda", "busqueda_alquiler"] },
  { clave: "suplencia", nombre: "Suplencia" },
  { clave: "yo_referi", nombre: "Propiedad referida" },
  { clave: "venta", nombre: "Venta" },
  { clave: "alquiler", nombre: "Alquiler" },
];

const COMO_SE_LLAMA = { busqueda: "De venta", busqueda_alquiler: "De alquiler" };

function llenarMenuDeAlta(caja, estado) {
  caja.replaceChildren();

  const crear = (clave) => {
    const nuevo = crearNegocio(estado, clave);
    estado.irA("ficha", nuevo.id);
  };

  for (const opcion of OPCIONES) {
    const fila = document.createElement("button");
    fila.className = "colgante-opcion";
    fila.textContent = opcion.nombre;
    fila.addEventListener("click", (evento) => {
      /* Sin esto el menú se cierra solo: al reemplazar la fila por las dos opciones, el
         evento sigue subiendo hasta el `document` — que cierra el menú al tocar afuera— y
         para entonces la fila tocada YA NO ESTÁ adentro, así que cuenta como afuera. */
      evento.stopPropagation();
      if (!opcion.abre) { crear(opcion.clave); return; }
      /* La búsqueda pregunta de qué: las dos salen en el lugar de la fila que se tocó, así
         no hay que volver a buscar con la vista dónde estaba. */
      const dos = document.createElement("div");
      dos.className = "colgante-dos";
      for (const clave of opcion.abre) {
        const chico = document.createElement("button");
        chico.className = "filtro";
        chico.textContent = COMO_SE_LLAMA[clave];
        chico.addEventListener("click", (e) => { e.stopPropagation(); crear(clave); });
        dos.append(chico);
      }
      fila.replaceWith(dos);
    });
    caja.append(fila);
  }
}

function fila(n, estado) {
  const anio = Number(estado.hoy.slice(0, 4));
  const avisos = (n.avisos || []).length;
  const trozo = nodo(html`
    <button class="fila" data-id="${n.id}">
      <span class="fila-cuerpo">
        <span class="fila-titulo">${escapar(n.direccion || "Sin dirección")}</span>
        <span class="fila-sub">
          ${escapar(n.barrio || "sin barrio")} · ${n.tipo_negocio} · ${fechaCorta(n.fecha_fin, anio)}
          ${esBusqueda(n, estado.datos.ajustes) ? ' · <span class="chip-apagado">búsqueda</span>' : ""}
          ${n.estado === "en_curso" ? ' · <span class="chip-curso">en curso</span>' : ""}
        </span>
      </span>
      <span class="fila-derecha">
        <span class="fila-plata">
          <span class="cifra cifra-media">${plata(n.ganancia)}</span>
          <span class="fila-sub">${plata(n.facturacion)} fact.</span>
        </span>
        ${avisos ? `<span class="chip-avisos">${avisos}</span>` : ""}
      </span>
    </button>
  `);
  trozo.querySelector(".fila").addEventListener("click", () => estado.irA("ficha", n.id));
  return trozo;
}

/* Las propiedades publicadas que todavia no se movieron, una por una.

   Sirven para PENSAR, no para administrar: todavia no son un negocio. Por eso tocar una
   ya no abre su ficha —eso se hace en Cartera— sino que cambia el supuesto de cuantas
   puntas vas a cerrar en ESA propiedad, y la cuenta se rehace sola.

   El ciclo es: como esta ahora (tus puntas promedio) -> una punta -> dos puntas -> una ->
   dos... El promedio no vuelve tocando, vuelve solo al cerrar y volver a abrir la app: es
   un supuesto para probar de a ratos, no una configuracion que haya que acordarse de
   deshacer. */
const puntasElegidas = {};

const PROXIMA_PUNTA = { undefined: 1, 1: 2, 2: 1 };

/* La misma propiedad con otro supuesto de puntas.

   El split sale de la proporcion que ya trae la fila (lo tuyo sobre lo que factura RE/MAX),
   asi que no hay que volver a mirar las categorias ni arriesgar dos cuentas distintas del
   mismo numero en dos lugares. */
function conPuntas(p, puntas) {
  if (!puntas || !p.estimado) return p;
  const facturacion = p.precio * p.unaPunta * puntas;
  const tajada = p.facturacion ? p.ganancia / p.facturacion : 0;
  return { ...p, puntas, pct: p.unaPunta * puntas, facturacion, ganancia: facturacion * tajada };
}

function loPotencial(publicado, estado) {
  const detalle = publicado.detalle.map((p) => conPuntas(p, puntasElegidas[p.entity_id]));
  const bolsillo = detalle.reduce((t, p) => t + (p.ganancia || 0), 0);
  const tocadas = detalle.filter((p) => puntasElegidas[p.entity_id]).length;

  const filas = detalle
    .map((p) => {
      const elegida = puntasElegidas[p.entity_id];
      return html`
      <button class="fila ${elegida ? "fila-probando" : ""}" data-propiedad="${escapar(p.entity_id)}">
        <span class="fila-cuerpo">
          <span class="fila-titulo">${escapar(p.direccion || "Sin dirección")}</span>
          <span class="fila-sub">
            ${plata(p.precio)}${p.estimado
              ? html` × ${pct(p.pct)}
                  <span class="chip-apagado">${elegida
                    ? `${elegida === 1 ? "1 punta" : "2 puntas"}`
                    : "tu promedio"}</span>`
              : " · con tu negocio ya cargado"}
          </span>
        </span>
        <span class="fila-derecha fila-plata">
          <span class="cifra cifra-media">${plata(p.ganancia)}</span>
          <span class="fila-sub">${plata(p.facturacion)} fact.</span>
        </span>
      </button>`;
    })
    .join("");

  const muestra = detalle.find((p) => p.estimado);
  /* Plegado: son propiedades que TODAVIA no son un negocio, y abiertas empujaban la lista
     de los que si lo son. Se abre cuando hay ganas de mirarlas. */
  const seccion = nodo(html`
    <details class="grupo" ${potencialesAbierto ? "open" : ""}>
      <summary class="grupo-cabeza">
        <span class="grupo-cuenta">${publicado.cantidad}</span>
        <span class="grupo-nombre">Negocios potenciales</span>
        <span class="grupo-flecha" aria-hidden="true">›</span>
      </summary>
      <div class="tarjeta" style="margin-top:6px">
      <p class="apunte" style="margin-bottom:12px">
        ${publicado.cantidad} publicadas · <strong>${plataUSD(bolsillo)}</strong>
        a tu bolsillo si cerraran todas
      </p>
      <div class="lista">${filas}</div>
      ${muestra
        ? html`<p class="apunte" style="margin-top:12px">
             ${tocadas
               ? html`Estás probando con otras puntas en
                  <strong>${tocadas}</strong> ${tocadas === 1 ? "propiedad" : "propiedades"}.
                  Tocá para cambiar entre una punta y dos. Al cerrar la app vuelven a tu promedio.`
               : html`Tocá cualquiera para probar con una punta o con dos. El
                  <strong>${pct(muestra.pct)}</strong> de ahora sale de tu forma de cerrar:
                  ${pct(muestra.unaPunta)} por punta y
                  <strong>${muestra.puntas.toFixed(2).replace(".", ",")} puntas</strong>
                  en promedio.`}
           </p>`
        : ""}
      </div>
    </details>
  `);
  seccion.querySelector("details").addEventListener("toggle", (evento) => {
    potencialesAbierto = evento.target.open;
  });
  for (const boton of seccion.querySelectorAll("[data-propiedad]")) {
    boton.addEventListener("click", () => {
      const id = boton.dataset.propiedad;
      const p = publicado.detalle.find((x) => x.entity_id === id);
      // Con un negocio ya cargado el numero es real: no hay supuesto que cambiar.
      if (!p || !p.estimado) return;
      puntasElegidas[id] = PROXIMA_PUNTA[puntasElegidas[id]];
      estado.redibujar();
    });
  }
  return seccion;
}
