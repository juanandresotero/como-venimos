/* EL INVENTARIO DE UN ALQUILER.

   QUE PROBLEMA RESUELVE. Juan hace el inventario a mano en un Word: una tabla por ambiente,
   una fila por cosa. En el de Leyenda patria conté 165 casilleros, y más de tres de cada
   cuatro dicen "Buen estado – sin detalles". Lo que le come el tiempo no es mirar la
   propiedad: es ESCRIBIR 165 veces lo mismo.

   LA IDEA DE ACA. Los ambientes y sus cosas ya vienen puestos, todo arranca en "buen estado",
   y el trabajo pasa a ser tocar las diez o veinte que son la excepción: el toldo con hongos,
   la rajadura del placar, la grifería de la pileta.

   LAS PLANTILLAS SALEN DE SU PROPIO INVENTARIO, no de una idea de lo que un inventario
   debería tener. Cada ítem de acá abajo está porque él lo escribió.

   EL VOCABULARIO TAMBIEN ES EL SUYO. "Buen estado – sin detalles", "con detalles", "recién
   pintadas". Un inventario se firma y se usa para discutir un depósito: cambiarle las
   palabras por otras "mejores" le cambiaría el sentido a un documento que ya usó veinte
   veces.

   NADA DE ESTO VA AL REPOSITORIO, que es público: es la casa de un cliente, con su
   dirección. Vive en el teléfono, igual que las cuentas bancarias y la firma. */

/* ---------- Los estados ---------- */

/* La escala es corta a propósito: con más opciones hay que pensar en cada fila, y son 165.
   El texto que sale impreso es el que él usa hoy, palabra por palabra. */
/* LOS ESTADOS, EN ORDEN DE MEJOR A PEOR. Los eligio Juan; el orden importa porque un
   desplegable desordenado obliga a leerlo entero cada vez, y son 165 veces.

   `nombre` es lo que se elige en la pantalla y `texto` lo que sale impreso. Son distintos a
   proposito: en el telefono el desplegable compite por el ancho con el nombre de la cosa. En
   el papel manda el vocabulario de Juan, palabra por palabra.

   "ROTO" NO ESTABA EN SU LISTA Y ES LA QUE MAS IMPORTA. "Viejo" y "sin mantenimiento" dicen
   que algo esta gastado, no que no anda. Si al entrar el toldo tiene el mecanismo roto y eso
   no queda escrito con todas las letras, el dia que el inquilino se va se lo cobran a el. En
   su propio inventario de Leyenda patria escribio "Con hongos, mecanismo roto": la palabra le
   hizo falta y la tuvo que escribir a mano.

   "NO TIENE" NO ES UN ESTADO, es la forma de sacar del documento algo que la plantilla trae y
   esta propiedad no tiene —un bidet, una mampara—. Va al final, separado de la escala. */
export const ESTADOS = [
  { clave: "excelente", nombre: "Excelente", texto: "Excelente estado – sin detalles" },
  { clave: "bien", nombre: "Buen estado", texto: "Buen estado – sin detalles" },
  { clave: "detalles", nombre: "Con detalles", texto: "Buen estado – con detalles" },
  { clave: "viejo", nombre: "Viejo", texto: "Viejo, pero funciona bien" },
  { clave: "sin_mant", nombre: "Sin mantenimiento", texto: "Sin mantenimiento" },
  { clave: "roto", nombre: "Roto", texto: "Roto / no funciona" },
  { clave: "no_tiene", nombre: "No tiene", texto: "" },
];

/* Los que piden explicar QUE tienen. Un "con detalles" o un "roto" sin decir cual es el
   detalle no sirve de nada el dia que hay que discutir un deposito. */
export const PIDEN_DETALLE = new Set(["detalles", "viejo", "sin_mant", "roto"]);

export const POR_DEFECTO = "bien";

const ESTADO = Object.fromEntries(ESTADOS.map((e) => [e.clave, e]));

/* Cómo queda escrito un renglón en el documento.

   El DETALLE manda sobre el estado cuando el estado no dice nada solo: "con problemas" sin
   explicar qué problema no sirve de nada en un juicio.

   La CANTIDAD sólo se escribe cuando es más de una: "Portalámpara x2". Poner "x1" en las
   otras ciento sesenta filas es ruido. */
/* UNA COSA SIN NOMBRE NO EXISTE. Juan: "si borro algo o dejo algo vacío que entienda que ahí
   no se tiene que poner nada y se ajuste".

   Pasa todo el tiempo: tocás "agregar algo", te distraés, y queda una fila en blanco. En la
   pantalla se ve y se entiende; impresa en el documento que se firma es un renglón vacío que
   nadie sabe qué quiso decir. */
export const cuenta = (item) => Boolean(item)
  && item.estado !== "no_tiene"
  && Boolean((item.nombre || "").trim());

/* Los ambientes que van al documento: los que tienen al menos una cosa que decir. Un ambiente
   entero vacío tampoco se imprime — un título solo, sin nada abajo, se lee como un error. */
export const loQueSeImprime = (inv) => (inv.ambientes || [])
  .map((a) => ({ ...a, items: (a.items || []).filter(cuenta) }))
  .filter((a) => a.items.length && (a.nombre || "").trim());

/* Los nombres viejos, para que un inventario ya guardado no se quede mudo. "perfecto" y
   "malo" existieron y alguno puede estar en el telefono. */
const ANTES_SE_LLAMABA = { perfecto: "excelente", malo: "roto" };

export const estadoDe = (item) => {
  const clave = (item || {}).estado;
  return ESTADO[clave] || ESTADO[ANTES_SE_LLAMABA[clave]] || ESTADO[POR_DEFECTO];
};

export function comoSeLee(item) {
  if (!cuenta(item)) return "";
  const base = estadoDe(item).texto;
  const detalle = (item.detalle || "").trim();
  if (!detalle) return base;
  return base ? `${base} · ${detalle}` : detalle;
}

export const conCantidad = (item) => {
  const n = Number((item || {}).cantidad) || 1;
  return n > 1 ? `${item.nombre} x${n}` : item.nombre;
};

/* ---------- Las plantillas ---------- */

/* Cada lista sale del inventario de Leyenda patria, en el mismo orden en que él las escribió:
   primero lo que se mira al entrar (paredes, techos, piso) y después los detalles. */
const LIVING = [
  "Puerta de entrada", "Cerradura puerta", "Pestillo", "Ventanal", "Paredes", "Techo", "Piso",
  "Persiana", "Vidrios", "Toma corriente", "Lámparas decoración", "Luces", "Llave luz",
  "Aire acondicionado", "Marco puerta", "Sócalos piso",
];

const RECIBIDOR = [
  "Puerta de entrada", "Cerradura puerta", "Pestillo", "Paredes", "Techo", "Piso",
  "Toma corriente", "Luces", "Llave luz", "Aire acondicionado", "Marco puerta", "Sócalos piso",
];

const DORMITORIO = [
  "Paredes", "Techos", "Piso", "Puerta", "Ventana", "Vidrios", "Persiana", "Cajón persiana",
  "Correa ventana", "Aire", "Pestillos", "Toma corriente", "Llave luz", "Sócalo", "Placar",
  "Marcos puerta", "Lámpara",
];

const BANO = [
  "Paredes", "Techos", "Puerta", "Pestillo", "Piso", "Duchero", "Grifería", "W.C.", "Cisterna",
  "Mampara", "Muebles debajo de lavatorio", "Lavatorio", "Toma corriente", "Llaves luz",
  "Portalámpara", "Extractor", "Guarda", "Percheros", "Marco puerta", "Portarrollos", "Espejo",
];

const COCINA = [
  "Paredes", "Techos", "Puerta", "Pestillo", "Piso", "Grifería", "Pileta",
  "Muebles debajo de mesada", "Muebles aéreos", "Mesada", "Toma corriente", "Llaves luz",
  "Portalámpara", "Extractor", "Sócalos", "Percheros", "Marco puerta", "Cocina", "Anafe",
  "Puerta de servicio", "Reja de entrada servicio", "Despojador", "Puertas despojador",
  "Ventana", "Conexión lavarropas",
];

const PASILLO = [
  "Paredes", "Techos", "Piso", "Marco puertas", "Puerta", "Manija puerta", "Llaves luz",
  "Llaves de luz general", "Luces", "Sócalos", "Placares", "Estantes",
];

const TERRAZA = [
  "Paredes", "Techos", "Piso", "Marcos ventanas", "Sócalos", "Baranda", "Toldos", "Luces",
];

/* Los que Juan pidió después: "cochera, depósito, etc". Son cortos a propósito — en un garaje
   no hay veinte cosas que mirar— y lo que falte se agrega a mano. */
const COCHERA = ["Paredes", "Techos", "Piso", "Portón", "Luces", "Toma corriente"];

const DEPOSITO = ["Paredes", "Techos", "Piso", "Puerta", "Cerradura", "Estantes", "Luces"];

/* Los tipos de ambiente que se pueden agregar. `veces` es cuántos suele haber: los dormitorios
   y los baños se numeran solos (Dormitorio 1, Dormitorio 2) porque siempre hay más de uno. */
export const TIPOS_DE_AMBIENTE = [
  { clave: "living", nombre: "Living comedor", items: LIVING },
  { clave: "recibidor", nombre: "Recibidor", items: RECIBIDOR },
  { clave: "dormitorio", nombre: "Dormitorio", items: DORMITORIO, numerado: true },
  { clave: "bano", nombre: "Baño", items: BANO, numerado: true },
  { clave: "bano_suite", nombre: "Baño en suite", items: BANO },
  { clave: "bano_servicio", nombre: "Baño de servicio", items: BANO },
  { clave: "cocina", nombre: "Cocina", items: COCINA },
  { clave: "dormitorio_servicio", nombre: "Dormitorio de servicio", items: DORMITORIO },
  { clave: "pasillo", nombre: "Pasillo", items: PASILLO },
  { clave: "terraza", nombre: "Terraza", items: TERRAZA },
  { clave: "balcon", nombre: "Balcón", items: TERRAZA },
  { clave: "cochera", nombre: "Cochera", items: COCHERA, numerado: true },
  { clave: "deposito", nombre: "Depósito", items: DEPOSITO },
  { clave: "azotea", nombre: "Azotea", items: TERRAZA },
  { clave: "vacio", nombre: "Otro — lo escribo yo", items: [] },
];

const TIPO = Object.fromEntries(TIPOS_DE_AMBIENTE.map((t) => [t.clave, t]));

/* El armado de un apartamento típico: es lo que aparece al empezar, para no tener que agregar
   diez ambientes a mano cada vez. Se saca lo que sobra, que es más rápido que sumar. */
export const ARRANQUE = ["living", "cocina", "bano", "dormitorio", "pasillo"];

let proximo = 0;
/* Los ids son de esta sesión y no salen a ningún lado: sólo sirven para que la pantalla sepa
   qué fila se está tocando. No se usa Date.now() para que dos llamadas seguidas no choquen. */
const nuevoId = (prefijo) => `${prefijo}-${(proximo += 1)}`;

export function nuevoAmbiente(claveTipo, nombre) {
  const tipo = TIPO[claveTipo] || TIPO.vacio;
  return {
    id: nuevoId("amb"),
    tipo: tipo.clave,
    nombre: nombre || tipo.nombre,
    items: tipo.items.map((n) => nuevoItem(n)),
  };
}

export function nuevoItem(nombre) {
  return {
    id: nuevoId("it"),
    nombre: nombre || "",
    estado: POR_DEFECTO,
    detalle: "",
    cantidad: 1,
  };
}

/* Los ambientes que se repiten se numeran solos: "Dormitorio 1", "Dormitorio 2". Sin esto,
   tres dormitorios se llaman los tres igual y en el documento no se sabe cuál es cuál. */
export function numerar(ambientes) {
  const cuantos = {};
  for (const a of ambientes) {
    if (!TIPO[a.tipo] || !TIPO[a.tipo].numerado) continue;
    cuantos[a.tipo] = (cuantos[a.tipo] || 0) + 1;
  }
  const vistos = {};
  return ambientes.map((a) => {
    const tipo = TIPO[a.tipo];
    if (!tipo || !tipo.numerado || cuantos[a.tipo] < 2) return a;
    vistos[a.tipo] = (vistos[a.tipo] || 0) + 1;
    /* Si le puso nombre a mano, ese manda: puede querer "Dormitorio principal". */
    if (a.nombre && a.nombre !== tipo.nombre) return a;
    return { ...a, nombre: `${tipo.nombre} ${vistos[a.tipo]}` };
  });
}

/* ---------- El inventario entero ---------- */

/* Las siete cláusulas del pie, tal cual las tiene hoy. Son las que le dan valor legal al
   documento —definen qué pasa cuando el inquilino se va— así que se guardan con el
   inventario y no en el código: si algún día su escribano le cambia una, la cambia y los
   inventarios viejos siguen diciendo lo que decían el día que se firmaron. */
export const CLAUSULAS = [
  "INVENTARIO hecho en la fecha y en la finca que se indica anteriormente. El mismo forma "
  + "parte del contrato de arrendamiento y demuestra el estado en que se encuentra la "
  + "propiedad citada al recibirse de ella la parte arrendataria, para su vivienda, quien "
  + "cuando la desocupe deberá entregarla en las mismas condiciones en que la recibe, salvo "
  + "aquellos deterioros que se produjeren por la acción del tiempo y/o el uso moderado y "
  + "debido, de lo contrario quedará obligado a abonar el importe de todos los desperfectos "
  + "y fallas que se hubiesen ocasionado, cuya tasación hará el administrador, o la parte "
  + "arrendadora, a la cual no podrá oponerse la parte arrendataria.",
  "PROHIBICIONES. La parte arrendataria no podrá: a) solicitar luego, aumentos, disminución "
  + "ni cambio en los muebles y/o demás enseres que figuren en el inventario sin previo "
  + "consentimiento escrito de la dueña. b) Alterar con pinturas, barnices, etc., o en la "
  + "forma que fuere, partes de la finca ni demás objetos sin previo consentimiento de la "
  + "dueña.",
  "En caso de efectuarse reparaciones o refacciones previamente acordadas por escrito con la "
  + "dueña quedarán, una vez finalizado el contrato, para el uso y goce de la propietaria.",
  /* La marca la reemplaza el generador del documento con la cantidad de hojas de verdad: era
     el punto 4 y lo contaba a mano. */
  "Este inventario está formado por {HOJAS} hojas y en prueba de su conformidad así lo firman.",
  "Se deja constancia de que tanto la parte arrendadora como la arrendataria aceptan el "
  + "contenido de este inventario.",
  "",
  "El siguiente link, que se deja a continuación, tendrá acceso todas las personas que puedan "
  + "encontrar este enlace. En él están las mismas fotos en tamaño original, que dan "
  + "evidencia del estado y conservación de la propiedad.",
];

export const OBSERVACIONES = "El estado general de higiene y conservación está en perfectas "
  + "condiciones. Todo funcionando correctamente, habiendo sido chequeado tanto la sanitaria "
  + "como la parte eléctrica del apartamento.";

export const AVISO_RECLAMO = "El inquilino cuenta con 5 días hábiles para reclamar aquello "
  + "que no esté plasmado en el inventario.";

export function nuevoInventario(hoy) {
  return {
    id: nuevoId("inv"),
    fecha: hoy || "",
    direccion: "",
    unidad: "",
    barrio: "",
    edificio: "",
    link_fotos: "",
    observaciones: OBSERVACIONES,
    clausulas: [...CLAUSULAS],
    ambientes: ARRANQUE.map((t) => nuevoAmbiente(t)),
  };
}

/* Cómo se llama la propiedad en una línea: es el título del documento y el nombre de la
   carpeta de fotos. */
export function comoSeLlama(inv) {
  const partes = [
    [inv.direccion, inv.unidad].filter(Boolean).join(" apto "),
    inv.edificio,
    inv.barrio,
  ].map((x) => (x || "").trim()).filter(Boolean);
  return partes.join(" · ");
}

/* Cuánto falta por revisar. Es el número que dice si el inventario está pronto: mientras
   haya ítems sin tocar, están todos dados por buenos sin que nadie los haya mirado. */
export function comoVa(inv) {
  const items = (inv.ambientes || []).flatMap((a) => a.items || []);
  const usados = items.filter(cuenta);
  return {
    ambientes: (inv.ambientes || []).length,
    items: usados.length,
    /* Los que tienen ALGO que decir: el numero que dice si el inventario esta pronto. Mira
       la misma lista que la pantalla usa para abrir el renglon del detalle; si mirara otra,
       el contador y lo que se ve en pantalla se irian separando. */
    conDetalle: usados.filter((i) => PIDEN_DETALLE.has(i.estado)
      || (i.detalle || "").trim()).length,
    sinUsar: items.length - usados.length,
  };
}
