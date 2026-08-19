/* Una ventanita por encima de todo, con el fondo apagado.

   Vive aparte porque la usan dos pantallas que no se conocen entre sí: la de firmar con el
   dedo y la de mirar una carta oferta sin abrirla.

   `contenido` ya viene con su propia caja (`.panel-firma`): acá sólo se pone el telón
   alrededor y se resuelve cómo se cierra. */

export function telon(contenido) {
  const caja = document.createElement("div");
  caja.className = "telon-firma";
  caja.append(contenido);
  document.body.append(caja);

  /* El fondo no se scrollea mientras la ventanita está abierta: si no, se mueve lo de atrás
     y al cerrarla uno aparece en otro lado. */
  document.body.style.overflow = "hidden";

  function conEscape(evento) {
    if (evento.key === "Escape") cerrar();
  }
  function cerrar() {
    caja.remove();
    document.body.style.overflow = "";
    document.removeEventListener("keydown", conEscape);
  }

  document.addEventListener("keydown", conEscape);
  return { caja, cerrar };
}
