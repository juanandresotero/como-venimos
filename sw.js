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
