/* Deja la app usable sin señal.

   Estrategia, en las dos: PRIMERO LA RED, con el cache como red de seguridad.
   - Los DATOS se piden siempre a la red y se guarda una copia por si no hay conexion.
   - El CODIGO se pide a la red con un limite de 2,5 segundos. Si contesta, esa es la
     buena; si tarda o no hay señal, sale lo guardado al instante.

   Las dos versiones anteriores fallaban de la misma forma en distinto grado: solo-cache
   dejaba una version vieja pegada para siempre, y servir-del-cache-y-refrescar-atras
   hacia que la PRIMERA apertura despues de cada cambio mostrara lo viejo. Con el usuario
   probando en vivo, eso era mirar codigo de hace media hora y creer que los arreglos no
   estaban. */

const CACHE = "como-venimos-v11";

const ARMAZON = [
  "./",
  "./index.html",
  "./app.css",
  "./app.js",
  "./manifest.webmanifest",
  "./iconos/icono-192.png",
  "./iconos/icono-512.png",
  "./tipografia/bricolage.woff2",
  "./lib/formato.js",
  "./lib/salud.js",
  "./lib/motor.js",
  "./lib/pendientes.js",
  "./lib/github.js",
  "./lib/guardado.js",
  "./lib/cartera.js",
  "./lib/catalogos.js",
  "./lib/cruce.js",
  "./lib/planilla.js",
  "./lib/contactos.js",
  "./lib/renta.js",
  "./lib/cambio.js",
  "./lib/recomendaciones.js",
  "./lib/reporte.js",
  "./lib/ficha-imagen.js",
  "./vistas/salud.js",
  "./vistas/hoy.js",
  "./vistas/negocios.js",
  "./vistas/ficha.js",
  "./vistas/cartera.js",
  "./vistas/propiedad.js",
  "./vistas/renta.js",
  "./vistas/ajustes.js",
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

  /* El armazon: primero la red, pero sin esperarla eternamente.

     Antes se respondia del cache y se refrescaba por atras. Eso hacia que despues de cada
     cambio la PRIMERA apertura mostrara la version vieja, y solo la segunda la nueva. Con
     el usuario probando en vivo, eso significaba mirar codigo de hace media hora y creer
     que los arreglos no estaban.

     Ahora se pide a la red con un limite de tiempo corto: si contesta, esa es la buena; si
     tarda o no hay señal, sale lo guardado al instante. La app sigue abriendo en el
     subsuelo, pero nunca mas se queda pegada en una version vieja teniendo internet. */
  evento.respondWith(responderArmazon(pedido));
});

const ESPERA_MAXIMA = 2500;

async function responderArmazon(pedido) {
  const guardado = await caches.match(pedido);

  const deLaRed = fetch(pedido).then((respuesta) => {
    if (respuesta && respuesta.ok) {
      const copia = respuesta.clone();
      caches.open(CACHE).then((c) => c.put(pedido, copia)).catch(() => {});
    }
    return respuesta;
  });

  if (!guardado) return deLaRed;

  // Se corre a la red contra el reloj. El que llegue primero gana.
  const reloj = new Promise((listo) => setTimeout(() => listo(null), ESPERA_MAXIMA));
  try {
    const respuesta = await Promise.race([deLaRed, reloj]);
    return respuesta && respuesta.ok ? respuesta : guardado;
  } catch {
    return guardado;
  }
}
