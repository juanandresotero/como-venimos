# La app: Salud del Negocio y Hoy — Plan de implementación (Fase 2b1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el usuario abra la app en el celular y vea, de un vistazo, cómo viene su negocio y qué necesita su atención.

**Architecture:** Web app estática sin build step ni frameworks, servida desde la raíz del repo para que alcance los JSON de `datos/`. La lógica de cálculo vive en módulos puros de `lib/` que se prueban con `node --test`; las vistas solo dibujan. Una sola tipografía variable autoalojada (21,5 KB) da todo el sistema tipográfico.

**Tech Stack:** HTML + CSS + JavaScript con módulos ES nativos. Cero dependencias. Tests con `node --test` (viene con Node 24). Tipografía Bricolage Grotesque Variable (OFL).

**Spec de referencia:** [`../specs/2026-08-17-como-venimos-design.md`](../specs/2026-08-17-como-venimos-design.md) — implementa §7.1, §7.4, §8 y §11.

> **Nota de entorno.** Windows. Comandos POSIX, con la herramienta **Bash** (Git Bash).
> `fetch()` no funciona con `file://`: para probar hay que levantar `python -m http.server`.

---

## Alcance de esta fase

**Entra:** el armazón de la app (navegación, tema, carga de datos, funciona sin señal), la pantalla **Salud del Negocio** completa y la pantalla **Hoy** con la bandeja de pendientes en modo lectura.

**No entra:** editar nada. Ni guardar, ni el token de GitHub, ni el alta manual de negocios, ni el reporte descargable (§8.6), ni las pantallas de Cartera y Renta. Al terminar esta fase el usuario **ve** todo pero todavía no **toca** nada. Eso es deliberado: primero pulimos qué se muestra y cómo, y recién después metemos la complejidad de escribir.

## Dirección de diseño

**Panel de instrumentos.** No un folleto inmobiliario: un instrumento de precisión que se lee en tres segundos entre visita y visita.

| Decisión | Por qué |
|---|---|
| **El número es el héroe** | Grandes, anchos, con cifras tabulares. Todo lo demás se corre para dejarlos respirar. |
| **El color significa, no decora** | 🔴 rojo = te pide algo · 🔵 azul = plata y progreso, en tres intensidades según cuán cerca está de cerrarse · blanco = el lienzo. |
| **La barra de ritmo es la firma** | Una pista donde el avance real se mide contra un marcador de calendario. **La distancia entre los dos es la información.** Es lo que el Excel nunca pudo mostrar. |
| **Las tres capas se ven, no se leen** | Barra apilada: cobrado en azul sólido, casi seguro en azul rayado, potencial solo contorneado. La certeza se codifica visualmente. |
| **Una sola tipografía variable** | Bricolage Grotesque, 21,5 KB, con ejes de ancho y peso. Carácter propio sin sacrificar velocidad. |

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `index.html` | El armazón: cabecera, contenedor de vista, barra inferior. |
| `app.css` | Todo el sistema visual: tokens, tipografía, componentes, modo oscuro. |
| `app.js` | Arranque: cargar datos, navegar, dibujar la vista activa. |
| `lib/formato.js` | Formatear plata, fechas y porcentajes. Puro. |
| `lib/salud.js` | Las tres capas, el ritmo, los ratios y las métricas. Puro. |
| `lib/pendientes.js` | Derivar y agrupar los pendientes. Puro. |
| `vistas/salud.js` | Dibuja Salud del Negocio. |
| `vistas/hoy.js` | Dibuja Hoy. |
| `sw.js` · `manifest.webmanifest` | Que se instale como app y ande sin señal. |
| `tipografia/bricolage.woff2` | Ya descargada. |

---

## Task 1: El armazón y la tipografía

**Files:**
- Create: `index.html`, `manifest.webmanifest`, `tipografia/OFL.txt`

- [ ] **Step 1: Guardar la licencia de la tipografía**

Bricolage Grotesque es OFL: se puede usar y redistribuir, pero hay que incluir la licencia.

```bash
cd "c:/Users/es_bi/OneDrive/Desktop/claude/Como venimos"
curl -sL "https://raw.githubusercontent.com/ateliertriay/bricolage/main/OFL.txt" -o tipografia/OFL.txt
head -3 tipografia/OFL.txt
```
Expected: la primera línea dice `Copyright ... Bricolage Grotesque Project Authors`

- [ ] **Step 2: Escribir el armazón**

Crear `index.html`:

```html
<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>¿Cómo venimos?</title>
<meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0b0f1a" media="(prefers-color-scheme: dark)">
<link rel="manifest" href="manifest.webmanifest">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="¿Cómo venimos?">
<link rel="preload" href="tipografia/bricolage.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="app.css">
</head>
<body>

<header class="barra-estado" id="barra-estado" hidden></header>

<main id="vista" class="vista" tabindex="-1"></main>

<nav class="navegacion" id="navegacion">
  <button class="nav-boton" data-vista="hoy" aria-current="page">
    <span class="nav-icono" aria-hidden="true">◍</span><span class="nav-texto">Hoy</span>
    <span class="nav-globo" id="globo-pendientes" hidden></span>
  </button>
  <button class="nav-boton" data-vista="cartera">
    <span class="nav-icono" aria-hidden="true">⌂</span><span class="nav-texto">Cartera</span>
  </button>
  <button class="nav-boton" data-vista="negocios">
    <span class="nav-icono" aria-hidden="true">≡</span><span class="nav-texto">Negocios</span>
  </button>
  <button class="nav-boton" data-vista="salud">
    <span class="nav-icono" aria-hidden="true">▤</span><span class="nav-texto">Salud</span>
  </button>
  <button class="nav-boton" data-vista="renta">
    <span class="nav-icono" aria-hidden="true">%</span><span class="nav-texto">Renta</span>
  </button>
</nav>

<script type="module" src="app.js"></script>
</body>
</html>
```

- [ ] **Step 3: Escribir el manifiesto**

Crear `manifest.webmanifest`:

```json
{
  "name": "¿Cómo venimos?",
  "short_name": "Cómo venimos",
  "description": "Control de cartera y salud del negocio inmobiliario",
  "start_url": ".",
  "display": "standalone",
  "orientation": "portrait",
  "background_color": "#ffffff",
  "theme_color": "#0043ff",
  "lang": "es-UY"
}
```

- [ ] **Step 4: Commit**

```bash
git add index.html manifest.webmanifest tipografia/
git commit -m "feat: armazon de la app y tipografia propia"
```

---

## Task 2: El sistema visual

**Files:**
- Create: `app.css`

- [ ] **Step 1: Escribir el CSS**

Crear `app.css`:

```css
/* ¿Cómo venimos? — sistema visual
   Panel de instrumentos: lienzo limpio, numeros enormes, color con significado.
   El rojo SIEMPRE pide accion. El azul SIEMPRE es plata y progreso. */

@font-face {
  font-family: "Bricolage";
  src: url("tipografia/bricolage.woff2") format("woff2-variations");
  font-weight: 200 800;
  font-stretch: 75% 100%;
  font-display: swap;
}

:root {
  /* Lienzo */
  --lienzo: #ffffff;
  --lienzo-2: #f6f8fc;
  --linea: #e3e8f2;
  --tinta: #0b0f1a;
  --tinta-2: #5d6880;

  /* Rojo: te pide algo */
  --rojo: #ff1200;
  --rojo-tinta: #c40e00;
  --rojo-suave: #fff0ee;

  /* Azul: plata y progreso. Se satura a medida que el negocio se acerca a cerrarse. */
  --azul: #0043ff;
  --azul-medio: #5d84ff;
  --azul-claro: #b6c8ff;
  --azul-suave: #eef3ff;

  --radio: 18px;
  --sombra: 0 1px 2px rgba(11, 15, 26, .04), 0 8px 24px rgba(11, 15, 26, .05);
  --barra-alta: calc(66px + env(safe-area-inset-bottom));
}

@media (prefers-color-scheme: dark) {
  :root {
    --lienzo: #0b0f1a;
    --lienzo-2: #131926;
    --linea: #232c3f;
    --tinta: #f2f5fb;
    --tinta-2: #97a3ba;
    --rojo: #ff4433;
    --rojo-tinta: #ff7a6d;
    --rojo-suave: #2a1210;
    --azul: #4d7cff;
    --azul-medio: #7b9bff;
    --azul-claro: #37477a;
    --azul-suave: #131c33;
    --sombra: 0 1px 2px rgba(0, 0, 0, .3), 0 8px 24px rgba(0, 0, 0, .25);
  }
}

* { box-sizing: border-box; }

body {
  margin: 0;
  background: var(--lienzo-2);
  color: var(--tinta);
  font-family: "Bricolage", ui-sans-serif, system-ui, sans-serif;
  font-size: 15px;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
  padding-bottom: var(--barra-alta);
}

/* ---------- Tipografia ---------- */

.cifra {
  font-variant-numeric: tabular-nums;
  font-stretch: 100%;
  font-weight: 800;
  letter-spacing: -.03em;
  line-height: 1;
}
.cifra-heroe { font-size: clamp(38px, 12vw, 54px); }
.cifra-grande { font-size: 30px; }
.cifra-media { font-size: 20px; }

.etiqueta {
  font-size: 11px;
  font-weight: 700;
  font-stretch: 88%;
  letter-spacing: .13em;
  text-transform: uppercase;
  color: var(--tinta-2);
}

.titulo {
  font-size: 23px;
  font-weight: 700;
  font-stretch: 92%;
  letter-spacing: -.02em;
  margin: 0;
}

.apunte { font-size: 13px; color: var(--tinta-2); }

/* ---------- Estructura ---------- */

.vista { padding: 16px 16px 28px; max-width: 640px; margin: 0 auto; outline: none; }
.vista > * { animation: entrar .45s cubic-bezier(.2, .7, .3, 1) backwards; }
.vista > *:nth-child(2) { animation-delay: .05s; }
.vista > *:nth-child(3) { animation-delay: .1s; }
.vista > *:nth-child(4) { animation-delay: .15s; }
.vista > *:nth-child(n+5) { animation-delay: .2s; }

@keyframes entrar {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: none; }
}

@media (prefers-reduced-motion: reduce) {
  .vista > * { animation: none; }
}

.tarjeta {
  background: var(--lienzo);
  border: 1px solid var(--linea);
  border-radius: var(--radio);
  padding: 18px;
  margin-bottom: 12px;
  box-shadow: var(--sombra);
}
.tarjeta-titulo { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-bottom: 14px; }

/* ---------- Barra de estado del robot ---------- */

.barra-estado {
  padding: 9px 16px;
  font-size: 12px;
  font-weight: 600;
  text-align: center;
  background: var(--lienzo);
  border-bottom: 1px solid var(--linea);
  color: var(--tinta-2);
}
.barra-estado.alerta { background: var(--rojo-suave); color: var(--rojo-tinta); }

/* ---------- La barra de ritmo (el elemento firma) ---------- */

.ritmo { margin-top: 6px; }
.ritmo-pista {
  position: relative;
  height: 34px;
  background: var(--lienzo-2);
  border: 1px solid var(--linea);
  border-radius: 10px;
  overflow: hidden;
}
.ritmo-relleno {
  height: 100%;
  background: var(--azul);
  border-radius: 9px 0 0 9px;
  transition: width .8s cubic-bezier(.2, .7, .3, 1);
}
.ritmo-pista.atrasado .ritmo-relleno { background: var(--rojo); }
.ritmo-marca {
  position: absolute;
  top: -4px;
  bottom: -4px;
  width: 3px;
  background: var(--tinta);
  border-radius: 3px;
}
.ritmo-marca::after {
  content: attr(data-texto);
  position: absolute;
  top: -17px;
  left: 50%;
  transform: translateX(-50%);
  white-space: nowrap;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: .06em;
  text-transform: uppercase;
  color: var(--tinta-2);
}
.ritmo-pies { display: flex; justify-content: space-between; margin-top: 10px; font-size: 12px; }
.ritmo-veredicto { font-weight: 800; font-stretch: 100%; letter-spacing: .04em; text-transform: uppercase; font-size: 12px; }
.ritmo-veredicto.mal { color: var(--rojo-tinta); }
.ritmo-veredicto.bien { color: var(--azul); }

/* ---------- Las tres capas ---------- */

.capas-barra { display: flex; height: 14px; border-radius: 7px; overflow: hidden; background: var(--lienzo-2); margin: 4px 0 16px; }
.capas-tramo { transition: width .8s cubic-bezier(.2, .7, .3, 1); }
.capas-tramo.uno { background: var(--azul); }
.capas-tramo.dos { background: repeating-linear-gradient(115deg, var(--azul-medio) 0 5px, transparent 5px 10px), var(--azul-claro); }
.capas-tramo.tres { background: var(--azul-suave); box-shadow: inset 0 0 0 1px var(--azul-claro); }

.capa { display: grid; grid-template-columns: 12px 1fr auto; gap: 12px; align-items: center; padding: 11px 0; border-top: 1px solid var(--linea); }
.capa:first-of-type { border-top: none; }
.capa-punto { width: 12px; height: 12px; border-radius: 4px; }
.capa-punto.uno { background: var(--azul); }
.capa-punto.dos { background: repeating-linear-gradient(115deg, var(--azul-medio) 0 4px, transparent 4px 8px), var(--azul-claro); }
.capa-punto.tres { background: var(--azul-suave); box-shadow: inset 0 0 0 1px var(--azul-claro); }
.capa-nombre { font-weight: 600; font-size: 14px; }
.capa-sub { font-size: 12px; color: var(--tinta-2); }
.capa-monto { text-align: right; }

/* ---------- Pendientes ---------- */

.grupo { margin-bottom: 12px; }
.grupo-cabeza {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 15px 18px;
  background: var(--lienzo);
  border: 1px solid var(--linea);
  border-radius: var(--radio);
  box-shadow: var(--sombra);
  font: inherit;
  color: inherit;
  text-align: left;
  cursor: pointer;
}
.grupo.urgente .grupo-cabeza { border-color: var(--rojo); background: var(--rojo-suave); }
.grupo-cuenta {
  min-width: 26px; height: 26px; padding: 0 7px;
  display: grid; place-items: center;
  border-radius: 8px;
  background: var(--tinta); color: var(--lienzo);
  font-size: 13px; font-weight: 800;
}
.grupo.urgente .grupo-cuenta { background: var(--rojo); color: #fff; }
.grupo-nombre { flex: 1; font-weight: 600; font-size: 15px; }
.grupo-flecha { color: var(--tinta-2); transition: transform .2s; }
.grupo[open] .grupo-flecha { transform: rotate(90deg); }
.grupo-lista { list-style: none; margin: 6px 0 0; padding: 0; }
.grupo-item { padding: 12px 18px; border-bottom: 1px solid var(--linea); }
.grupo-item:last-child { border-bottom: none; }
.grupo-item-titulo { font-weight: 600; font-size: 14px; }
.grupo-item-detalle { font-size: 12.5px; color: var(--tinta-2); margin-top: 3px; }

.vacio { text-align: center; padding: 44px 20px; }
.vacio-signo { font-size: 40px; line-height: 1; }
.vacio-texto { margin-top: 12px; color: var(--tinta-2); }

/* ---------- Grafica de barras ---------- */

.barras { display: flex; align-items: flex-end; gap: 8px; height: 116px; margin-top: 6px; }
.barras-columna { flex: 1; display: flex; flex-direction: column; justify-content: flex-end; gap: 6px; height: 100%; }
.barras-caña { background: var(--azul-claro); border-radius: 5px 5px 0 0; min-height: 3px; transition: height .8s cubic-bezier(.2, .7, .3, 1); }
.barras-columna.actual .barras-caña { background: var(--azul); }
.barras-pie { text-align: center; font-size: 10.5px; color: var(--tinta-2); font-variant-numeric: tabular-nums; }
.barras-tope { text-align: center; font-size: 10.5px; font-weight: 700; font-variant-numeric: tabular-nums; }

/* ---------- Filas de datos ---------- */

.datos { display: grid; gap: 1px; background: var(--linea); border-radius: 12px; overflow: hidden; }
.dato { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; padding: 12px 14px; background: var(--lienzo); }
.dato-nombre { font-size: 13.5px; color: var(--tinta-2); }
.dato-valor { font-weight: 700; font-variant-numeric: tabular-nums; }

.aviso {
  border-left: 3px solid var(--rojo);
  background: var(--rojo-suave);
  border-radius: 0 12px 12px 0;
  padding: 13px 15px;
  font-size: 13.5px;
  margin-top: 12px;
}

/* ---------- Barra inferior ---------- */

.navegacion {
  position: fixed; inset: auto 0 0 0;
  display: grid; grid-template-columns: repeat(5, 1fr);
  background: color-mix(in srgb, var(--lienzo) 88%, transparent);
  backdrop-filter: blur(14px);
  border-top: 1px solid var(--linea);
  padding-bottom: env(safe-area-inset-bottom);
  z-index: 10;
}
.nav-boton {
  position: relative;
  display: flex; flex-direction: column; align-items: center; gap: 3px;
  padding: 10px 4px 9px;
  background: none; border: none; cursor: pointer;
  color: var(--tinta-2); font: inherit;
  -webkit-tap-highlight-color: transparent;
}
.nav-boton[aria-current="page"] { color: var(--azul); }
.nav-icono { font-size: 17px; line-height: 1; }
.nav-texto { font-size: 10.5px; font-weight: 600; letter-spacing: .01em; }
.nav-globo {
  position: absolute; top: 5px; left: 50%; margin-left: 6px;
  min-width: 17px; height: 17px; padding: 0 5px;
  display: grid; place-items: center;
  background: var(--rojo); color: #fff;
  border-radius: 9px; font-size: 10px; font-weight: 800;
}

.pronto { text-align: center; padding: 60px 20px; color: var(--tinta-2); }
```

- [ ] **Step 2: Ver que la tipografía carga**

```bash
cd "c:/Users/es_bi/OneDrive/Desktop/claude/Como venimos"
python -m http.server 8765 --bind 127.0.0.1 &
sleep 2
curl -s -o /dev/null -w "index.html %{http_code}\n" http://127.0.0.1:8765/index.html
curl -s -o /dev/null -w "app.css    %{http_code}\n" http://127.0.0.1:8765/app.css
curl -s -o /dev/null -w "fuente     %{http_code} (%{size_download} bytes)\n" http://127.0.0.1:8765/tipografia/bricolage.woff2
curl -s -o /dev/null -w "negocios   %{http_code}\n" http://127.0.0.1:8765/datos/negocios.json
kill %1
```
Expected: los cuatro dan `200`, y la fuente pesa `22028 bytes`.

- [ ] **Step 3: Commit**

```bash
git add app.css
git commit -m "feat: sistema visual (color con significado, cifras heroe, modo oscuro)"
```

---

## Task 3: `lib/formato.js`

**Files:**
- Create: `lib/formato.js`
- Test: `tests-js/formato.test.mjs`

- [ ] **Step 1: Escribir el test que falla**

Crear `tests-js/formato.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { plata, plataUSD, compacto, pct, fechaCorta, diasEntre, mes, escapar } from "../lib/formato.js";

test("plata: separador de miles con punto, como en Uruguay", () => {
  assert.equal(plata(20079), "20.079");
  assert.equal(plata(1770), "1.770");
  assert.equal(plata(0), "0");
});

test("plata: redondea, no muestra centavos", () => {
  assert.equal(plata(20079.6), "20.080");
});

test("plata: null o undefined da un guion", () => {
  assert.equal(plata(null), "—");
  assert.equal(plata(undefined), "—");
});

test("plataUSD antepone la moneda", () => {
  assert.equal(plataUSD(20079), "USD 20.079");
});

test("compacto: miles con una decimal", () => {
  assert.equal(compacto(20079), "20,1k");
  assert.equal(compacto(1770), "1,8k");
  assert.equal(compacto(940), "940");
  assert.equal(compacto(185932), "186k");
});

test("pct: una decimal y coma", () => {
  assert.equal(pct(0.309), "30,9%");
  assert.equal(pct(0.627), "62,7%");
  assert.equal(pct(1), "100,0%");
});

test("fechaCorta: dia y mes abreviado", () => {
  assert.equal(fechaCorta("2026-08-17"), "17 ago");
  assert.equal(fechaCorta("2026-01-05"), "5 ene");
});

test("fechaCorta: agrega el año si no es el corriente", () => {
  assert.equal(fechaCorta("2023-01-24", 2026), "24 ene 23");
});

test("fechaCorta: sin fecha da un guion", () => {
  assert.equal(fechaCorta(null), "—");
});

test("diasEntre cuenta bien", () => {
  assert.equal(diasEntre("2026-08-01", "2026-08-17"), 16);
  assert.equal(diasEntre("2026-08-17", "2026-08-17"), 0);
});

test("mes devuelve el numero de mes", () => {
  assert.equal(mes("2026-08-17"), 8);
});

test("escapar deja el HTML inofensivo", () => {
  assert.equal(escapar('<b>Calle & "Co"</b>'), "&lt;b&gt;Calle &amp; &quot;Co&quot;&lt;/b&gt;");
  assert.equal(escapar(null), "");
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `node --test tests-js/formato.test.mjs 2>&1 | tail -5`
Expected: FAIL — `Cannot find module .../lib/formato.js`

- [ ] **Step 3: Escribir la implementación**

Crear `lib/formato.js`:

```js
/* Formateo para lectura rapida en un celular, con las convenciones de Uruguay:
   punto para los miles, coma para los decimales. */

const MESES = ["ene", "feb", "mar", "abr", "may", "jun",
               "jul", "ago", "sep", "oct", "nov", "dic"];

const hayValor = (n) => n !== null && n !== undefined && !Number.isNaN(n);

export function plata(n) {
  if (!hayValor(n)) return "—";
  return Math.round(n).toLocaleString("es-UY");
}

export function plataUSD(n) {
  if (!hayValor(n)) return "—";
  return `USD ${plata(n)}`;
}

/* Para las graficas, donde no entra el numero completo. */
export function compacto(n) {
  if (!hayValor(n)) return "—";
  const abs = Math.abs(n);
  if (abs < 1000) return String(Math.round(n));
  const miles = n / 1000;
  // Arriba de 100k la decimal no aporta y ocupa lugar.
  const texto = abs >= 100000 ? String(Math.round(miles)) : miles.toFixed(1);
  return `${texto.replace(".", ",")}k`;
}

export function pct(n) {
  if (!hayValor(n)) return "—";
  return `${(n * 100).toFixed(1).replace(".", ",")}%`;
}

export function fechaCorta(iso, anioActual) {
  if (!iso) return "—";
  const [a, m, d] = iso.split("-").map(Number);
  const base = `${d} ${MESES[m - 1]}`;
  // El año solo se muestra cuando no es obvio, para no repetirlo en toda la lista.
  return anioActual && a !== anioActual ? `${base} ${String(a).slice(2)}` : base;
}

export function diasEntre(desde, hasta) {
  const a = Date.parse(`${desde}T00:00:00Z`);
  const b = Date.parse(`${hasta}T00:00:00Z`);
  return Math.round((b - a) / 86400000);
}

export function mes(iso) {
  return Number(iso.split("-")[1]);
}

/* Las direcciones y barrios salen del Excel del usuario. Nada garantiza que no traigan
   un "<" o un "&", asi que se escapan antes de meterlos en el HTML. */
export function escapar(texto) {
  return String(texto ?? "").replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])
  );
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `node --test tests-js/formato.test.mjs 2>&1 | tail -5`
Expected: `pass 12`, `fail 0`

- [ ] **Step 5: Commit**

```bash
git add lib/formato.js tests-js/formato.test.mjs
git commit -m "feat: formateo de plata, fechas y porcentajes"
```

---

## Task 4: `lib/salud.js` — los ratios y las tres capas

**Files:**
- Create: `lib/salud.js`
- Test: `tests-js/salud.test.mjs`

- [ ] **Step 1: Escribir el test que falla**

Crear `tests-js/salud.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { ratios, capas } from "../lib/salud.js";

const AJUSTES = {
  probabilidades_cierre: { reservada: 0.9, en_negociacion: 0.6, publicada: 0.25 },
  objetivo_personal: { "2026": 65000 },
};

function negocio(x = {}) {
  return {
    id: "n1", tipo_negocio: "venta", estado: "cerrado",
    fecha_fin: "2026-03-01", precio_operacion: 100000,
    facturacion: 3000, ganancia: 1350, entity_id_cartera: null,
    direccion: "Calle 100", ...x,
  };
}

function propiedad(x = {}) {
  return {
    entity_id: "p1", direccion: "Calle 200", precio: 100000,
    estado: "publicada", activa: true, usar_en_proyeccion: true, ...x,
  };
}

test("ratios: usa la mediana, no el promedio", () => {
  // Con un dato roto, el promedio se dispara y la mediana aguanta.
  const lista = [
    negocio({ precio_operacion: 100000, facturacion: 4500, ganancia: 2000 }),
    negocio({ precio_operacion: 100000, facturacion: 4500, ganancia: 2000 }),
    negocio({ precio_operacion: 100, facturacion: 900000, ganancia: 900000 }),
  ];
  const r = ratios(lista);
  assert.equal(r.venta.fact, 0.045);
});

test("ratios: separa venta de alquiler", () => {
  const lista = [
    negocio({ tipo_negocio: "venta", precio_operacion: 100000, facturacion: 4500, ganancia: 1800 }),
    negocio({ tipo_negocio: "alquiler", precio_operacion: 400, facturacion: 800, ganancia: 280 }),
  ];
  const r = ratios(lista);
  assert.equal(r.venta.fact, 0.045);
  assert.equal(r.alquiler.fact, 2);
});

test("ratios: sin datos devuelve cero y no revienta", () => {
  const r = ratios([]);
  assert.equal(r.venta.fact, 0);
  assert.equal(r.alquiler.gan, 0);
});

test("capa 1: solo lo cerrado del año", () => {
  const lista = [
    negocio({ estado: "cerrado", facturacion: 3000, ganancia: 1350 }),
    negocio({ estado: "en_curso", facturacion: 5000, ganancia: 2000 }),
    negocio({ estado: "cerrado", fecha_fin: "2025-03-01", facturacion: 9000, ganancia: 4000 }),
  ];
  const c = capas(lista, {}, AJUSTES, "2026");
  assert.equal(c.capa1.facturacion, 3000);
  assert.equal(c.capa1.negocios, 1);
});

test("capa 2: los en curso van con su cifra real, sin probabilidad", () => {
  const lista = [negocio({ estado: "en_curso", facturacion: 5394, ganancia: 2427 })];
  const c = capas(lista, {}, AJUSTES, "2026");
  assert.equal(c.capa2.facturacion, 5394);
  assert.equal(c.capa2.ganancia, 2427);
});

test("capa 3: proyecta por ratio y probabilidad del estado", () => {
  const lista = [negocio({ precio_operacion: 100000, facturacion: 4500, ganancia: 1800 })];
  const cartera = { p1: propiedad({ precio: 200000, estado: "publicada" }) };
  const c = capas(lista, cartera, AJUSTES, "2026");
  // 200.000 x 4,5% x 25% = 2.250
  assert.equal(Math.round(c.capa3.facturacion), 2250);
});

test("capa 3: la reservada pesa mucho mas que la publicada", () => {
  const lista = [negocio({ precio_operacion: 100000, facturacion: 4500, ganancia: 1800 })];
  const publicada = capas(lista, { p1: propiedad({ estado: "publicada" }) }, AJUSTES, "2026");
  const reservada = capas(lista, { p1: propiedad({ estado: "reservada" }) }, AJUSTES, "2026");
  assert.ok(reservada.capa3.facturacion > publicada.capa3.facturacion * 3);
});

test("capa 3: ignora las propiedades dadas de baja", () => {
  const lista = [negocio()];
  const c = capas(lista, { p1: propiedad({ activa: false }) }, AJUSTES, "2026");
  assert.equal(c.capa3.propiedades, 0);
});

test("capa 3: ignora las excluidas por el usuario (duplicados)", () => {
  const lista = [negocio()];
  const c = capas(lista, { p1: propiedad({ usar_en_proyeccion: false }) }, AJUSTES, "2026");
  assert.equal(c.capa3.propiedades, 0);
});

test("anti-doble-conteo: si la propiedad ya esta en capa 2, no va en capa 3", () => {
  const lista = [
    negocio({ precio_operacion: 100000, facturacion: 4500, ganancia: 1800 }),
    negocio({ id: "n2", estado: "en_curso", facturacion: 5394, ganancia: 2427, entity_id_cartera: "p1" }),
  ];
  const cartera = { p1: propiedad({ entity_id: "p1", estado: "reservada" }) };
  const c = capas(lista, cartera, AJUSTES, "2026");
  assert.equal(c.capa3.propiedades, 0);
  assert.equal(c.capa2.facturacion, 5394);
});

test("el detalle de capa 3 dice que propiedades entraron", () => {
  const lista = [negocio({ precio_operacion: 100000, facturacion: 4500, ganancia: 1800 })];
  const cartera = { p1: propiedad({ direccion: "Gutenberg 6100", precio: 490000 }) };
  const c = capas(lista, cartera, AJUSTES, "2026");
  assert.equal(c.capa3.detalle.length, 1);
  assert.equal(c.capa3.detalle[0].direccion, "Gutenberg 6100");
  assert.equal(c.capa3.detalle[0].probabilidad, 0.25);
});

test("el total suma las tres capas", () => {
  const lista = [
    negocio({ facturacion: 3000, ganancia: 1350 }),
    negocio({ id: "n2", estado: "en_curso", facturacion: 5000, ganancia: 2000 }),
  ];
  const c = capas(lista, {}, AJUSTES, "2026");
  assert.equal(c.total.facturacion, 8000);
  assert.equal(c.total.ganancia, 3350);
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `node --test tests-js/salud.test.mjs 2>&1 | tail -5`
Expected: FAIL — `Cannot find module .../lib/salud.js`

- [ ] **Step 3: Escribir la implementación**

Crear `lib/salud.js`:

```js
/* Los calculos del tablero. Funciones puras: entran datos, salen numeros.

   Se usa MEDIANA y no promedio en los ratios: con los datos reales, un par de filas
   con errores de tipeo llevaban el promedio de ganancia sobre precio a 649%, cuando la
   mediana da 1,8%. La mediana es inmune a esos casos. */

export function mediana(numeros) {
  const orden = [...numeros].sort((a, b) => a - b);
  if (!orden.length) return 0;
  const medio = Math.floor(orden.length / 2);
  return orden.length % 2 ? orden[medio] : (orden[medio - 1] + orden[medio]) / 2;
}

export function ratios(negocios) {
  const porTipo = (tipo) => {
    const base = negocios.filter(
      (n) => n.tipo_negocio === tipo && n.precio_operacion && n.facturacion
    );
    if (!base.length) return { fact: 0, gan: 0 };
    return {
      fact: mediana(base.map((n) => n.facturacion / n.precio_operacion)),
      gan: mediana(base.map((n) => (n.ganancia || 0) / n.precio_operacion)),
    };
  };
  return { venta: porTipo("venta"), alquiler: porTipo("alquiler") };
}

const sumar = (lista, campo) => lista.reduce((t, n) => t + (n[campo] || 0), 0);

export function capas(negocios, cartera, ajustes, anio) {
  const delAnio = negocios.filter((n) => n.fecha_fin && n.fecha_fin.slice(0, 4) === anio);
  const cerrados = delAnio.filter((n) => n.estado === "cerrado");
  const enCurso = delAnio.filter((n) => n.estado === "en_curso");

  const r = ratios(negocios);
  const probabilidades = ajustes.probabilidades_cierre || {};

  // Una propiedad con un negocio en curso ya esta contada en la capa 2. Sumarla otra vez
  // en la capa 3 duplicaria la plata.
  const yaContadas = new Set(enCurso.map((n) => n.entity_id_cartera).filter(Boolean));

  const detalle = [];
  let facturacion3 = 0;
  let ganancia3 = 0;
  for (const propiedad of Object.values(cartera || {})) {
    if (!propiedad.activa || !propiedad.usar_en_proyeccion) continue;
    if (yaContadas.has(propiedad.entity_id)) continue;
    const probabilidad = probabilidades[propiedad.estado] || 0;
    const ratio = propiedad.operacion === "alquiler" ? r.alquiler : r.venta;
    const f = propiedad.precio * ratio.fact * probabilidad;
    const g = propiedad.precio * ratio.gan * probabilidad;
    facturacion3 += f;
    ganancia3 += g;
    detalle.push({
      entity_id: propiedad.entity_id,
      direccion: propiedad.direccion,
      estado: propiedad.estado,
      precio: propiedad.precio,
      probabilidad,
      facturacion: f,
      ganancia: g,
    });
  }
  detalle.sort((a, b) => b.facturacion - a.facturacion);

  const capa1 = {
    negocios: cerrados.length,
    facturacion: sumar(cerrados, "facturacion"),
    ganancia: sumar(cerrados, "ganancia"),
  };
  const capa2 = {
    negocios: enCurso.length,
    facturacion: sumar(enCurso, "facturacion"),
    ganancia: sumar(enCurso, "ganancia"),
    detalle: enCurso,
  };
  const capa3 = {
    propiedades: detalle.length,
    facturacion: facturacion3,
    ganancia: ganancia3,
    detalle,
  };

  return {
    capa1,
    capa2,
    capa3,
    ratios: r,
    total: {
      facturacion: capa1.facturacion + capa2.facturacion + capa3.facturacion,
      ganancia: capa1.ganancia + capa2.ganancia + capa3.ganancia,
    },
  };
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `node --test tests-js/salud.test.mjs 2>&1 | tail -5`
Expected: `pass 12`, `fail 0`

- [ ] **Step 5: Commit**

```bash
git add lib/salud.js tests-js/salud.test.mjs
git commit -m "feat: ratios por mediana y las tres capas de plata"
```

---

## Task 5: `lib/salud.js` — el ritmo contra el calendario

**Files:**
- Modify: `lib/salud.js`
- Modify: `tests-js/salud.test.mjs`

- [ ] **Step 1: Escribir el test que falla**

Agregar `ritmo` a la lista de imports de arriba (`import { ratios, capas, ritmo } from "../lib/salud.js";`)
y estos tests al final de `tests-js/salud.test.mjs`:

```js

test("ritmo: a mitad de año con la mitad del objetivo va a ritmo", () => {
  const r = ritmo(32500, 65000, "2026", "2026-07-02");
  assert.equal(r.aRitmo, true);
});

test("ritmo: el caso real del usuario, va atrasado", () => {
  // 20.079 cobrados al 17 de agosto contra un objetivo de 65.000.
  const r = ritmo(20079, 65000, "2026", "2026-08-17");
  assert.equal(r.aRitmo, false);
  assert.ok(Math.abs(r.avance - 0.3089) < 0.001);
  assert.ok(Math.abs(r.calendario - 0.6274) < 0.001);
});

test("ritmo: proyecta a fin de año al mismo paso", () => {
  const r = ritmo(20079, 65000, "2026", "2026-08-17");
  assert.equal(Math.round(r.proyeccion), 32004);
});

test("ritmo: dice cuanto falta y cuanto por mes", () => {
  const r = ritmo(20079, 65000, "2026", "2026-08-17");
  assert.equal(r.falta, 44921);
  // Quedan 136 dias, o sea 4,47 meses.
  assert.ok(r.porMes > 9000 && r.porMes < 11000);
});

test("ritmo: si ya se paso el objetivo, no falta nada", () => {
  const r = ritmo(70000, 65000, "2026", "2026-08-17");
  assert.equal(r.falta, 0);
  assert.equal(r.aRitmo, true);
});

test("ritmo: sin objetivo devuelve null", () => {
  assert.equal(ritmo(20079, 0, "2026", "2026-08-17"), null);
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `node --test tests-js/salud.test.mjs 2>&1 | tail -5`
Expected: FAIL — `ritmo is not a function` o similar

- [ ] **Step 3: Escribir la implementación**

Agregar al final de `lib/salud.js`:

```js
const DIAS_DEL_ANIO = 365;

/* La metrica mas util del tablero: responde "voy bien o voy mal" en un solo numero.

   Usa SOLO la capa 1 (lo cobrado). Ese era justamente el error del Excel: mezclaba plata
   cobrada con plata esperada y mostraba un avance que no existia. */
export function ritmo(cobrado, objetivo, anio, hoy) {
  if (!objetivo) return null;

  const inicio = Date.parse(`${anio}-01-01T00:00:00Z`);
  const ahora = Date.parse(`${hoy}T00:00:00Z`);
  const dia = Math.round((ahora - inicio) / 86400000) + 1;
  const calendario = dia / DIAS_DEL_ANIO;

  const avance = cobrado / objetivo;
  const falta = Math.max(0, objetivo - cobrado);
  const mesesQueQuedan = Math.max(0.1, (DIAS_DEL_ANIO - dia) / 30.4);

  return {
    dia,
    calendario,
    avance,
    aRitmo: avance >= calendario,
    proyeccion: calendario > 0 ? cobrado / calendario : 0,
    falta,
    porMes: falta / mesesQueQuedan,
  };
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `node --test tests-js/salud.test.mjs 2>&1 | tail -5`
Expected: `pass 18`, `fail 0`

- [ ] **Step 5: Commit**

```bash
git add lib/salud.js tests-js/salud.test.mjs
git commit -m "feat: ritmo contra calendario"
```

---

## Task 6: `lib/salud.js` — métricas del año y comparativa de categorías

**Files:**
- Modify: `lib/salud.js`
- Modify: `tests-js/salud.test.mjs`

- [ ] **Step 1: Escribir el test que falla**

Ampliar el import de arriba a `import { ratios, capas, ritmo, porAnio, metricas, comparativaCategorias } from "../lib/salud.js";`
y agregar estos tests al final:

```js

const AJUSTES_CAT = {
  categorias: [{ categoria: "RAP", split_pct: 0.45, fee_mensual_usd: 70, desde: "2026-01-01", hasta: null }],
  escalones: [
    { categoria: "RAP", split_pct: 0.45, fee_mensual_usd: 70 },
    { categoria: "ALTO", split_pct: 0.60, fee_mensual_usd: 425 },
    { categoria: "PURO", split_pct: 0.80, fee_mensual_usd: 975 },
  ],
};

test("porAnio agrupa y suma solo lo cerrado", () => {
  const lista = [
    negocio({ fecha_fin: "2025-03-01", facturacion: 1000, ganancia: 450 }),
    negocio({ fecha_fin: "2026-03-01", facturacion: 3000, ganancia: 1350 }),
    negocio({ fecha_fin: "2026-05-01", facturacion: 2000, ganancia: 900 }),
    negocio({ fecha_fin: "2026-06-01", estado: "en_curso", facturacion: 9999, ganancia: 9999 }),
  ];
  const filas = porAnio(lista);
  assert.equal(filas.length, 2);
  assert.deepEqual(filas[1], { anio: "2026", negocios: 2, facturacion: 5000, ganancia: 2250 });
});

test("metricas: ticket mediano y puntas promedio", () => {
  const lista = [
    negocio({ precio_operacion: 60000, puntas: 2 }),
    negocio({ precio_operacion: 100000, puntas: 1 }),
    negocio({ precio_operacion: 140000, puntas: 2 }),
  ];
  const m = metricas(lista, "2026");
  assert.equal(m.ticketVenta, 100000);
  assert.ok(Math.abs(m.puntasPromedio - 1.667) < 0.01);
});

test("metricas: plazo mediano de inicio a firma", () => {
  const lista = [
    negocio({ fecha_inicio: "2026-01-01", fecha_fin: "2026-03-02" }),   // 60 dias
    negocio({ fecha_inicio: "2026-01-01", fecha_fin: "2026-05-01" }),   // 120 dias
    negocio({ fecha_inicio: "2026-01-01", fecha_fin: "2026-04-01" }),   // 90 dias
  ];
  assert.equal(metricas(lista, "2026").plazoVenta, 90);
});

test("metricas: cuenta los negocios por tipo", () => {
  const lista = [
    negocio({ tipo_negocio: "venta" }),
    negocio({ tipo_negocio: "alquiler" }),
    negocio({ tipo_negocio: "alquiler" }),
  ];
  const m = metricas(lista, "2026");
  assert.equal(m.ventas, 1);
  assert.equal(m.alquileres, 2);
});

test("metricas: ranking de barrios por ganancia", () => {
  const lista = [
    negocio({ barrio: "Cerrito", ganancia: 500 }),
    negocio({ barrio: "Centro", ganancia: 2000 }),
    negocio({ barrio: "Cerrito", ganancia: 800 }),
  ];
  const m = metricas(lista, "2026");
  assert.equal(m.barrios[0].nombre, "Centro");
  assert.equal(m.barrios[1].ganancia, 1300);
});

test("metricas: ranking de origen de captacion", () => {
  const lista = [
    negocio({ origen_captacion: "BDR", ganancia: 500 }),
    negocio({ origen_captacion: "Referido - Martín", ganancia: 2000 }),
  ];
  const m = metricas(lista, "2026");
  assert.equal(m.origenes[0].nombre, "Referido - Martín");
  assert.ok(Math.abs(m.origenes[0].porcentaje - 0.8) < 0.001);
});

test("comparativa: dice cuanto se pierde por no ser ALTO", () => {
  // Facturacion alta: conviene ALTO pese al fee mas caro.
  const lista = [negocio({ facturacion: 60000, ganancia: 27000, regimen_comision: "captacion_mia", base: 60000 })];
  const c = comparativaCategorias(lista, AJUSTES_CAT, "2026", "2026-12-31");
  const alto = c.find((x) => x.categoria === "ALTO");
  assert.ok(alto.diferencia > 0, "con 60.000 facturados, ALTO tendria que convenir");
});

test("comparativa: con facturacion baja conviene seguir en RAP", () => {
  const lista = [negocio({ facturacion: 5000, ganancia: 2250, regimen_comision: "captacion_mia", base: 5000 })];
  const c = comparativaCategorias(lista, AJUSTES_CAT, "2026", "2026-12-31");
  const alto = c.find((x) => x.categoria === "ALTO");
  assert.ok(alto.diferencia < 0, "con 5.000 facturados, ALTO tendria que perder");
});

test("comparativa: la categoria actual queda marcada y con diferencia cero", () => {
  const lista = [negocio({ facturacion: 20000, ganancia: 9000, regimen_comision: "captacion_mia", base: 20000 })];
  const c = comparativaCategorias(lista, AJUSTES_CAT, "2026", "2026-08-17");
  const rap = c.find((x) => x.categoria === "RAP");
  assert.equal(rap.actual, true);
  assert.equal(rap.diferencia, 0);
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `node --test tests-js/salud.test.mjs 2>&1 | tail -5`
Expected: FAIL — `porAnio is not a function`

- [ ] **Step 3: Escribir la implementación**

Agregar al final de `lib/salud.js`:

```js
export function porAnio(negocios) {
  const mapa = new Map();
  for (const n of negocios) {
    if (!n.fecha_fin || n.estado !== "cerrado") continue;
    const anio = n.fecha_fin.slice(0, 4);
    const fila = mapa.get(anio) || { anio, negocios: 0, facturacion: 0, ganancia: 0 };
    fila.negocios += 1;
    fila.facturacion += n.facturacion || 0;
    fila.ganancia += n.ganancia || 0;
    mapa.set(anio, fila);
  }
  return [...mapa.values()].sort((a, b) => a.anio.localeCompare(b.anio));
}

const dias = (desde, hasta) =>
  Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86400000);

function ranking(lista, campo) {
  const mapa = new Map();
  let total = 0;
  for (const n of lista) {
    const nombre = n[campo] || "Sin dato";
    const acumulado = (mapa.get(nombre) || 0) + (n.ganancia || 0);
    mapa.set(nombre, acumulado);
    total += n.ganancia || 0;
  }
  return [...mapa.entries()]
    .map(([nombre, ganancia]) => ({ nombre, ganancia, porcentaje: total ? ganancia / total : 0 }))
    .sort((a, b) => b.ganancia - a.ganancia);
}

export function metricas(negocios, anio) {
  const delAnio = negocios.filter(
    (n) => n.fecha_fin && n.fecha_fin.slice(0, 4) === anio && n.estado === "cerrado"
  );
  const ventas = delAnio.filter((n) => n.tipo_negocio === "venta");
  const alquileres = delAnio.filter((n) => n.tipo_negocio !== "venta");

  const plazos = (lista) =>
    mediana(
      lista.filter((n) => n.fecha_inicio && n.fecha_fin).map((n) => dias(n.fecha_inicio, n.fecha_fin))
    );

  return {
    total: delAnio.length,
    ventas: ventas.length,
    alquileres: alquileres.length,
    ticketVenta: mediana(ventas.map((n) => n.precio_operacion).filter(Boolean)),
    ticketAlquiler: mediana(alquileres.map((n) => n.precio_operacion).filter(Boolean)),
    puntasPromedio: delAnio.length
      ? delAnio.reduce((t, n) => t + (n.puntas || 0), 0) / delAnio.length
      : 0,
    plazoVenta: plazos(ventas),
    plazoAlquiler: plazos(alquileres),
    barrios: ranking(delAnio, "barrio"),
    origenes: ranking(delAnio, "origen_captacion"),
  };
}

/* Cuanto se gana o se pierde por estar en una categoria y no en otra.

   Se recalcula negocio por negocio y NO sobre el total, porque cada regimen de comision
   reacciona distinto al cambio de tajada: el arreglo con Martin, por ejemplo, es fijo y
   no se mueve; las suplencias tampoco. */
export function comparativaCategorias(negocios, ajustes, anio, hoy) {
  const escalones = ajustes.escalones || [];
  const vigente = (ajustes.categorias || []).find((c) => c.hasta === null);
  const cerrados = negocios.filter(
    (n) => n.fecha_fin && n.fecha_fin.slice(0, 4) === anio && n.estado === "cerrado"
  );
  const mesesCorridos = Math.max(1, Number(hoy.slice(5, 7)));

  const gananciaCon = (split) =>
    cerrados.reduce((total, n) => {
      const base = n.base || 0;
      switch (n.regimen_comision) {
        case "ref_martin":
          return total + base * (ajustes.regla_martin?.ganancia ?? 0.35);
        case "suplencia":
          return total + base * (ajustes.pct_suplencia ?? 0.125);
        case "ref_otro_colega":
          return total + split * (ajustes.pct_referido_entrante_otro ?? 0.75) * base;
        case "yo_referi":
          return total + split * (ajustes.pct_referido_saliente ?? 0.25) * base;
        default:
          return total + split * base;
      }
    }, 0);

  const filas = escalones.map((e) => {
    const bruto = gananciaCon(e.split_pct);
    return {
      categoria: e.categoria,
      split: e.split_pct,
      fee: e.fee_mensual_usd * mesesCorridos,
      neto: bruto - e.fee_mensual_usd * mesesCorridos,
      actual: vigente ? e.categoria === vigente.categoria : false,
    };
  });

  const actual = filas.find((f) => f.actual);
  const referencia = actual ? actual.neto : 0;
  for (const fila of filas) fila.diferencia = Math.round(fila.neto - referencia);
  return filas;
}
```

- [ ] **Step 4: Agregar los escalones a los ajustes**

Modificar `datos/ajustes.json`: agregar esta clave después de `"categorias"`:

```json
 "escalones": [
  {"categoria": "RAP", "split_pct": 0.45, "fee_mensual_usd": 70},
  {"categoria": "ALTO", "split_pct": 0.6, "fee_mensual_usd": 425},
  {"categoria": "PURO", "split_pct": 0.8, "fee_mensual_usd": 975}
 ],
```

- [ ] **Step 5: Correr los tests**

Run: `node --test tests-js/salud.test.mjs 2>&1 | tail -5`
Expected: `pass 27`, `fail 0`

Run: `python -m unittest tests.test_ajustes -v 2>&1 | tail -3`
Expected: `OK` — los ajustes siguen siendo válidos

- [ ] **Step 6: Commit**

```bash
git add lib/salud.js tests-js/salud.test.mjs datos/ajustes.json
git commit -m "feat: metricas del año y comparativa RAP/ALTO/PURO"
```

---

## Task 7: `lib/pendientes.js`

**Files:**
- Create: `lib/pendientes.js`
- Test: `tests-js/pendientes.test.mjs`

- [ ] **Step 1: Escribir el test que falla**

Crear `tests-js/pendientes.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { derivar, GRUPOS } from "../lib/pendientes.js";

function negocio(avisos, x = {}) {
  return {
    id: "excel-1", direccion: "Calle 100", barrio: "Cerrito",
    fecha_fin: "2026-04-20", tipo_negocio: "venta",
    avisos: avisos.map((tipo) => ({ tipo, detalle: `detalle de ${tipo}` })),
    ...x,
  };
}

test("agrupa los avisos por tipo", () => {
  const grupos = derivar([negocio(["falta_fecha_inicio"]), negocio(["falta_fecha_inicio"])], [], "2026-08-17");
  const grupo = grupos.find((g) => g.clave === "falta_fecha_inicio");
  assert.equal(grupo.items.length, 2);
});

test("cada grupo tiene un nombre en castellano", () => {
  const grupos = derivar([negocio(["firma_inventada"])], [], "2026-08-17");
  assert.equal(grupos[0].nombre, GRUPOS.firma_inventada.nombre);
  assert.ok(grupos[0].nombre.length > 5);
});

test("lo urgente va primero", () => {
  const lista = [negocio(["falta_barrio"]), negocio(["firma_inventada"])];
  const grupos = derivar(lista, [], "2026-08-17");
  assert.equal(grupos[0].clave, "firma_inventada");
});

test("los grupos urgentes quedan marcados", () => {
  const grupos = derivar([negocio(["firma_inventada"]), negocio(["falta_barrio"])], [], "2026-08-17");
  assert.equal(grupos.find((g) => g.clave === "firma_inventada").urgente, true);
  assert.equal(grupos.find((g) => g.clave === "falta_barrio").urgente, false);
});

test("cada item sabe a que negocio pertenece y como mostrarlo", () => {
  const grupos = derivar([negocio(["falta_barrio"], { id: "excel-84", direccion: "Grecia 3491" })], [], "2026-08-17");
  const item = grupos[0].items[0];
  assert.equal(item.negocio_id, "excel-84");
  assert.ok(item.titulo.includes("Grecia 3491"));
  assert.ok(item.detalle.length > 0);
});

test("un negocio sin direccion se muestra igual", () => {
  const grupos = derivar([negocio(["falta_direccion"], { direccion: null })], [], "2026-08-17");
  assert.ok(grupos[0].items[0].titulo.length > 0);
});

test("los eventos de la cartera sin atender tambien entran", () => {
  const eventos = [
    { id: "e1", tipo: "baja", titulo: "Casa linda", direccion: "Calle 1", fecha: "2026-08-17",
      atendido: false, detalle: { desenlace_propuesto: "vendida" } },
  ];
  const grupos = derivar([], eventos, "2026-08-17");
  assert.equal(grupos.find((g) => g.clave === "baja").items.length, 1);
});

test("los eventos ya atendidos no aparecen", () => {
  const eventos = [{ id: "e1", tipo: "baja", titulo: "X", fecha: "2026-08-17", atendido: true, detalle: {} }];
  assert.equal(derivar([], eventos, "2026-08-17").length, 0);
});

test("una baja de propiedad reservada es urgente: puede ser una venta", () => {
  const eventos = [
    { id: "e1", tipo: "baja", titulo: "X", fecha: "2026-08-17", atendido: false,
      detalle: { desenlace_propuesto: "vendida" } },
  ];
  assert.equal(derivar([], eventos, "2026-08-17")[0].urgente, true);
});

test("los cambios de precio no son urgentes, son informativos", () => {
  const eventos = [
    { id: "e1", tipo: "cambio_precio", titulo: "X", fecha: "2026-08-17", atendido: false,
      detalle: { antes: 100, ahora: 90, moneda: "USD" } },
  ];
  assert.equal(derivar([], eventos, "2026-08-17")[0].urgente, false);
});

test("sin nada pendiente devuelve lista vacia", () => {
  assert.deepEqual(derivar([negocio([])], [], "2026-08-17"), []);
});

test("una ficha dada por completa no aporta pendientes", () => {
  const lista = [negocio(["falta_fecha_inicio"], { ficha_completa: true })];
  assert.deepEqual(derivar(lista, [], "2026-08-17"), []);
});

test("cuenta el total de pendientes", () => {
  const grupos = derivar([negocio(["falta_barrio", "falta_direccion"])], [], "2026-08-17");
  const total = grupos.reduce((t, g) => t + g.items.length, 0);
  assert.equal(total, 2);
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `node --test tests-js/pendientes.test.mjs 2>&1 | tail -5`
Expected: FAIL — `Cannot find module .../lib/pendientes.js`

- [ ] **Step 3: Escribir la implementación**

Crear `lib/pendientes.js`:

```js
/* Convierte los avisos de los negocios y los eventos del robot en una bandeja ordenada.

   El orden importa: lo primero que se ve al abrir la app tiene que ser lo que puede
   significar plata (un cierre detectado), no lo que es puro trabajo administrativo. */

export const GRUPOS = {
  baja: { nombre: "Propiedades que se fueron de tu cartera", orden: 1, urgente: true },
  firma_inventada: { nombre: "Dados por cobrados, pero la propiedad sigue viva", orden: 2, urgente: true },
  firma_futura: { nombre: "Con fecha de firma en el futuro", orden: 3, urgente: true },
  recalculo_distinto: { nombre: "La cuenta nueva no coincide con tu Excel", orden: 4, urgente: true },
  comision_absurda: { nombre: "Porcentaje de comisión imposible", orden: 5, urgente: true },
  separador_decimal: { nombre: "Coma decimal perdida en el Excel", orden: 6, urgente: true },
  aritmetica_no_cierra: { nombre: "La cuenta no cierra: ¿descuento o error?", orden: 7, urgente: false },
  fechas_al_reves: { nombre: "Fechas dadas vuelta", orden: 8, urgente: false },
  posible_cruce: { nombre: "Puede ser una propiedad de tu cartera", orden: 9, urgente: false },
  alta: { nombre: "Propiedades nuevas sin origen", orden: 10, urgente: false },
  carga_inicial: { nombre: "Propiedades que hay que completar", orden: 11, urgente: false },
  posible_duplicado: { nombre: "¿Publicaste la misma propiedad dos veces?", orden: 12, urgente: false },
  origen_sin_clasificar: { nombre: "Sin clasificar de dónde salió", orden: 13, urgente: false },
  faltan_agentes: { nombre: "Sin agente vendedor ni comprador", orden: 14, urgente: false },
  falta_fecha_fin: { nombre: "Sin fecha de firma", orden: 15, urgente: false },
  sin_fecha_fin: { nombre: "Sin fecha de firma", orden: 15, urgente: false },
  falta_fecha_boleto: { nombre: "Sin fecha de boleto", orden: 16, urgente: false },
  falta_fecha_inicio: { nombre: "Sin fecha de inicio", orden: 17, urgente: false },
  falta_direccion: { nombre: "Sin dirección", orden: 18, urgente: false },
  falta_barrio: { nombre: "Sin barrio", orden: 19, urgente: false },
  cambio_precio: { nombre: "Cambios de precio", orden: 20, urgente: false },
  cambio_estado: { nombre: "Cambios de estado", orden: 21, urgente: false },
  reaparecio: { nombre: "Volvieron a aparecer", orden: 22, urgente: false },
};

const OTRO = { nombre: "Otros", orden: 99, urgente: false };

function comoSeLlama(negocio) {
  return negocio.direccion || negocio.barrio || `Negocio ${negocio.id}`;
}

export function derivar(negocios, eventos, hoy) {
  const mapa = new Map();

  const agregar = (clave, item) => {
    const config = GRUPOS[clave] || OTRO;
    if (!mapa.has(clave)) {
      mapa.set(clave, {
        clave,
        nombre: config.nombre,
        orden: config.orden,
        urgente: config.urgente,
        items: [],
      });
    }
    mapa.get(clave).items.push(item);
  };

  for (const negocio of negocios) {
    // "Ficha completa" es la forma que tiene el usuario de decir "ya se, no me avises mas".
    if (negocio.ficha_completa) continue;
    for (const aviso of negocio.avisos || []) {
      agregar(aviso.tipo, {
        negocio_id: negocio.id,
        titulo: comoSeLlama(negocio),
        detalle: aviso.detalle,
        fecha: negocio.fecha_fin,
      });
    }
  }

  for (const evento of eventos || []) {
    if (evento.atendido) continue;
    agregar(evento.tipo, {
      evento_id: evento.id,
      entity_id: evento.entity_id,
      titulo: evento.direccion || evento.titulo || "Propiedad",
      detalle: describirEvento(evento),
      fecha: evento.fecha,
    });
  }

  return [...mapa.values()].sort((a, b) => a.orden - b.orden);
}

function describirEvento(evento) {
  const d = evento.detalle || {};
  switch (evento.tipo) {
    case "baja":
      return d.desenlace_propuesto === "vendida"
        ? "Estaba reservada y desapareció. Lo más probable es que se haya vendido."
        : "Desapareció de RE/MAX. ¿Se cayó o se vendió igual?";
    case "cambio_precio":
      return `${Math.round(d.antes).toLocaleString("es-UY")} → ${Math.round(d.ahora).toLocaleString("es-UY")} ${d.moneda || ""}`.trim();
    case "cambio_estado":
      return `Pasó de ${(d.antes || "").replace("_", " ")} a ${(d.ahora || "").replace("_", " ")}`;
    case "posible_duplicado":
      return "Misma dirección y mismo precio que otra. ¿Es la misma publicada dos veces?";
    case "carga_inicial":
    case "alta":
      return "Falta cargar de dónde salió la captación.";
    default:
      return evento.titulo || "";
  }
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `node --test tests-js/pendientes.test.mjs 2>&1 | tail -5`
Expected: `pass 13`, `fail 0`

- [ ] **Step 5: Commit**

```bash
git add lib/pendientes.js tests-js/pendientes.test.mjs
git commit -m "feat: derivar y ordenar la bandeja de pendientes"
```

---

## Task 8: `app.js` — cargar los datos y navegar

**Files:**
- Create: `app.js`

- [ ] **Step 1: Escribir el arranque**

Crear `app.js`:

```js
/* Arranque: baja los datos, arma la navegacion y dibuja la vista activa. */

import { derivar } from "./lib/pendientes.js";
import { dibujarSalud } from "./vistas/salud.js";
import { dibujarHoy } from "./vistas/hoy.js";

const ARCHIVOS = ["cartera", "negocios", "ajustes", "eventos", "estado_robot"];

const estado = {
  datos: {},
  hoy: new Date().toISOString().slice(0, 10),
  vista: "hoy",
};

async function bajarDatos() {
  const pares = await Promise.all(
    ARCHIVOS.map(async (nombre) => {
      try {
        const respuesta = await fetch(`datos/${nombre}.json`, { cache: "no-cache" });
        if (!respuesta.ok) throw new Error(respuesta.status);
        return [nombre, await respuesta.json()];
      } catch {
        // Si falta un archivo la app tiene que abrir igual, no quedarse en blanco.
        return [nombre, nombre === "cartera" || nombre === "ajustes" ? {} : []];
      }
    })
  );
  return Object.fromEntries(pares);
}

function dibujarBarraEstado() {
  const barra = document.getElementById("barra-estado");
  const robot = estado.datos.estado_robot;
  if (!robot || !robot.ultima_corrida) {
    barra.hidden = true;
    return;
  }
  const dias = Math.round(
    (Date.parse(`${estado.hoy}T00:00:00Z`) - Date.parse(`${robot.ultima_corrida}T00:00:00Z`)) / 86400000
  );
  barra.hidden = false;
  if (!robot.ok || dias > 2) {
    barra.className = "barra-estado alerta";
    barra.textContent = robot.ok
      ? `⚠ El robot no corre hace ${dias} días — los datos de tu cartera están viejos`
      : `⚠ La última corrida del robot falló: ${robot.error || "error desconocido"}`;
    return;
  }
  barra.className = "barra-estado";
  const cuando = dias === 0 ? "hoy" : dias === 1 ? "ayer" : `hace ${dias} días`;
  barra.textContent = `Cartera actualizada ${cuando} · ${robot.propiedades} propiedades`;
}

function dibujarGlobo() {
  const globo = document.getElementById("globo-pendientes");
  const grupos = derivar(estado.datos.negocios, estado.datos.eventos, estado.hoy);
  const total = grupos.reduce((t, g) => t + g.items.length, 0);
  globo.hidden = total === 0;
  globo.textContent = total > 99 ? "99+" : String(total);
}

const VISTAS = {
  hoy: dibujarHoy,
  salud: dibujarSalud,
};

function dibujar() {
  const contenedor = document.getElementById("vista");
  const fabrica = VISTAS[estado.vista];
  contenedor.innerHTML = "";
  if (!fabrica) {
    contenedor.innerHTML = `<p class="pronto">Esta pantalla llega en la próxima etapa.</p>`;
  } else {
    contenedor.append(fabrica(estado));
  }
  contenedor.scrollTo?.(0, 0);
  window.scrollTo(0, 0);
  for (const boton of document.querySelectorAll(".nav-boton")) {
    const activa = boton.dataset.vista === estado.vista;
    boton.setAttribute("aria-current", activa ? "page" : "false");
  }
}

function irA(vista) {
  estado.vista = vista;
  location.hash = vista;
  dibujar();
}

async function arrancar() {
  estado.datos = await bajarDatos();
  const desdeElHash = location.hash.replace("#", "");
  if (desdeElHash) estado.vista = desdeElHash;

  document.getElementById("navegacion").addEventListener("click", (evento) => {
    const boton = evento.target.closest(".nav-boton");
    if (boton) irA(boton.dataset.vista);
  });
  window.addEventListener("hashchange", () => {
    const vista = location.hash.replace("#", "") || "hoy";
    if (vista !== estado.vista) { estado.vista = vista; dibujar(); }
  });

  dibujarBarraEstado();
  dibujarGlobo();
  dibujar();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}

arrancar();
```

- [ ] **Step 2: Commit**

```bash
git add app.js
git commit -m "feat: arranque de la app, carga de datos y navegacion"
```

---

## Task 9: La vista Salud del Negocio

**Files:**
- Create: `vistas/salud.js`

- [ ] **Step 1: Escribir la vista**

Crear `vistas/salud.js`:

```js
/* Salud del Negocio: las tres capas, el ritmo contra el calendario y las metricas.

   La barra de ritmo es el elemento central: muestra el avance real contra un marcador
   de calendario. La distancia entre los dos es toda la informacion. */

import { capas, ritmo, metricas, porAnio, comparativaCategorias } from "../lib/salud.js";
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
  const r = ritmo(c.capa1.facturacion, objetivo, anio, estado.hoy);
  const m = metricas(negocios, anio);
  const anios = porAnio(negocios);
  const cats = comparativaCategorias(negocios, ajustes, anio, estado.hoy);

  const trozo = document.createDocumentFragment();
  trozo.append(cabecera(anio, c));
  if (r) trozo.append(barraDeRitmo(r, objetivo, c, anio));
  trozo.append(tresCapas(c));
  if (anios.length) trozo.append(graficaAnual(anios, anio));
  trozo.append(metricasDelAnio(m));
  if (cats.length) trozo.append(comparativa(cats));
  if (c.capa3.detalle.length) trozo.append(propiedadesUsadas(c.capa3));
  return trozo;
}

function cabecera(anio, c) {
  return nodo(html`
    <section class="tarjeta">
      <p class="etiqueta">Cobrado en ${anio}</p>
      <p class="cifra cifra-heroe" style="margin:6px 0 4px">${plata(c.capa1.facturacion)}</p>
      <p class="apunte">
        facturado · <strong>${plataUSD(c.capa1.ganancia)}</strong> a tu bolsillo
        · ${c.capa1.negocios} ${c.capa1.negocios === 1 ? "negocio" : "negocios"}
      </p>
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
        <div class="dato"><span class="dato-nombre">Si cierra toda tu cartera</span><span class="dato-valor">${plata(c.total.facturacion)}</span></div>
      </div>
      ${r.falta > 0 && c.total.facturacion < objetivo
        ? html`<p class="aviso">Aun cerrando <strong>todo</strong> lo que tenés hoy llegás a
             ${plata(c.total.facturacion)}. Te faltan <strong>${plata(objetivo - c.total.facturacion)}</strong>
             de negocio nuevo para el objetivo.</p>`
        : ""}
    </section>
  `);
}

function tresCapas(c) {
  const total = c.total.facturacion || 1;
  const ancho = (x) => `${(x / total) * 100}%`;
  const fila = (clase, nombre, sub, monto, ganancia) => html`
    <div class="capa">
      <span class="capa-punto ${clase}"></span>
      <span><span class="capa-nombre">${nombre}</span><br><span class="capa-sub">${sub}</span></span>
      <span class="capa-monto">
        <span class="cifra cifra-media">${plata(monto)}</span><br>
        <span class="capa-sub">${plata(ganancia)} tuyos</span>
      </span>
    </div>`;

  return nodo(html`
    <section class="tarjeta">
      <div class="tarjeta-titulo">
        <h2 class="titulo">De dónde sale la plata</h2>
        <span class="apunte">${plataUSD(c.total.facturacion)}</span>
      </div>
      <div class="capas-barra">
        <div class="capas-tramo uno" style="width:${ancho(c.capa1.facturacion)}"></div>
        <div class="capas-tramo dos" style="width:${ancho(c.capa2.facturacion)}"></div>
        <div class="capas-tramo tres" style="width:${ancho(c.capa3.facturacion)}"></div>
      </div>
      ${fila("uno", "Cobrado", `${c.capa1.negocios} negocios cerrados`, c.capa1.facturacion, c.capa1.ganancia)}
      ${fila("dos", "Casi seguro", `${c.capa2.negocios} en curso · reservadas y en negociación`, c.capa2.facturacion, c.capa2.ganancia)}
      ${fila("tres", "Potencial", `${c.capa3.propiedades} propiedades publicadas`, c.capa3.facturacion, c.capa3.ganancia)}
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
        <div class="barras-caña" style="height:${(a.facturacion / tope) * 100}%"></div>
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

function propiedadesUsadas(capa3) {
  const filas = capa3.detalle
    .map(
      (p) => html`
      <div class="dato">
        <span class="dato-nombre">${escapar(p.direccion || "Sin dirección")} · ${p.estado.replace("_", " ")}</span>
        <span class="dato-valor">${plata(p.precio)} × ${Math.round(p.probabilidad * 100)}%</span>
      </div>`
    )
    .join("");
  return nodo(html`
    <section class="tarjeta">
      <div class="tarjeta-titulo">
        <h2 class="titulo">Qué se proyectó</h2>
        <span class="apunte">${capa3.propiedades} propiedades</span>
      </div>
      <div class="datos">${filas}</div>
      <p class="apunte" style="margin-top:12px">
        Cada una vale su precio por la probabilidad de cerrarse según su estado, y por tu
        propio ratio histórico de facturación.
      </p>
    </section>
  `);
}
```

- [ ] **Step 2: Commit**

```bash
git add vistas/salud.js
git commit -m "feat: pantalla Salud del Negocio"
```

---

## Task 10: La vista Hoy

**Files:**
- Create: `vistas/hoy.js`

- [ ] **Step 1: Escribir la vista**

Crear `vistas/hoy.js`:

```js
/* Hoy: la bandeja de pendientes. Lo primero que se ve al abrir la app.

   Si no hay nada pendiente, no muestra una lista vacia: muestra como viene el mes. */

import { derivar } from "../lib/pendientes.js";
import { capas, ritmo } from "../lib/salud.js";
import { plata, plataUSD, pct, fechaCorta, escapar } from "../lib/formato.js";

const html = (cadenas, ...valores) =>
  cadenas.reduce((t, c, i) => t + c + (valores[i] ?? ""), "");

function nodo(marca) {
  const molde = document.createElement("template");
  molde.innerHTML = marca.trim();
  return molde.content;
}

export function dibujarHoy(estado) {
  const { negocios, eventos } = estado.datos;
  const grupos = derivar(negocios, eventos, estado.hoy);
  const total = grupos.reduce((t, g) => t + g.items.length, 0);

  const trozo = document.createDocumentFragment();
  trozo.append(encabezado(total));
  if (!total) {
    trozo.append(todoAlDia(estado));
    return trozo;
  }
  for (const grupo of grupos) trozo.append(dibujarGrupo(grupo, estado));
  return trozo;
}

function encabezado(total) {
  return nodo(html`
    <section style="margin-bottom:16px">
      <p class="etiqueta">Pendientes</p>
      <h1 class="titulo" style="font-size:27px;margin-top:4px">
        ${total ? `${total} cosas para revisar` : "Todo al día"}
      </h1>
    </section>
  `);
}

function dibujarGrupo(grupo, estado) {
  const anio = Number(estado.hoy.slice(0, 4));
  const items = grupo.items
    .map(
      (item) => html`
      <li class="grupo-item">
        <p class="grupo-item-titulo">${escapar(item.titulo)}${
          item.fecha ? html` <span class="capa-sub">· ${fechaCorta(item.fecha, anio)}</span>` : ""
        }</p>
        <p class="grupo-item-detalle">${escapar(item.detalle)}</p>
      </li>`
    )
    .join("");

  return nodo(html`
    <details class="grupo ${grupo.urgente ? "urgente" : ""}">
      <summary class="grupo-cabeza">
        <span class="grupo-cuenta">${grupo.items.length}</span>
        <span class="grupo-nombre">${escapar(grupo.nombre)}</span>
        <span class="grupo-flecha" aria-hidden="true">›</span>
      </summary>
      <ul class="grupo-lista">${items}</ul>
    </details>
  `);
}

function todoAlDia(estado) {
  const { negocios, cartera, ajustes } = estado.datos;
  const anio = estado.hoy.slice(0, 4);
  const c = capas(negocios, cartera, ajustes, anio);
  const objetivo = (ajustes.objetivo_personal || {})[anio] || 0;
  const r = ritmo(c.capa1.facturacion, objetivo, anio, estado.hoy);

  return nodo(html`
    <section class="vacio">
      <p class="vacio-signo">✓</p>
      <p class="vacio-texto">No hay nada esperándote.</p>
    </section>
    <section class="tarjeta">
      <p class="etiqueta">Cobrado en ${anio}</p>
      <p class="cifra cifra-grande" style="margin:6px 0 4px">${plataUSD(c.capa1.facturacion)}</p>
      ${r ? html`<p class="apunte">${pct(r.avance)} del objetivo · ${r.aRitmo ? "vas a ritmo" : "vas atrasado"}</p>` : ""}
    </section>
  `);
}
```

- [ ] **Step 2: Commit**

```bash
git add vistas/hoy.js
git commit -m "feat: pantalla Hoy con la bandeja de pendientes"
```

---

## Task 11: Que funcione sin señal, y verificación

**Files:**
- Create: `sw.js`

- [ ] **Step 1: Escribir el service worker**

Crear `sw.js`:

```js
/* Deja la app usable sin señal.

   Estrategia: el codigo y la tipografia se sirven del cache (son estables); los datos se
   piden siempre a la red y se guarda una copia por si no hay conexion. Asi los numeros
   nunca quedan viejos cuando hay internet, pero la app abre igual en el subsuelo. */

const CACHE = "como-venimos-v1";

const ARMAZON = [
  "./",
  "./index.html",
  "./app.css",
  "./app.js",
  "./manifest.webmanifest",
  "./tipografia/bricolage.woff2",
  "./lib/formato.js",
  "./lib/salud.js",
  "./lib/pendientes.js",
  "./vistas/salud.js",
  "./vistas/hoy.js",
];

self.addEventListener("install", (evento) => {
  evento.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARMAZON)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    caches.keys()
      .then((claves) => Promise.all(claves.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (evento) => {
  const pedido = evento.request;
  if (pedido.method !== "GET") return;

  // Los datos: primero la red, y si no hay, lo ultimo que se guardo.
  if (pedido.url.includes("/datos/")) {
    evento.respondWith(
      fetch(pedido)
        .then((respuesta) => {
          const copia = respuesta.clone();
          caches.open(CACHE).then((c) => c.put(pedido, copia));
          return respuesta;
        })
        .catch(() => caches.match(pedido))
    );
    return;
  }

  // El armazon: primero el cache, que no cambia entre corridas.
  evento.respondWith(caches.match(pedido).then((guardado) => guardado || fetch(pedido)));
});
```

- [ ] **Step 2: Correr toda la batería de tests**

Run: `node --test tests-js/ 2>&1 | tail -6`
Expected: `pass 52`, `fail 0`

Run: `python -m unittest discover -s tests -t . 2>&1 | grep -E "^(Ran|OK|FAILED)"`
Expected: `OK`

- [ ] **Step 3: Verificar que la app carga de verdad**

```bash
cd "c:/Users/es_bi/OneDrive/Desktop/claude/Como venimos"
python -m http.server 8765 --bind 127.0.0.1 &
sleep 2
for archivo in index.html app.css app.js lib/salud.js lib/pendientes.js lib/formato.js \
               vistas/salud.js vistas/hoy.js sw.js manifest.webmanifest \
               tipografia/bricolage.woff2 datos/negocios.json datos/cartera.json \
               datos/ajustes.json datos/eventos.json datos/estado_robot.json; do
  printf "%-32s %s\n" "$archivo" "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8765/$archivo)"
done
kill %1
```
Expected: los 16 dan `200`.

- [ ] **Step 4: Verificar los números con los mismos datos que usa la app**

```bash
node --input-type=module -e "
import { readFileSync } from 'node:fs';
const leer = (n) => JSON.parse(readFileSync('datos/' + n + '.json', 'utf8'));
const { capas, ritmo } = await import('./lib/salud.js');
const datos = { negocios: leer('negocios'), cartera: leer('cartera'), ajustes: leer('ajustes') };
const c = capas(datos.negocios, datos.cartera, datos.ajustes, '2026');
const r = ritmo(c.capa1.facturacion, datos.ajustes.objetivo_personal['2026'], '2026', '2026-08-17');
console.log('capa 1 cobrado   :', Math.round(c.capa1.facturacion));
console.log('capa 2 casi seguro:', Math.round(c.capa2.facturacion));
console.log('capa 3 potencial :', Math.round(c.capa3.facturacion));
console.log('total            :', Math.round(c.total.facturacion));
console.log('avance / calendario:', (r.avance*100).toFixed(1) + '%', '/', (r.calendario*100).toFixed(1) + '%');
"
```
Expected — **tienen que coincidir con lo que imprime `python herramientas/resumen.py`**:
```
capa 1 cobrado   : 20079
capa 2 casi seguro: 15924
capa 3 potencial : 21554
total            : 57557
avance / calendario: 30.9% / 62.7%
```

> Este es el chequeo más importante de la fase: hay dos implementaciones independientes
> de la misma matemática (Python en `herramientas/resumen.py`, JavaScript en `lib/salud.js`).
> Que coincidan al dólar es una verificación real, no una formalidad. Si difieren, parar y
> encontrar cuál de las dos está mal antes de seguir.

- [ ] **Step 5: Commit y subir**

```bash
git add sw.js
git commit -m "feat: funcionar sin señal"
git push origin main
```

---

## Verificación final de la fase

- [ ] `node --test tests-js/` → **52 tests, 0 fallas**
- [ ] `python -m unittest discover -s tests -t .` → **210 tests, 0 fallas**
- [ ] Los 16 archivos se sirven con `200`
- [ ] **JavaScript y Python dan los mismos números** (20.079 / 15.924 / 21.554 / 57.557)
- [ ] La app abre en el navegador y se ve la barra de ritmo
- [ ] Todo subido a GitHub

**Al terminar, el usuario puede abrir la app y ver cómo viene.** La Fase 2b2 agrega editar, guardar con token, el alta manual de negocios y despachar los pendientes.
