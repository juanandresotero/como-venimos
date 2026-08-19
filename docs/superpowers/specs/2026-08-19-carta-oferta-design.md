# Carta oferta — Diseño

- **Fecha:** 2026-08-19
- **Usuario:** Juan Andrés Otero — Agente inmobiliario, RE/MAX Único (Montevideo)
- **Estado:** Diseño presentado y aprobado en la charla. Pendiente de revisión del escrito.
- **Fuente del texto:** `Carta oferta templete.docx` (entregado por el usuario el
  2026-08-19). **No se versiona**: el `.docx` trae el nombre de una tercera persona en sus
  metadatos y el repositorio es público. El texto vive en `lib/carta-oferta.js`.

---

## 1. Qué es y para qué

Una cuarta herramienta en la app: **llenar la OFERTA DE COMPRA de RE/MAX, firmarla con el
dedo y mandarla por WhatsApp.**

Hoy el usuario abre el Word, escribe encima de las rayitas, exporta a PDF y lo manda. Las
partes lo imprimen, lo firman a mano y le devuelven una foto. La herramienta reemplaza ese
circuito sin obligar a nadie a abandonarlo: **cada parte elige si firma en la pantalla o en
el papel.**

### Lo que NO hace

- **No guarda un historial de cartas.** Guarda un borrador (el que estás llenando) para no
  perderlo si cerrás la app. Nada más. Si hace falta historial, se agrega después.
- **No persigue el estado.** No hay "carta enviada, esperando firma". El estado viaja
  dentro del enlace; WhatsApp es el seguimiento.
- **No es firma electrónica avanzada** (Ley 18.600). Es firma electrónica simple: vale
  entre las partes, pero si se discute en juicio hay que probarla. El usuario confirmó que
  la oficina lo acepta.

---

## 2. Las tres puertas de cada casilla

Es el corazón del pedido y la decisión de diseño que manda sobre todo lo demás. Cada
casilla del documento tiene **tres** estados, no dos:

| Estado | Qué sale en el papel |
|---|---|
| **Completa** | El valor escrito, dentro de la frase |
| **Vacía** | La rayita `______`, para completar a mano o en pantalla |
| **Quitada** | Nada: la frase se cierra sola, sin agujeros ni comas sueltas |

### Cómo se consigue el tercer estado

Cada casilla **se lleva sus propias palabras de enganche**. En la plantilla no se escribe
la frase entera con un hueco en el medio; se escribe como piezas, y las palabras que
conectan a la casilla con el resto viajan pegadas a ella:

```js
{ texto: "...del inmueble empadronado" },
{ campo: "padron",  antes: " con el número " },
{ campo: "calle",   antes: " ubicado en la calle " },
{ campo: "ciudad",  antes: " de la ciudad de " },
{ texto: ", República Oriental del Uruguay." },
```

- **Completa** → escribe `antes` + el valor.
- **Vacía** → escribe `antes` + la rayita.
- **Quitada** → no escribe nada, ni el `antes`.

Quitando `ciudad` queda *"…ubicado en la calle Rivera 3393, República Oriental del
Uruguay."*, que es prosa correcta. Ese es todo el truco, y es lo que hay que testear con
saña.

Después de armar cada párrafo corre una **limpieza**: espacios dobles a espacio simple,
`" ,"` a `","`, `" ."` a `"."`, y se recortan los extremos. Sin eso, quitar una casilla del
final deja basura invisible en el PDF.

### Qué se puede quitar y qué no

Quitar el precio o los plazos deja una carta que no dice nada. Se puede quitar solo lo que
la frase sobrevive sin ello:

| Casilla | ¿Se puede quitar? | Por qué |
|---|---|---|
| `nombre`, `cedula` | No | Sin oferente identificado no hay oferta |
| `telefono`, `correo` | Sí | Son datos de contacto, no de fondo |
| `padron` | Sí | El inmueble ya queda identificado por la calle |
| `calle` | No | Es lo único que identifica al inmueble sin padrón |
| `ciudad` | Sí | Queda "República Oriental del Uruguay" |
| `precio` | No | Es el objeto del contrato |
| `dias_reserva`, `dias_validez` | No | Son plazos que obligan |
| `fecha_oferta` | No | Sin fecha no corre el plazo del QUINTO |
| `propietario_nombre`, `propietario_cedula` | No | Sin ellos no hay aceptación |
| `propietario_domicilio` | Sí | Es un domicilio a efectos, no esencial |
| `fecha_aceptacion` | No | Es la fecha en que se cierra el acuerdo |

Las no quitables igual se pueden dejar **vacías** — esa es la puerta para completarlas a
mano.

---

## 3. Las quince casillas y las tres firmas

Salen del `.docx` entregado, respetando su redacción palabra por palabra.

**Encabezado (OFERENTE)** — las llena el comprador
`nombre` · `cedula` · `telefono` · `correo`

**PRIMERO — objeto** — las llena el usuario
`padron` · `calle` · `ciudad`

**SEGUNDO — precio** — la llena el usuario
`precio`

**TERCERO — reserva** — el usuario. Por defecto **15** (es lo que puso en sus dos cartas
reales; el modelo de la oficina trae 5)
`dias_reserva`

**QUINTO — validez** — el usuario. Por defecto **5**
`dias_validez`

**SEXTO — fecha de la oferta** — el usuario, por defecto hoy
`fecha_oferta`

**ACEPTACIÓN (hoja 2)** — las llena el propietario
`propietario_nombre` · `propietario_cedula` · `propietario_domicilio` · `fecha_aceptacion`

**Firmas:** `firma_oferente` (comprador) · `firma_depositario` (el usuario) ·
`firma_propietario` (dueño)

### Dos arreglos al texto original

**1. La cláusula QUINTO se contradice sola.** El modelo dice *"por un plazo de cinco
(\_\_\_\_) días hábiles"*: la palabra **cinco está fija** y el número va en la rayita.
Poner 10 produce *"cinco (10) días hábiles"*. Se arregla escribiendo las dos formas desde
el mismo dato: *"diez (10) días hábiles"*. Lo mismo en el TERCERO.

**2. El precio va en letras y en números.** Se escribe `134000` y sale *"ciento treinta y
cuatro mil (U$S 134.000)"*, que es como el usuario lo escribió a mano en la carta de Víctor
Manuel. Evita el clásico desacuerdo entre lo que dice la letra y lo que dice la cifra.

### La cláusula CUARTO no cambia

El modelo entregado usa la redacción de negocio compartido (*"los agentes asociados de
RE/MAX… la suma pactada previamente"*) y no menciona ni el 3% ni la dirección de Av.
Brasil. El usuario confirmó que quiere **esa sola redacción siempre**. No hay interruptor
propia/compartida.

---

## 4. Cómo circula

### El orden

**El que va digital va primero.** Es la regla que puso el usuario y la que ordena todo:
una carta puede pasar de digital a papel, nunca al revés.

```
   usuario llena lo que sabe
            │
            ├── "Firmar acá" ──► la parte que está presente firma en el celular del usuario
            │
            ├── "Enviar" ──────► enlace por WhatsApp ──► la parte completa y firma en su celular
            │                                                      │
            │                    ◄──── vuelve por WhatsApp ────────┘
            │
            └── "PDF" ─────────► se imprime y se sigue a mano (de acá no se vuelve)
```

Cada vuelta **acumula**: el comprador agrega lo suyo sobre lo que puso el usuario, el
usuario firma como DEPOSITARIO sobre eso, el propietario agrega lo suyo sobre todo lo
anterior.

### Dos formatos con dos trabajos distintos

- **El enlace lleva los datos vivos.** Es lo único que permite que la cadena siga.
- **El PDF es la foto final.** Para imprimir, archivar o mandar a quien no va a firmar en
  pantalla. Lo ya firmado sale con la firma dibujada de verdad, no con la rayita.

### Cómo viaja el enlace

`https://juanandresotero.github.io/como-venimos/firmar.html#<datos>`

Los datos van **en el fragmento** (después del `#`). El fragmento **no se manda al
servidor**: GitHub Pages nunca ve el contenido de la carta, ni queda en ningún registro.
Viaja de un celular al otro dentro del mensaje de WhatsApp.

Lleva adentro: los valores de las casillas, cuáles están quitadas, las firmas hechas hasta
ahora, **de quién es el turno** (`comprador` o `propietario`) y el teléfono del usuario
para el botón de devolución.

### Lo que hay que probar antes que nada

El enlace va a ser largo. **Presupuesto: 3.000 caracteres** para una carta llena con tres
firmas. Hay un test que lo mide y falla si se pasa. Si en el celular real WhatsApp lo
maltrata, se cambia de plan **antes** de construir el PDF, que es la parte cara.

---

## 5. La firma

Se captura como **trazos de puntos**, no como imagen. Un dibujo de puntos ocupa una
fracción de lo que ocupa un PNG, se dibuja nítido a cualquier tamaño, y en el PDF entra
como trazo vectorial de verdad.

- Cada trazo se remuestrea a un máximo de 60 puntos y se guarda como diferencias en una
  grilla de 1024×512. La mayoría de las diferencias entran en un byte.
- Una firma ronda los 400 bytes; tres, poco más de 1 KB.
- El panel de firma se dibuja con eventos `pointer` sobre un `<canvas>`, con botones
  **Borrar** y **Listo**. Sin `long-press` — ya se sabe que en el teléfono se cancela solo.

**La firma del usuario se guarda una vez** en `localStorage` y se reusa en cada carta. No
la redibuja nunca más.

---

## 6. Las piezas

Archivos chicos y con un trabajo cada uno. Los cuatro primeros no saben nada de pantallas:
los usan tanto la app como la página del cliente.

| Archivo | Su único trabajo |
|---|---|
| `lib/carta-oferta.js` | La plantilla como datos y `armar(valores, quitadas)` → los párrafos resueltos |
| `lib/numero-a-letras.js` | `134000` → `"ciento treinta y cuatro mil"` |
| `lib/firma.js` | Capturar, codificar, decodificar y dibujar una firma |
| `lib/carta-enlace.js` | Empaquetar y desempaquetar el estado de la carta en el `#` de una URL |
| `lib/pdf.js` | Escribir un PDF a mano: texto justificado, saltos de página y trazos |
| `vistas/carta-oferta.js` | La pantalla de la app: llenar, previsualizar, firmar, enviar |
| `firmar.html` + `vistas/firmar.js` | La página suelta que abre el cliente desde el enlace |

`armar()` es la única fuente de verdad del documento. La pantalla y el PDF **leen lo
mismo**: si difieren, es un error, no una variante.

### La página del cliente es una isla

`firmar.html` **no carga la app**: ni el tablero, ni la cartera, ni el token de GitHub, ni
el service worker. Lee el fragmento, muestra la carta, resalta solo las casillas del turno
que corresponde, ofrece firmar, y devuelve por WhatsApp. Nada más. El cliente no tiene por
qué recibir ni un byte del negocio del usuario.

### El PDF, sin librerías

Como todo en este proyecto. Helvetica y Helvetica-Bold son fuentes que el PDF ya trae
(base-14): no hay que incrustar nada. Con `/WinAnsiEncoding` entran todos los acentos, la
ñ, los signos de apertura y las comillas curvas `" "` que usa el texto original.

Sabe hacer: párrafo justificado con corte de palabras, salto de página, rayitas, y trazos
(las firmas). Dos hojas, como el Word. Es la pieza más laboriosa del trabajo.

### Dónde entra en Herramientas

Herramientas es **una línea de tiempo de la propiedad** con paradas numeradas — un
concepto que el usuario eligió a propósito el 2026-08-19, después de rechazar una versión
de dibujos sueltos. La carta oferta **no rompe ese concepto: lo completa**, porque cae
justo entre mirar la propiedad y cerrar el negocio:

| | Parada | Herramienta |
|---|---|---|
| 1 | Antes de comprarla | ¿Cuánto renta una propiedad? |
| **2** | **Al hacer la oferta** | **Carta oferta** |
| 3 | Al cerrar el negocio | ¿Cuánto es tu comisión? |
| 4 | Cada año del contrato | ¿Cuánto sube el alquiler? |

Se agrega una parada, no se rediseña el menú. `HERRAMIENTAS` en `vistas/herramientas.js`
ya es una lista: entra un elemento más en la posición 2.

---

## 7. Dónde vive cada cosa

**Nada de esto toca `datos/`.** Una carta oferta lleva cédulas, teléfonos y precios, y el
repositorio es público. Todo va a `localStorage`, igual que las cuentas bancarias:

| Qué | Dónde |
|---|---|
| Borrador de la carta en curso | `localStorage` |
| Firma guardada del usuario | `localStorage` |
| Padrón ya tipeado, por propiedad (§12) | `localStorage` |
| Cartas terminadas | En ningún lado: quedan en el WhatsApp y en el PDF |

Es una regla del proyecto (§3.3: un dueño por archivo), no una precaución de esta
herramienta.

---

## 8. Cómo se prueba

Al estilo del proyecto: `node --test tests-js/*.test.mjs`.

| Test | Qué vigila |
|---|---|
| `numero-a-letras.test.mjs` | Los casos molestos: 1, 15, 21, 100, 101, 1000, 134000, cero |
| `carta-oferta.test.mjs` | Los tres estados. Sobre todo: **quitar una casilla deja prosa correcta** — sin espacios dobles, sin comas huérfanas, sin frases cortadas |
| `carta-oferta.test.mjs` | Que el TERCERO y el QUINTO escriban la misma cifra en letra y en número |
| `firma.test.mjs` | Codificar y decodificar devuelve el mismo dibujo, y una firma normal pesa menos de 600 bytes |
| `carta-enlace.test.mjs` | Ida y vuelta completa, y **el enlace de una carta llena con tres firmas mide menos de 3.000 caracteres** |
| `pdf.test.mjs` | El PDF resultante abre: tabla `xref` coherente, dos páginas, y los acentos codificados en WinAnsi |
| `estilos.test.mjs` | (ya existe) que las clases nuevas tengan regla en `app.css` |

El navegador no se puede testear solo: el panel de firma y el envío a WhatsApp se prueban
en el celular del usuario, con capturas de pantalla como se viene haciendo.

---

## 9. Orden de construcción

Primero lo que puede tumbar el diseño, después lo caro.

1. **`numero-a-letras.js`** — chico, puro, sin sorpresas. Calienta motores.
2. **`carta-oferta.js`** — la plantilla y los tres estados. Es el corazón.
3. **`firma.js` + `carta-enlace.js`** — y el test de tamaño del enlace.
4. **PARAR. Probar el enlace en el celular del usuario, por WhatsApp, de verdad.** Si
   WhatsApp lo maltrata, acá se replantea, no después.
5. **`vistas/carta-oferta.js`** — la pantalla de la app.
6. **`firmar.html`** — la página del cliente.
7. **`lib/pdf.js`** — lo último y lo más laborioso.

El paso 4 es un freno a propósito. Todo lo que viene después depende de que el enlace
funcione, y eso no se puede saber desde acá.

---

## 10. Lo que puede salir mal

| Riesgo | Qué se hace |
|---|---|
| WhatsApp corta o no reconoce un enlace de 2 KB | Se descubre en el paso 4, antes de gastar el trabajo caro |
| El cliente no da el toque de devolución y la carta queda a medias | El usuario tiene el PDF y puede seguir a mano; nada se pierde |
| Quitar una casilla deja una frase rota | Es el test más importante del paquete, caso por caso |
| Alguien reenvía el enlace y un tercero ve la carta | Mismo riesgo que reenviar el PDF. Se acepta |
| El PDF sale mal armado y no abre | `pdf.test.mjs` revisa la estructura; además se abre uno de verdad antes de dar por terminado |
| La carta se cuela a `datos/` y termina en el repositorio público | Vive solo en `localStorage`. Es la regla, no una precaución |

---

## 11. Lo que queda afuera a propósito

- Historial de cartas enviadas.
- Firma electrónica avanzada (Abitab / Correo Uruguayo).
- Que el propietario reciba la carta automáticamente cuando el comprador firma: el usuario
  la reenvía a mano, que es como trabaja hoy.
- Autocompletar desde la cartera más allá de dirección y precio: el padrón no lo publica
  RE/MAX, y la mayoría de las cartas son de propiedades que no son del usuario.
- **Averiguar el padrón solo, a partir de la dirección.** Ver §12.

---

## 12. El padrón no se puede averiguar solo

Se investigó a pedido del usuario el 2026-08-19. **No se puede, y conviene que no se
intente.** Tres razones, en orden de peso:

1. **No existe un servicio al que preguntarle.** Ni la Dirección Nacional de Catastro ni
   la Intendencia de Montevideo publican una consulta dirección → padrón. Lo que publican
   es el **archivo de parcelas completo, una vez por mes**: 1,2 millones de padrones a
   nivel país, o toda la parcela de Montevideo en un ZIP. Es una descarga, no una
   consulta.
   - Montevideo: `https://intgis.montevideo.gub.uy/sit/php/common/datos/generar_zip2.php?nom_tab=v_mdg_parcelas_geom&tipo=gis` (shapefile, geometría + padrón)
   - País: `https://catalogodatos.gub.uy/dataset/direccion-nacional-de-catastro-padrones-urbanos-y-rurales` (ZIP mensual, alfanumérico)
   - El visor de SNIG busca **por padrón**, que es el camino inverso al que se necesita.

2. **Aun con el mapa, solo serviría para casas.** En propiedad horizontal **cada unidad
   tiene su propio padrón**. El polígono da la parcela del edificio, no el apartamento.
   Buena parte de la operación del usuario son apartamentos.

3. **En Canelones la dirección misma es ambigua.** En zona balnearia se usan referencias
   como *"calle 6 intersección 5, Pinar Sur"* — texto que el propio usuario escribió en una
   carta real. No hay punto al que apuntar.

**El riesgo que decide:** un padrón equivocado identifica **otra propiedad** en un
documento que obliga. Como el usuario tendría que verificarlo igual, la adivinanza no
ahorra la verificación — solo el tipeo. La relación riesgo/beneficio es mala.

### Lo que se hace en su lugar

- **`padron` se recuerda por propiedad.** Se escribe una vez y la próxima carta sobre esa
  misma propiedad ya lo trae. Vive en `localStorage`, junto al borrador (§7).
- **Un botón al lado de la casilla** abre el visor de Catastro (`https://visor.catastro.gub.uy/visordnc/`)
  en una pestaña aparte, para copiar el número en dos toques. El usuario es el que
  verifica; la app no adivina.

### Lo que se descartó

Que el robot baje el shapefile de Montevideo cada mes y resuelva el padrón por
punto-en-polígono con las coordenadas que la cartera ya tiene. Es mucha maquinaria —leer
shapefiles sin librerías, decenas de megas mensuales— para un resultado que solo cubriría
**casas**, en **Montevideo**, y de la **cartera propia**: justamente el caso menos
frecuente, porque las cartas oferta son casi siempre sobre propiedades ajenas.
