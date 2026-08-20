/* La firma del usuario, recortada de una foto de su firma de puno y letra.

   EL PROBLEMA: una foto de papel sacada con un celular NUNCA tiene la luz pareja. Hay una
   esquina mas iluminada, la sombra de la propia mano, el reflejo del flash. Con un unico
   umbral de oscuridad para toda la imagen, el lado iluminado pierde medio trazo y el lado
   sombreado trae medio fondo.

   LA SOLUCION: no se compara cada pixel contra un numero fijo, sino CONTRA EL PROMEDIO DE
   SU PROPIO VECINDARIO. Un trazo es siempre mas oscuro que el papel que lo rodea, este esa
   zona iluminada o en sombra. Es el metodo de Bradley, y se calcula rapido con una tabla
   de sumas acumuladas: el promedio de cualquier rectangulo sale con cuatro restas, asi que
   da igual que el vecindario sea grande.

   Esto sirve con lapicera de CUALQUIER COLOR — negra, azul, roja —, que es lo que antes no
   andaba: se buscaba especificamente tinta azul y con otro color el recorte salia sucio.

   Antes de mirar nada se sube el contraste: se estiran los grises para que el mas claro de
   la foto quede en blanco y el mas oscuro en negro. Una foto lavada pasa a tener separacion
   de verdad entre papel y tinta.

   Se guarda la MASCARA, nunca la foto: mas liviana y menos expuesta. */

export const ANCHO_GUARDADO = 300;
const MINIMO_PIXELES = 20;

/* Cuanto mas oscuro que su vecindario tiene que ser un pixel para contar como tinta. En
   partes por ciento del promedio local. Bradley propone 15; con menos entra el grano del
   papel, con mas se cortan los trazos finos. */
const CUANTO_MAS_OSCURO = 0.15;

/* Si mas de esto quedo marcado como tinta, no se recorto una firma: se recorto una sombra,
   o la foto salio casi toda oscura. Conviene avisar antes de que lo guarde. */
const DEMASIADO = 0.35;

/* Cuando la foto se giro, quedan esquinas VACIAS que no son parte de la foto. No se pueden
   rellenar de blanco y listo: el borde entre ese blanco y la foto es un escalon de brillo, y
   un umbral local lee todo escalon como trazo. Salia un marco negro alrededor de la firma.

   Se resuelve marcando cuales pixeles son de verdad. Los de afuera:
     - no cuentan para el estiron de contraste (si no, el blanco se lleva el techo),
     - se ponen al tono del papel para que no hagan escalon en los promedios,
     - y NUNCA pueden ser tinta.
   El aviso de canvas es su transparencia: adentro es opaco, afuera no. */
function loQueEsFoto({ data }, total) {
  const valido = new Uint8Array(total);
  let cuantos = 0;
  for (let i = 3, p = 0; p < total; p++, i += 4) {
    if (data[i] > 128) {
      valido[p] = 1;
      cuantos++;
    }
  }
  return { valido, cuantos };
}

/* A grises, estirando el contraste.

   Se descarta una PUNTA MINIMA de cada lado —una milesima— para que un pixel quemado o una
   mota negra no arruinen el estiron. Tiene que ser minima: la tinta de una firma es en una
   foto tipica el 1 o 2% de los pixeles, asi que descartar "el 2% mas oscuro" se comia la
   firma entera y dejaba la imagen de un solo tono. Pasó, y no fallaba nada: devolvia null
   como si no hubiera firma. */
function aGrisesConContraste({ data, width, height }, valido = null) {
  const total = width * height;
  const gris = new Uint8Array(total);
  const cuantos = new Uint32Array(256);
  let contados = 0;
  for (let i = 0, p = 0; p < total; p++, i += 4) {
    /* Los pesos son los de la luminancia que ve el ojo: el verde pesa mas que el azul. */
    const g = (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000;
    gris[p] = g;
    if (!valido || valido[p]) {
      cuantos[gris[p]]++;
      contados++;
    }
  }

  const borde = Math.max(1, Math.round(contados * 0.001));
  let acumulado = 0;
  let piso = 0;
  for (; piso < 255 && acumulado + cuantos[piso] < borde; piso++) acumulado += cuantos[piso];
  acumulado = 0;
  let techo = 255;
  for (; techo > 0 && acumulado + cuantos[techo] < borde; techo--) acumulado += cuantos[techo];

  /* El tono del papel: la mitad de los pixeles de la foto son mas claros y la mitad mas
     oscuros. Con eso se rellenan los pedazos que no son foto, para que no hagan escalon. */
  let acumuladoMedio = 0;
  let papel = 255;
  for (let v = 0; v <= 255; v++) {
    acumuladoMedio += cuantos[v];
    if (acumuladoMedio * 2 >= contados) {
      papel = v;
      break;
    }
  }

  const rango = Math.max(1, techo - piso);
  const papelEstirado = Math.max(0, Math.min(255, ((papel - piso) * 255) / rango));
  for (let p = 0; p < total; p++) {
    if (valido && !valido[p]) {
      gris[p] = papelEstirado;
      continue;
    }
    const v = ((gris[p] - piso) * 255) / rango;
    gris[p] = v < 0 ? 0 : v > 255 ? 255 : v;
  }
  return gris;
}

/* Tabla de sumas acumuladas: `suma[y][x]` guarda todo lo que hay arriba y a la izquierda.
   Con eso el promedio de cualquier rectangulo sale con cuatro restas. */
function tablaDeSumas(gris, ancho, alto) {
  const suma = new Float64Array((ancho + 1) * (alto + 1));
  for (let y = 0; y < alto; y++) {
    let fila = 0;
    for (let x = 0; x < ancho; x++) {
      fila += gris[y * ancho + x];
      suma[(y + 1) * (ancho + 1) + (x + 1)] = suma[y * (ancho + 1) + (x + 1)] + fila;
    }
  }
  return suma;
}

/* Cada pixel contra el promedio de su vecindario. */
function porUmbralLocal(gris, ancho, alto, valido = null) {
  const suma = tablaDeSumas(gris, ancho, alto);
  const radio = Math.max(4, Math.round(Math.min(ancho, alto) / 12));
  const tinta = new Uint8Array(ancho * alto);
  let cuantos = 0;

  for (let y = 0; y < alto; y++) {
    const y0 = Math.max(0, y - radio);
    const y1 = Math.min(alto - 1, y + radio);
    for (let x = 0; x < ancho; x++) {
      const x0 = Math.max(0, x - radio);
      const x1 = Math.min(ancho - 1, x + radio);
      const area = (x1 - x0 + 1) * (y1 - y0 + 1);
      const caja = suma[(y1 + 1) * (ancho + 1) + (x1 + 1)]
        - suma[y0 * (ancho + 1) + (x1 + 1)]
        - suma[(y1 + 1) * (ancho + 1) + x0]
        + suma[y0 * (ancho + 1) + x0];
      const p = y * ancho + x;
      if (valido && !valido[p]) continue;
      if (gris[p] * area < caja * (1 - CUANTO_MAS_OSCURO)) {
        tinta[p] = 1;
        cuantos++;
      }
    }
  }
  return { tinta, cuantos };
}

/* DONDE ESTA LA HOJA.

   Este es el paso que faltaba y el que arruinaba las fotos de verdad. Una foto de una firma
   no es una foto de papel: es una foto de un papel APOYADO EN UNA MESA. El canto de la hoja
   y su sombra son una raya oscura larguisima, y para un umbral local esa raya es el trazo
   mas marcado de toda la imagen. Salian barras negras y la firma quedaba diminuta adentro.

   Se devuelve LA FORMA de la hoja, no su rectangulo. Con la hoja derecha daria lo mismo,
   pero con la hoja torcida —o con la foto girada para enderezarla— el rectangulo que la
   envuelve trae las esquinas de la mesa adentro, y volvian las barras negras. Probado.

   Los pasos:
     1. Lo claro es la hoja. Se juntan todos los pedazos grandes de claro: una rubrica que
        cruza la hoja de lado a lado la parte en dos, y quedarse con una mitad cortaria la
        firma justo al medio.
     2. Se tapan los agujeros. La firma es oscura, asi que deja huecos en "lo claro"; se
        rellenan mirando que NO se pueda llegar a ellos desde el borde de la foto.
     3. Se mete el contorno un poco para adentro, para dejar afuera el propio canto. */
/* El corte entre lo claro y lo oscuro, elegido por la propia foto y no a ojo.

   Es el metodo de Otsu: prueba todos los cortes posibles y se queda con el que deja los dos
   grupos mas separados entre si. Hacia falta porque un corte fijo —"mas de 128 es papel"— se
   rompe apenas hay sombra: el lado sombreado de la hoja caia del lado de la mesa. */
function corteDeOtsu(gris, total, valido) {
  const cuantos = new Uint32Array(256);
  let contados = 0;
  for (let p = 0; p < total; p++) {
    if (valido && !valido[p]) continue;
    cuantos[gris[p]]++;
    contados++;
  }
  if (!contados) return 128;

  let suma = 0;
  for (let v = 0; v < 256; v++) suma += v * cuantos[v];

  let sumaAtras = 0;
  let pesoAtras = 0;
  let mejor = 0;
  let corte = 128;
  for (let v = 0; v < 256; v++) {
    pesoAtras += cuantos[v];
    if (!pesoAtras) continue;
    const pesoAdelante = contados - pesoAtras;
    if (!pesoAdelante) break;
    sumaAtras += v * cuantos[v];
    const mediaAtras = sumaAtras / pesoAtras;
    const mediaAdelante = (suma - sumaAtras) / pesoAdelante;
    const entre = pesoAtras * pesoAdelante * (mediaAtras - mediaAdelante) ** 2;
    if (entre > mejor) {
      mejor = entre;
      corte = v;
    }
  }
  return corte;
}

function formaDeLaHoja(gris, ancho, alto, valido) {
  const total = ancho * alto;
  const todoVale = () => (valido ? valido.slice() : new Uint8Array(total).fill(1));

  const corte = corteDeOtsu(gris, total, valido);
  const claro = new Uint8Array(total);
  for (let p = 0; p < total; p++) {
    if ((!valido || valido[p]) && gris[p] > corte) claro[p] = 1;
  }

  /* ¿HAY MESA ALREDEDOR?

     Solo se busca la hoja si el borde de la foto esta oscuro CASI ENTERO. Un papel apoyado
     en una mesa tiene mesa en los cuatro lados; una foto sacada de cerca es todo papel y no
     hay nada que recortar. En el medio esta el caso peligroso: una hoja con media sombra
     encima deja medio borde oscuro sin que haya ninguna mesa, y si se le hace caso se
     recorta la mitad iluminada y se pierde la firma. Paso en las pruebas: por eso el corte
     esta alto y no en la mitad. */
  let borde = 0;
  let bordeOscuro = 0;
  const mirarBorde = (x, y) => {
    const p = y * ancho + x;
    if (valido && !valido[p]) return;
    borde++;
    if (!claro[p]) bordeOscuro++;
  };
  for (let x = 0; x < ancho; x++) { mirarBorde(x, 0); mirarBorde(x, alto - 1); }
  for (let y = 0; y < alto; y++) { mirarBorde(0, y); mirarBorde(ancho - 1, y); }
  if (!borde || bordeOscuro < borde * 0.7) return todoVale();

  // ---- 1) los pedazos grandes de claro
  const visto = new Uint8Array(total);
  const hoja = new Uint8Array(total);
  const pila = [];
  let deLaHoja = 0;
  for (let inicio = 0; inicio < total; inicio++) {
    if (!claro[inicio] || visto[inicio]) continue;
    const grupo = [];
    pila.push(inicio);
    visto[inicio] = 1;
    while (pila.length) {
      const punto = pila.pop();
      grupo.push(punto);
      const x = punto % ancho;
      const y = (punto - x) / ancho;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= ancho || ny >= alto) continue;
        const q = ny * ancho + nx;
        if (claro[q] && !visto[q]) {
          visto[q] = 1;
          pila.push(q);
        }
      }
    }
    if (grupo.length < total * 0.08) continue;
    for (const punto of grupo) hoja[punto] = 1;
    deLaHoja += grupo.length;
  }

  /* Si lo mas claro que hay es una miseria, no se encontro ninguna hoja: se trabaja con
     toda la foto y que decida el resto. */
  if (deLaHoja < total * 0.15) return todoVale();

  // ---- 2) tapar los agujeros: lo que no es hoja y NO se alcanza desde el borde, es hoja
  const afuera = new Uint8Array(total);
  for (let x = 0; x < ancho; x++) {
    for (const y of [0, alto - 1]) {
      const p = y * ancho + x;
      if (!hoja[p] && !afuera[p]) { afuera[p] = 1; pila.push(p); }
    }
  }
  for (let y = 0; y < alto; y++) {
    for (const x of [0, ancho - 1]) {
      const p = y * ancho + x;
      if (!hoja[p] && !afuera[p]) { afuera[p] = 1; pila.push(p); }
    }
  }
  while (pila.length) {
    const punto = pila.pop();
    const x = punto % ancho;
    const y = (punto - x) / ancho;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= ancho || ny >= alto) continue;
      const q = ny * ancho + nx;
      if (!hoja[q] && !afuera[q]) { afuera[q] = 1; pila.push(q); }
    }
  }
  for (let p = 0; p < total; p++) if (!afuera[p]) hoja[p] = 1;

  // ---- 3) meter el contorno para adentro, para dejar afuera el canto
  const meter = Math.max(2, Math.round(Math.min(ancho, alto) * 0.02));
  const suma = tablaDeSumas(hoja, ancho, alto);
  const adentro = new Uint8Array(total);
  for (let y = 0; y < alto; y++) {
    const y0 = Math.max(0, y - meter);
    const y1 = Math.min(alto - 1, y + meter);
    for (let x = 0; x < ancho; x++) {
      if (!hoja[y * ancho + x]) continue;
      const x0 = Math.max(0, x - meter);
      const x1 = Math.min(ancho - 1, x + meter);
      const area = (x1 - x0 + 1) * (y1 - y0 + 1);
      const caja = suma[(y1 + 1) * (ancho + 1) + (x1 + 1)]
        - suma[y0 * (ancho + 1) + (x1 + 1)]
        - suma[(y1 + 1) * (ancho + 1) + x0]
        + suma[y0 * (ancho + 1) + x0];
      /* Solo si TODO su vecindario es hoja: asi el canto y su sombra quedan afuera. */
      if (caja >= area) adentro[y * ancho + x] = 1;
    }
  }
  return adentro;
}

function marcarTinta(imagen, alfaEsRecorte) {
  const { width, height, data } = imagen;
  const total = width * height;

  /* Un PNG ya recortado, con fondo transparente, no necesita que le adivinemos nada: la
     tinta es exactamente lo que no es transparente. Se pregunta PRIMERO porque en una
     imagen asi lo de abajo falla — el fondo transparente no tiene color y el umbral local
     lo lee como si fuera negro.

     Con `alfaEsRecorte` esto NO corre: ahi la transparencia no marca el fondo del dibujo
     sino los pedazos que quedaron afuera al girar la foto. */
  if (!alfaEsRecorte) {
    const transparente = new Uint8Array(total);
    let opacos = 0;
    let translucidos = 0;
    for (let i = 3, p = 0; p < total; p++, i += 4) {
      if (data[i] > 128) {
        transparente[p] = 1;
        opacos++;
      }
      if (data[i] < 250) translucidos++;
    }
    if (translucidos > total * 0.05 && opacos >= MINIMO_PIXELES) {
      return { tinta: transparente, porBrillo: false, valido: transparente };
    }
  }

  const foto = alfaEsRecorte ? loQueEsFoto(imagen, total) : null;
  const valido = foto ? foto.valido : null;
  if (foto && foto.cuantos < MINIMO_PIXELES) return null;

  const gris = aGrisesConContraste(imagen, valido);

  /* Solo se busca tinta ADENTRO DE LA HOJA. Todo lo de afuera —la mesa, el canto, la
     sombra— deja de existir para el resto del calculo. */
  const soloLaHoja = formaDeLaHoja(gris, width, height, valido);
  let enLaHoja = 0;
  for (let p = 0; p < total; p++) if (soloLaHoja[p]) enLaHoja++;
  if (enLaHoja < MINIMO_PIXELES) return null;

  const { tinta, cuantos } = porUmbralLocal(gris, width, height, soloLaHoja);
  if (cuantos < MINIMO_PIXELES) return null;
  /* `porBrillo` ya no quiere decir "no encontre azul": quiere decir "esto salio dudoso y
     conviene que lo mires". Pasa cuando media foto quedo marcada como tinta. */
  return { tinta, porBrillo: cuantos > enLaHoja * DEMASIADO, valido: soloLaHoja };
}

/* Limpia lo que quedo marcado como tinta pero no es la firma.

   DOS COSAS SE TIRAN, y las dos salieron de mirar fotos de verdad:

   1. Las manchitas sueltas. Una mota de polvo en la mesa agranda el recorte y deja la firma
      chiquita en un rincon.

   2. **Lo que toca el borde de la foto.** Esto es lo que arruinaba el recorte: en una foto
      de un papel apoyado en una mesa, el BORDE DE LA HOJA es una raya oscura larguisima, y
      un umbral local la ve como el trazo mas marcado de toda la imagen. Salian barras
      negras alrededor de la firma y la firma quedaba diminuta adentro.

      Una firma esta en el medio del papel; el borde de la hoja, la sombra de abajo y el
      canto de la mesa llegan siempre hasta el borde de la foto. Asi que lo que toca el
      borde no es firma.

      Con una salvedad: si al sacar eso no queda casi nada, es que la foto vino recortada al
      ras y lo que toca el borde SI era la firma. Ahi se deja todo como estaba.

   `orilla` marca cuales pixeles no son foto (las esquinas que quedan al girar): esos no
   cuentan como borde, porque el borde de verdad es el de la foto girada. */
/* Que tan GRUESO es lo mas gordo de cada mancha.

   Es lo que separa una firma de una sombra. Una firma son trazos finos: una lapicera deja
   unos pocos pixeles de ancho por mas que la foto sea grande. La sombra del propio telefono
   sobre la hoja es un manchon macizo de decenas de pixeles de lado.

   Se mide preguntando, en cada punto, si le entra un cuadrado entero de tinta alrededor. Con
   la tabla de sumas eso sale con cuatro restas, asi que da igual el tamano del cuadrado. */
function loGruesoQueEs(tinta, ancho, alto, lado) {
  const suma = tablaDeSumas(tinta, ancho, alto);
  const radio = Math.floor(lado / 2);
  const macizo = new Uint8Array(tinta.length);
  for (let y = radio; y < alto - radio; y++) {
    for (let x = radio; x < ancho - radio; x++) {
      if (!tinta[y * ancho + x]) continue;
      const x0 = x - radio;
      const y0 = y - radio;
      const x1 = x + radio;
      const y1 = y + radio;
      const area = (x1 - x0 + 1) * (y1 - y0 + 1);
      const caja = suma[(y1 + 1) * (ancho + 1) + (x1 + 1)]
        - suma[y0 * (ancho + 1) + (x1 + 1)]
        - suma[(y1 + 1) * (ancho + 1) + x0]
        + suma[y0 * (ancho + 1) + x0];
      if (caja >= area) macizo[y * ancho + x] = 1;
    }
  }
  return macizo;
}

function limpiar(tinta, ancho, alto, minimo, orilla = null) {
  const visto = new Uint8Array(tinta.length);
  const grupos = [];
  const pila = [];

  /* Un cuadrado de este lado, todo lleno de tinta, ya no es un trazo de lapicera. Se mide
     contra el lado corto de la foto para que valga igual en una foto grande y en una chica. */
  const ladoDeManchon = Math.max(5, Math.round(Math.min(ancho, alto) / 40));

  /* Se borran LOS PIXELES del manchon, no el grupo entero al que pertenecen.

     Es la diferencia que importa cuando la sombra TOCA la firma: tirando el grupo entero se
     iba tambien la firma; borrando los pixeles gruesos, la parte fina del trazo sobrevive.
     `loGruesoQueEs` marca los centros; se agranda esa marca para tapar el manchon completo. */
  const macizo = loGruesoQueEs(tinta, ancho, alto, ladoDeManchon);
  const sumaMacizo = tablaDeSumas(macizo, ancho, alto);
  const radio = Math.ceil(ladoDeManchon / 2);
  const limpiaDeManchones = new Uint8Array(tinta.length);
  let quedoAlgo = 0;
  for (let y = 0; y < alto; y++) {
    const y0 = Math.max(0, y - radio);
    const y1 = Math.min(alto - 1, y + radio);
    for (let x = 0; x < ancho; x++) {
      if (!tinta[y * ancho + x]) continue;
      const x0 = Math.max(0, x - radio);
      const x1 = Math.min(ancho - 1, x + radio);
      const cerca = sumaMacizo[(y1 + 1) * (ancho + 1) + (x1 + 1)]
        - sumaMacizo[y0 * (ancho + 1) + (x1 + 1)]
        - sumaMacizo[(y1 + 1) * (ancho + 1) + x0]
        + sumaMacizo[y0 * (ancho + 1) + x0];
      if (cerca === 0) {
        limpiaDeManchones[y * ancho + x] = 1;
        quedoAlgo++;
      }
    }
  }
  /* Salvo que borrar los manchones se lleve TODO: ahi eran la firma (una firma con marcador
     grueso, o una foto muy chica). */
  const tinta2 = quedoAlgo >= minimo * 2 ? limpiaDeManchones : tinta;

  const esBorde = (x, y) => {
    if (!orilla) return x === 0 || y === 0 || x === ancho - 1 || y === alto - 1;
    /* Con la foto girada, es borde el que tiene al lado un pedazo que no es foto. */
    if (x === 0 || y === 0 || x === ancho - 1 || y === alto - 1) return true;
    return !orilla[y * ancho + x - 1] || !orilla[y * ancho + x + 1]
      || !orilla[(y - 1) * ancho + x] || !orilla[(y + 1) * ancho + x];
  };

  for (let inicio = 0; inicio < tinta2.length; inicio++) {
    if (!tinta2[inicio] || visto[inicio]) continue;
    const grupo = [];
    let tocaElBorde = false;
    pila.push(inicio);
    visto[inicio] = 1;
    while (pila.length) {
      const punto = pila.pop();
      grupo.push(punto);
      const x = punto % ancho;
      const y = (punto - x) / ancho;
      if (esBorde(x, y)) tocaElBorde = true;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= ancho || ny >= alto) continue;
        const q = ny * ancho + nx;
        if (tinta2[q] && !visto[q]) {
          visto[q] = 1;
          pila.push(q);
        }
      }
    }
    if (grupo.length >= minimo) grupos.push({ grupo, tocaElBorde });
  }

  const pintar = (cuales) => {
    const limpia = new Uint8Array(tinta2.length);
    for (const { grupo } of cuales) for (const punto of grupo) limpia[punto] = 1;
    return limpia;
  };

  /* Queda algo que valga la pena? La pregunta NO es "queda un porcentaje del total": la
     sombra del telefono puede ser mas grande que la propia firma, y con un porcentaje el
     descarte se negaba a hacerse justo cuando mas hacia falta. La pregunta correcta es si
     despues de tirar sigue habiendo firma. */
  const bastante = (cuales) =>
    cuales.length > 0 && cuales.reduce((n, g) => n + g.grupo.length, 0) >= minimo * 2;

  /* Y ademas se saca lo que toca el borde de la foto, que es el canto de la hoja. Igual que
     arriba: solo si despues sigue quedando firma. */
  let quedan = grupos;
  const sinBorde = quedan.filter((g) => !g.tocaElBorde);
  if (bastante(sinBorde)) quedan = sinBorde;
  return pintar(quedan);
}

/* `imagen` es lo que devuelve `ctx.getImageData()`: data RGBA, width y height.

   `alfaEsRecorte` lo usa la pantalla cuando giro una FOTO: ahi la transparencia marca los
   pedazos que quedaron afuera del rectangulo girado, no el fondo de un dibujo. */
export function recortar(imagen, { alfaEsRecorte = false } = {}) {
  const marcado = marcarTinta(imagen, alfaEsRecorte);
  if (!marcado) return null;

  const { width: ancho, height: alto } = imagen;
  /* El minimo crece con la foto: veinte pixeles en una foto de celular es una mota, y las
     motas se acumulan y agrandan el recorte. */
  const minimo = Math.max(MINIMO_PIXELES, Math.round((ancho * alto) / 20000));
  const tinta = limpiar(marcado.tinta, ancho, alto, minimo, marcado.valido);

  let x0 = ancho, y0 = alto, x1 = -1, y1 = -1;
  for (let y = 0; y < alto; y++) {
    for (let x = 0; x < ancho; x++) {
      if (!tinta[y * ancho + x]) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) return null;

  const anchoRecorte = x1 - x0 + 1;
  const altoRecorte = y1 - y0 + 1;
  const anchoFinal = ANCHO_GUARDADO;
  const altoFinal = Math.max(1, Math.round((anchoFinal * altoRecorte) / anchoRecorte));

  /* Se achica preguntando "en este pedazo, hay algo de tinta?" y no promediando: los
     trazos finos son un pixel de ancho y un promedio los borraria. */
  const porFila = Math.ceil(anchoFinal / 8);
  const bits = new Uint8Array(porFila * altoFinal);
  for (let y = 0; y < altoFinal; y++) {
    const ay = Math.floor((y * altoRecorte) / altoFinal);
    const by = Math.max(ay + 1, Math.floor(((y + 1) * altoRecorte) / altoFinal));
    for (let x = 0; x < anchoFinal; x++) {
      const ax = Math.floor((x * anchoRecorte) / anchoFinal);
      const bx = Math.max(ax + 1, Math.floor(((x + 1) * anchoRecorte) / anchoFinal));
      let hay = false;
      for (let py = y0 + ay; py < y0 + by && !hay; py++) {
        for (let px = x0 + ax; px < x0 + bx; px++) {
          if (tinta[py * ancho + px]) {
            hay = true;
            break;
          }
        }
      }
      if (hay) bits[y * porFila + (x >> 3)] |= 128 >> (x & 7);
    }
  }

  return {
    clase: "mascara",
    ancho: anchoFinal,
    alto: altoFinal,
    bits,
    porBrillo: marcado.porBrillo,
  };
}
