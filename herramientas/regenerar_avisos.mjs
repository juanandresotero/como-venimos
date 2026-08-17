/* Vuelve a pasar los 85 negocios por `revisar()` con las reglas de hoy.

   Hace falta porque los avisos quedaron congelados como los dejo el import del Excel: un
   negocio cuya propiedad sigue en negociacion seguia reclamando la fecha de firma, aunque
   la app ya sepa que ese dato todavia no existe.

   NO puede mover la plata. Compara facturacion y ganancia antes y despues, negocio por
   negocio, y aborta si alguna cambio.

   Uso:  node herramientas/regenerar_avisos.mjs
*/
import { readFileSync, writeFileSync } from "node:fs";
import { revisar } from "../lib/motor.js";
import { fusionar } from "../lib/cartera.js";

const leer = (nombre) =>
  JSON.parse(readFileSync(new URL(`../datos/${nombre}.json`, import.meta.url), "utf8"));

const RUTA = new URL("../datos/negocios.json", import.meta.url);
const negocios = leer("negocios");
const ajustes = leer("ajustes");
let misDatos = {};
try { misDatos = leer("mis_datos"); } catch { /* todavia no existe */ }
const cartera = fusionar(leer("cartera"), misDatos);

const hoy = process.env.FECHA_HOY || new Date().toISOString().slice(0, 10);
const revisados = negocios.map((n) => revisar(n, ajustes, hoy, cartera));

/* La PLATA no se puede mover: si algo la cambia, es un error y se aborta.

   "Sin cargar" y "no existe el campo" son lo mismo: un negocio recien creado a mano no
   tiene todavia facturacion ni ganancia, y eso no es un cambio de plata. */
const mismaPlata = (a, b) => (a ?? null) === (b ?? null);
const conPlataMovida = revisados.filter((n, i) =>
  !mismaPlata(n.facturacion, negocios[i].facturacion)
  || !mismaPlata(n.ganancia, negocios[i].ganancia));
if (conPlataMovida.length && !process.env.PERMITIR_CAMBIO_DE_PLATA) {
  console.error(`ABORTA: ${conPlataMovida.length} negocios cambiarian de plata.`);
  console.error(`Si el cambio es a proposito (se arreglo una regla), correlo asi:`);
  console.error(`  PERMITIR_CAMBIO_DE_PLATA=1 node herramientas/regenerar_avisos.mjs`);
  for (const n of conPlataMovida.slice(0, 10)) {
    const antes = negocios.find((x) => x.id === n.id);
    console.error(`  ${n.id}: ${antes.facturacion}/${antes.ganancia}`
      + ` -> ${n.facturacion}/${n.ganancia}`);
  }
  process.exit(1);
}
if (conPlataMovida.length) {
  console.log(`Se recalculo la plata de ${conPlataMovida.length}:`);
  for (const n of conPlataMovida) {
    const antes = negocios.find((x) => x.id === n.id);
    console.log(`  ${n.id} (${n.direccion}): ${antes.facturacion}/${antes.ganancia}`
      + ` -> ${n.facturacion}/${n.ganancia}`);
  }
}

/* El ESTADO sí puede corregirse (un negocio sin fecha de firma no puede estar cerrado),
   pero se avisa siempre para poder mirarlo con los ojos. */
const conEstadoCorregido = revisados.filter((n, i) => n.estado !== negocios[i].estado);
if (conEstadoCorregido.length) {
  console.log(`Se corrigio el estado de ${conEstadoCorregido.length}:`);
  for (const n of conEstadoCorregido) {
    const antes = negocios.find((x) => x.id === n.id);
    console.log(`  ${n.id} (${n.direccion}): ${antes.estado} -> ${n.estado}`);
  }
}

const contar = (lista) =>
  lista.reduce((t, n) => t + (n.ficha_completa ? 0 : (n.avisos || []).length), 0);

writeFileSync(RUTA, `${JSON.stringify(revisados, null, 1)}\n`, "utf8");
console.log(`OK: ${revisados.length} negocios revisados, la plata no se movio.`);
console.log(`  pendientes antes:   ${contar(negocios)}`);
console.log(`  pendientes ahora:   ${contar(revisados)}`);

const porTipo = {};
for (const n of revisados) {
  if (n.ficha_completa) continue;
  for (const a of n.avisos || []) porTipo[a.tipo] = (porTipo[a.tipo] || 0) + 1;
}
for (const [tipo, cuantos] of Object.entries(porTipo).sort((a, b) => b[1] - a[1])) {
  console.log(`    ${String(cuantos).padStart(3)}  ${tipo}`);
}
