import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/* Que toda clase que las pantallas escriben exista de verdad en la hoja de estilos.

   Existe por un error concreto: al reescribir un bloque de app.css se reemplazo un tramo
   de texto que arrancaba en una regla y terminaba en otra, y en el medio vivian las reglas
   de la barra del nivel de RE/MAX. Desaparecieron sin que nada fallara — la app siguio
   andando y los numeros de la barra quedaron pegados a la izquierda. Dos commits despues
   seguia roto.

   Una clase que no existe no rompe nada, y eso es justamente lo que la hace peligrosa: no
   hay test que falle, no hay error en la consola, solo algo que se ve mal en una pantalla
   que capaz no se mira ese dia. */

// fileURLToPath y no .pathname: la carpeta tiene un espacio y venia como "%20".
const RAIZ = fileURLToPath(new URL("..", import.meta.url));
const css = readFileSync(join(RAIZ, "app.css"), "utf-8");

/* Las clases que el CSS define, sin importar como esten combinadas en el selector. */
const definidas = new Set(
  [...css.matchAll(/\.([a-z][a-z0-9-]*)/gi)].map((m) => m[1])
);

/* Las que las pantallas usan. Solo los `class="..."` literales: si adentro hay un
   `${...}` el valor se arma en tiempo de ejecucion y aca no se puede saber cual es. */
function clasesUsadas(archivo) {
  const texto = readFileSync(archivo, "utf-8");
  /* Una clase que el mismo archivo busca con querySelector es un ENGANCHE, no un estilo:
     esta ahi para encontrar el nodo y meterle algo adentro. No tiene por que existir en
     el CSS y marcarla seria ruido. */
  const enganches = new Set(
    [...texto.matchAll(/querySelector(?:All)?\("\.([a-z][a-z0-9-]*)"/gi)].map((m) => m[1])
  );
  const salida = new Set();
  for (const m of texto.matchAll(/class="([^"$]*)"/g)) {
    for (const clase of m[1].trim().split(/\s+/)) {
      if (clase && !enganches.has(clase)) salida.add(clase);
    }
  }
  return salida;
}

/* reporte.js queda afuera: arma una pagina suelta para descargar, con su propio <style>
   adentro. Sus clases no tienen por que estar en app.css y nunca lo van a estar. */
const APARTE = new Set(["reporte.js"]);
const carpetas = ["vistas", "lib"];
const archivos = carpetas.flatMap((c) =>
  readdirSync(join(RAIZ, c))
    .filter((f) => f.endsWith(".js") && !APARTE.has(f))
    .map((f) => join(RAIZ, c, f))
);

test("las pantallas no usan ninguna clase que el CSS no defina", () => {
  const huerfanas = [];
  for (const archivo of archivos) {
    for (const clase of clasesUsadas(archivo)) {
      if (!definidas.has(clase)) huerfanas.push(`${archivo.split(/[\\/]/).pop()} → .${clase}`);
    }
  }
  assert.deepEqual(huerfanas, [], "clases sin regla en app.css");
});

/* Las de la barra del nivel se nombran una por una porque son las que se perdieron, y
   porque son invisibles al ojo: sin ellas la barra sigue dibujandose, solo que mal. */
test("la barra del nivel de RE/MAX tiene sus reglas", () => {
  for (const clase of ["nivel-caja", "nivel-numero", "nivel-globo"]) {
    assert.ok(definidas.has(clase), `falta .${clase} en app.css`);
  }
  assert.match(css, /\.nivel-numero\s*\{[^}]*justify-content:\s*center/,
    "sin esto los montos se pegan a la izquierda del tramo");
});

test("no vuelven a quedar bloques duplicados al reordenar el archivo", () => {
  const bloques = [];
  let actual = [], inicio = false, profundidad = 0;
  for (const linea of css.split("\n")) {
    if (profundidad === 0 && linea.includes("{") && !linea.trim().startsWith("/*")) inicio = true;
    profundidad += (linea.match(/\{/g) || []).length - (linea.match(/\}/g) || []).length;
    if (inicio) {
      actual.push(linea.trim());
      if (profundidad === 0) { bloques.push(actual.join(" ")); actual = []; inicio = false; }
    }
  }
  const vistos = new Set();
  const repetidos = bloques.filter((b) => (vistos.has(b) ? true : (vistos.add(b), false)));
  assert.deepEqual(repetidos, [], "hay reglas escritas dos veces: gana la de abajo");
});
