/* La ficha de renta como imagen, para mandarle al cliente por WhatsApp (§10.5).

   Un texto se copia mal y se lee peor en un chat. Una imagen se ve entera de un golpe y
   lleva el nombre y el telefono del agente adentro.

   Se dibuja en un canvas a mano: sin librerias, y por lo tanto sin nada que bajar.

   Puede mostrar UNA renta o las DOS: no todos los clientes quieren lo mismo. Al que ya
   escucho "esto renta 8%" en otro lado hay que mostrarle las dos juntas, porque el
   argumento es la distancia entre ellas. Al que ya entendio, alcanza con la real. */

const ANCHO = 1080;
const ALTO = 1350;
const MARGEN = 70;

/* Tinta de la marca, no del sistema: esto sale del telefono del cliente y no tiene que
   cambiar con el modo oscuro de nadie. */
const AZUL = "#0043ff";
const ROJO = "#ff1200";
const TINTA = "#0b0f1a";
const TINTA_2 = "#5d6880";
const LINEA = "#e3e8f2";
const AZUL_SUAVE = "#eef3ff";

export const RENTAS = [
  { clave: "ambas", nombre: "Las dos", pista: "la real y la bruta, para comparar" },
  { clave: "real", nombre: "Solo la real", pista: "con todos los costos descontados" },
  { clave: "bruta", nombre: "Solo la bruta", pista: "el número sin descuentos" },
];

const ES_RENTA = new Set(RENTAS.map((r) => r.clave));

const monto = (n) => (n === null || n === undefined ? "—" : Math.round(n).toLocaleString("es-UY"));
const porcentaje = (n) => (n === null || n === undefined ? "—" : `${(n * 100).toFixed(1).replace(".", ",")}%`);

/* Las lineas de la ficha, calculadas aparte del dibujo para poder probarlas.

   Las filas se arman con lo que de verdad se uso: si los gastos de compra quedaron en
   cero, la fila no aparece. Una ficha con cinco renglones que dicen "0%" es una ficha que
   el cliente no lee. */
export function contenido(entradas, resultados, agente = {}, opciones = {}) {
  const mostrar = ES_RENTA.has(opciones.mostrar) ? opciones.mostrar : "ambas";
  const e = entradas || {};
  const r = resultados || {};

  const filas = [
    ["Precio", `USD ${monto(e.precio)}`],
    ["Alquiler por mes", `${e.moneda_alquiler === "UYU" ? "$" : "USD"} ${monto(e.alquiler_mensual)}`],
  ];
  // Lo que solo importa cuando se descuenta algo: en la ficha bruta sobra.
  if (mostrar !== "bruta") {
    filas.push(["Meses alquilados por año", `${e.meses_alquilados ?? 11} de 12`]);
    if (e.irpf_pct) filas.push(["Impuestos (IRPF)", porcentaje(e.irpf_pct)]);
    /* Refaccion, comision, contribucion, primaria y administracion van en UNA fila.
       Desglosadas eran cuatro renglones que empujaban la nota contra el pie, y al cliente
       no le cambia nada: lo que quiere saber es cuanto se va, no en que se va. El detalle
       fino lo tiene el agente en la pantalla. */
    const gastosDelAnio = (r.costo_refaccion || 0) + (r.costo_comision || 0)
      + (r.costos_fijos || 0) + (r.costo_admin || 0);
    if (gastosDelAnio) {
      filas.push(["Gastos del año (refacción, comisión, tributos)", `USD ${monto(gastosDelAnio)}`]);
    }
    // Una sola fila y no dos: el capital ya dice el precio mas los gastos, y cada renglon
    // de mas es un renglon que el cliente no lee.
    if (e.gastos_compra_pct) {
      filas.push([`Capital invertido (con ${porcentaje(e.gastos_compra_pct)} de gastos)`,
        `USD ${monto(r.capital_invertido)}`]);
    }
  }

  const cifras = [];
  if (mostrar !== "bruta") {
    cifras.push({ clave: "real", valor: porcentaje(r.renta_real_pct),
      nombre: "RENTA REAL", pie: "después de todos los costos" });
  }
  if (mostrar !== "real") {
    cifras.push({ clave: "bruta", valor: porcentaje(r.renta_bruta_pct),
      nombre: "RENTA BRUTA", pie: "sin descontar nada" });
  }

  const notas = [];
  if (mostrar !== "bruta") {
    notas.push("La renta real descuenta meses vacíos, impuestos y gastos: "
      + "no es la renta bruta que se dice en la calle.");
  } else {
    notas.push("La renta bruta no descuenta nada: es el alquiler por doce sobre el precio.");
  }
  // A cuanto se tomo el dolar. Sin esto, el numero no se puede auditar tres meses despues.
  if (opciones.cotizacion) notas.push(`${opciones.cotizacion}.`);

  return {
    mostrar,
    titulo: e.titulo || "Cálculo de renta",
    cifras,
    filas,
    remate: mostrar === "bruta"
      ? [["Alquiler en el año", `USD ${monto(r.renta_bruta_anual)}`]]
      : [
        ["Al bolsillo por mes", `USD ${monto(r.bolsillo_por_mes)}`],
        ["Se paga sola en", r.anios_para_recuperar
          ? `${r.anios_para_recuperar.toFixed(1).replace(".", ",")} años`
          : "—"],
      ],
    nota: notas.join(" "),
    agente: agente.nombre || "Juan Andrés Otero",
    oficina: agente.oficina || "RE/MAX Único",
    telefono: agente.telefono || "",
  };
}

/* Donde va cada bloque.

   Se calcula aparte del dibujo por una razon concreta: antes la nota se escribia a partir
   de donde habia quedado el bloque anterior, y con una nota larga se metia arriba del pie.
   Por eso los textos se veian encimados abajo. Ahora el pie tiene su lugar RESERVADO y lo
   que se ajusta es lo de arriba: las filas se aprietan si son muchas, y si aun asi no
   entra, la nota se corta — pero nada se dibuja arriba de nada. */
export function repartir(cantidadDeFilas, renglonesDeNota, remateFilas = 2, lineasDeTitulo = 1) {
  /* La banda azul CRECE con el titulo.

     Estaba clavada en 440 y con una direccion de dos renglones el titulo se metia arriba
     del "RENTA REAL": las letras quedaban una sobre otra. El alto de arriba no puede ser
     una constante cuando lo que va adentro es de largo variable. */
  const titulos = Math.min(2, Math.max(1, lineasDeTitulo));
  const tituloY = 162;
  const tituloPaso = 52;
  const nombreY = tituloY + (titulos - 1) * tituloPaso + 78;
  const cifraY = nombreY + 108;
  const cifraPieY = cifraY + 38;
  const bandaAlto = cifraPieY + 40;

  const pieAlto = 150;                        // reservado, no se negocia
  const remateAlto = 34 + remateFilas * 56;
  const notaAlto = Math.max(1, renglonesDeNota) * 36;
  const pieLinea = ALTO - pieAlto;

  /* Se reparte de ABAJO hacia arriba. El pie tiene su lugar fijo, la nota se apoya sobre
     el pie y el remate sobre la nota; recien lo que queda es de las filas. Al reves
     -- que era como estaba -- cada bloque empezaba donde habia terminado el anterior, y
     con la ficha llena el texto de abajo terminaba encimado sobre el pie. */
  const notaIdeal = pieLinea - 30 - notaAlto + 26;   // hasta donde puede bajar la nota
  const remateIdeal = notaIdeal - 26 - 36 - remateAlto;
  const filasDesde = bandaAlto + 62;

  const paso = cantidadDeFilas
    ? Math.max(46, Math.min(62, (remateIdeal - 28 - filasDesde) / cantidadDeFilas))
    : 0;

  /* El remate va SIEMPRE pegado a donde terminaron las filas, y la nota pegada al remate.

     Anclarlos abajo dejaba un hueco en el medio cuando habia pocas filas: la ficha de la
     renta bruta, que solo lleva dos, mostraba un vacio enorme entre los datos y la caja
     azul. El aire sobrante tiene que quedar al final, que es donde no se nota.

     Y si las filas son tantas que la nota no llega a entrar, el dibujo la corta antes de
     tocar el pie. Superponerse es lo unico que no se negocia. */
  const finDeFilas = filasDesde + paso * cantidadDeFilas;
  const remateY = finDeFilas + 28;
  const notaY = remateY + remateAlto + 36 + 26;

  return {
    ancho: ANCHO, alto: ALTO, margen: MARGEN,
    bandaAlto, tituloY, tituloPaso, nombreY, cifraY, cifraPieY,
    filasDesde, paso, remateY, remateAlto, notaY, notaAlto, pieLinea,
    // Si la nota entera entra sin que el dibujo tenga que cortarla.
    entraTodo: notaY + notaAlto - 26 <= pieLinea - 28,
  };
}

/* Corta un texto largo en renglones que entren en el ancho dado. */
export function renglones(medir, texto, ancho) {
  const palabras = String(texto || "").split(" ").filter(Boolean);
  const salida = [];
  let actual = "";
  for (const palabra of palabras) {
    const prueba = actual ? `${actual} ${palabra}` : palabra;
    if (medir(prueba) > ancho && actual) {
      salida.push(actual);
      actual = palabra;
    } else {
      actual = prueba;
    }
  }
  if (actual) salida.push(actual);
  return salida;
}

/* El globo de RE/MAX. Se carga una sola vez y queda guardado: la ficha se genera varias
   veces seguidas mientras se prueba con el cliente adelante. Si no carga, la ficha sale
   igual sin logo — nunca se queda sin ficha por culpa de una imagen. */
let logoPrometido = null;
export function cargarLogo(ruta = "imagenes/remax-globo.png") {
  if (logoPrometido) return logoPrometido;
  logoPrometido = new Promise((listo) => {
    if (typeof Image === "undefined") return listo(null);
    const imagen = new Image();
    imagen.onload = () => listo(imagen);
    imagen.onerror = () => listo(null);
    imagen.src = ruta;
  });
  return logoPrometido;
}

export async function dibujar(canvas, entradas, resultados, agente, opciones = {}) {
  const d = contenido(entradas, resultados, agente, opciones);
  const logo = opciones.logo !== undefined ? opciones.logo : await cargarLogo();

  canvas.width = ANCHO;
  canvas.height = ALTO;
  const ctx = canvas.getContext("2d");
  const fuente = (peso, tam) => `${peso} ${tam}px ui-sans-serif, system-ui, sans-serif`;
  const medirCon = (peso, tam) => (texto) => {
    ctx.font = fuente(peso, tam);
    return ctx.measureText(texto).width;
  };

  const lineasNota = renglones(medirCon(400, 26), d.nota, ANCHO - MARGEN * 2);

  /* El titulo se mide ANTES de repartir el espacio: de cuantos renglones ocupe depende
     donde arranca todo lo demas. Y si son dos, la letra baja un punto para que una
     direccion larga no se coma la banda entera. */
  const logoAncho = logo && logo.height ? (logo.width * 88) / logo.height : 0;
  const anchoTitulo = ANCHO - MARGEN * 2 - (logoAncho ? logoAncho + 40 : 0);
  let tamTitulo = 44;
  let titulo = renglones(medirCon(700, tamTitulo), d.titulo, anchoTitulo);
  if (titulo.length > 1) {
    tamTitulo = 38;
    titulo = renglones(medirCon(700, tamTitulo), d.titulo, anchoTitulo).slice(0, 2);
  }

  const L = repartir(d.filas.length, lineasNota.length, d.remate.length, titulo.length);

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, ANCHO, ALTO);

  // ---- Banda superior: la marca y el numero que importa ----
  ctx.fillStyle = AZUL;
  ctx.fillRect(0, 0, ANCHO, L.bandaAlto);

  if (logoAncho) ctx.drawImage(logo, ANCHO - MARGEN - logoAncho, 56, logoAncho, 88);

  ctx.fillStyle = "rgba(255,255,255,.72)";
  ctx.font = fuente(700, 28);
  ctx.fillText("¿CUÁNTO RENTA?", MARGEN, 96);

  ctx.fillStyle = "#ffffff";
  for (const [i, linea] of titulo.entries()) {
    ctx.font = fuente(700, tamTitulo);
    ctx.fillText(linea, MARGEN, L.tituloY + i * L.tituloPaso);
  }

  // Una cifra sola va grande y a la izquierda; dos van repartidas, y la real manda.
  if (d.cifras.length === 1) {
    const [c] = d.cifras;
    ctx.fillStyle = "rgba(255,255,255,.72)";
    ctx.font = fuente(700, 26);
    ctx.fillText(c.nombre, MARGEN, L.nombreY);
    ctx.fillStyle = "#ffffff";
    ctx.font = fuente(800, 150);
    ctx.fillText(c.valor, MARGEN, L.cifraY + 10);
    ctx.fillStyle = "rgba(255,255,255,.8)";
    ctx.font = fuente(400, 28);
    ctx.fillText(c.pie, MARGEN, L.cifraPieY);
  } else {
    const columna = [MARGEN, ANCHO / 2 + 22];
    for (const [i, c] of d.cifras.entries()) {
      const x = columna[i];
      const principal = c.clave === "real";
      ctx.fillStyle = principal ? "#ffffff" : "rgba(255,255,255,.66)";
      ctx.font = fuente(700, 25);
      ctx.fillText(c.nombre, x, L.nombreY);
      ctx.font = fuente(800, principal ? 112 : 92);
      ctx.fillText(c.valor, x, L.cifraY);
      ctx.fillStyle = "rgba(255,255,255,.72)";
      ctx.font = fuente(400, 24);
      for (const [j, linea] of renglones(medirCon(400, 24), c.pie, ANCHO / 2 - 100).entries()) {
        ctx.fillText(linea, x, L.cifraPieY + j * 30);
      }
    }
  }

  // ---- Las cuentas ----
  let y = L.filasDesde;
  for (const [nombre, valor] of d.filas) {
    ctx.fillStyle = TINTA_2;
    ctx.textAlign = "left";
    ctx.font = fuente(400, 30);
    ctx.fillText(nombre, MARGEN, y);
    ctx.fillStyle = TINTA;
    ctx.font = fuente(700, 30);
    ctx.textAlign = "right";
    ctx.fillText(valor, ANCHO - MARGEN, y);
    ctx.textAlign = "left";
    ctx.fillStyle = LINEA;
    ctx.fillRect(MARGEN, y + 16, ANCHO - MARGEN * 2, 1);
    y += L.paso;
  }

  // ---- El remate, en su caja ----
  ctx.fillStyle = AZUL_SUAVE;
  ctx.fillRect(MARGEN, L.remateY, ANCHO - MARGEN * 2, L.remateAlto);
  let ry = L.remateY + 56;
  for (const [nombre, valor] of d.remate) {
    ctx.fillStyle = TINTA_2;
    ctx.font = fuente(400, 30);
    ctx.textAlign = "left";
    ctx.fillText(nombre, MARGEN + 30, ry);
    ctx.fillStyle = AZUL;
    ctx.font = fuente(800, 34);
    ctx.textAlign = "right";
    ctx.fillText(valor, ANCHO - MARGEN - 30, ry);
    ctx.textAlign = "left";
    ry += 58;
  }

  // ---- La aclaracion ----
  ctx.fillStyle = TINTA_2;
  ctx.font = fuente(400, 26);
  let ny = L.notaY;
  for (const linea of lineasNota) {
    if (ny > L.pieLinea - 26) break;   // antes que encimarse con el pie, se corta
    ctx.fillText(linea, MARGEN, ny);
    ny += 36;
  }

  // ---- Pie: quien la manda ----
  ctx.fillStyle = ROJO;
  ctx.fillRect(0, L.pieLinea, ANCHO, 6);
  ctx.fillStyle = TINTA;
  ctx.font = fuente(700, 36);
  ctx.fillText(d.agente, MARGEN, L.pieLinea + 78);
  ctx.fillStyle = TINTA_2;
  ctx.font = fuente(400, 28);
  ctx.fillText([d.oficina, d.telefono].filter(Boolean).join(" · "), MARGEN, L.pieLinea + 124);

  return canvas;
}

export const nombreImagen = (titulo, cual) =>
  `renta-${(titulo || "calculo").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`
  + `${cual && cual !== "ambas" ? `-${cual}` : ""}.png`;
