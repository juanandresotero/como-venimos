/* Deja la app usable sin señal.

   Estrategia:
   - Los DATOS se piden siempre a la red y se guarda una copia por si no hay conexion.
     Asi los numeros nunca quedan viejos cuando hay internet.
   - El CODIGO se sirve del cache al instante (la app abre rapido y sin señal) pero se
     vuelve a bajar en segundo plano. La version nueva queda lista para la proxima vez
     que abra. Antes esto era solo-cache y una version vieja podia quedarse pegada para
     siempre en el telefono, aunque el repo tuviera codigo nuevo. */

const CACHE = "como-venimos-v3";

const ARMAZON = [
  "./",
  "./index.html",
  "./app.css",
  "./app.js",
  "./manifest.webmanifest",
  "./tipografia/bricolage.woff2",
  "./lib/formato.js",
  "./lib/salud.js",
  "./lib/motor.js",
  "./lib/pendientes.js",
  "./lib/github.js",
  "./lib/guardado.js",
  "./lib/cartera.js",
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

  // El armazon: se responde con lo que hay y se refresca por atras.
  evento.respondWith(
    caches.match(pedido).then((guardado) => {
      const deLaRed = fetch(pedido)
        .then((respuesta) => {
          if (respuesta && respuesta.ok) {
            const copia = respuesta.clone();
            caches.open(CACHE).then((c) => c.put(pedido, copia)).catch(() => {});
          }
          return respuesta;
        })
        .catch(() => guardado);
      return guardado || deLaRed;
    })
  );
});
