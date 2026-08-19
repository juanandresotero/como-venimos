/* Saber DÓNDE se está abriendo la página, cuando eso cambia lo que se puede hacer.

   El problema concreto: cuando alguien toca un enlace adentro de WhatsApp, la página no
   se abre en su navegador sino en una ventanita que WhatsApp trae adentro. Ahí adentro
   NO anda el menú de compartir del sistema (`navigator.share`) y las descargas quedan
   bloqueadas: el botón se toca y no pasa nada. Al usuario le parece que la app está rota.

   Se sale con el menú de tres puntitos → "Abrir en navegador", pero hay que saberlo.

   Lo que SÍ funciona adentro de esa ventanita es navegar a `wa.me`, porque eso vuelve a
   WhatsApp, que es la aplicación que la está mostrando. Por eso vale la pena distinguir:
   adentro de WhatsApp se manda por `wa.me`, afuera por el menú del sistema. */

const agente = () =>
  (typeof navigator !== "undefined" && navigator.userAgent) || "";

/* Estas marcas son las que ponen las aplicaciones que traen navegador propio. La de
   Android es `wv` (de WebView) adentro del paréntesis; iOS no pone ninguna, pero tampoco
   pone "Safari", y un navegador de verdad en iOS siempre lo pone. */
const POR_NOMBRE = /(FBAN|FBAV|FB_IAB|Instagram|WhatsApp|Line\/|Twitter|MicroMessenger|Snapchat)/i;

export function esNavegadorDeOtraApp(ua = agente()) {
  if (!ua) return false;
  if (POR_NOMBRE.test(ua)) return true;
  if (/; wv\)/.test(ua)) return true;                       // WebView de Android
  const esIOS = /iPhone|iPod|iPad/.test(ua);
  if (esIOS && /AppleWebKit/.test(ua) && !/Safari|CriOS|FxiOS|EdgiOS/.test(ua)) return true;
  return false;
}

export const esCelular = (ua = agente()) =>
  /Android|iPhone|iPod|iPad|Mobile/i.test(ua);

/* Cómo se sale de la ventanita, dicho con las palabras que el usuario ve en pantalla. */
export function comoSalirDeAca(ua = agente()) {
  if (/iPhone|iPod|iPad/.test(ua)) {
    return "Tocá el botón de compartir abajo y elegí “Abrir en Safari”.";
  }
  return "Tocá los tres puntitos ⋮ de arriba a la derecha y elegí “Abrir en navegador”.";
}
