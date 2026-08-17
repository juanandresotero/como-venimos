/* Migracion de una sola vez: parte `regimen_comision` en las dos marcas sueltas.

   Antes la regla de comision era UNA casilla con cinco valores. Ahora sale de dos cosas
   independientes: como llego el negocio (el origen) y si ademas fue una suplencia o algo
   que el usuario refirio. Eso permite el caso que pidio: un negocio que llega por "Dueño
   Vende" y que despues igual se refiere.

   La migracion NO puede cambiar ni un peso. Al final compara el regimen derivado contra
   el que estaba guardado, negocio por negocio, y aborta si alguno no coincide.

   Uso:  node herramientas/migrar_marcas.mjs
*/
import { readFileSync, writeFileSync } from "node:fs";
import { regimenDe } from "../lib/catalogos.js";

const RUTA = new URL("../datos/negocios.json", import.meta.url);
const negocios = JSON.parse(readFileSync(RUTA, "utf8"));

const migrados = negocios.map((n) => ({
  ...n,
  es_suplencia: n.regimen_comision === "suplencia",
  yo_referi: n.regimen_comision === "yo_referi",
}));

const rotos = migrados.filter((n) => regimenDe(n) !== n.regimen_comision);
if (rotos.length) {
  console.error(`ABORTA: ${rotos.length} negocios cambiarian de regimen y por lo tanto de plata:`);
  for (const n of rotos.slice(0, 10)) {
    console.error(`  ${n.id}  origen=${n.origen_captacion}  `
      + `guardado=${n.regimen_comision}  derivado=${regimenDe(n)}`);
  }
  process.exit(1);
}

writeFileSync(RUTA, `${JSON.stringify(migrados, null, 1)}\n`, "utf8");
console.log(`OK: ${migrados.length} negocios migrados, el regimen derivado coincide en todos.`);
console.log(`  suplencias: ${migrados.filter((n) => n.es_suplencia).length}`);
console.log(`  referidos que dio: ${migrados.filter((n) => n.yo_referi).length}`);
