// Service worker de Denis Center: guarda la app en el celular para que
// abra aunque no haya señal. (Los DATOS offline llegan en la etapa de sincronización.)
// Cada vez que cambies archivos de la app, subí el número de versión.
const VERSION = 'denis-center-v7';
const ARCHIVOS = [
  './', './index.html', './manifest.json', './css/estilos.css',
  './js/app.js', './js/config.js', './js/supabase.js', './js/util.js', './js/fotos.js', './js/negocio.js', './js/buscar.js',
  './js/vistas/login.js', './js/vistas/inicio.js', './js/vistas/clientes.js',
  './js/vistas/equipos.js', './js/vistas/trabajos.js', './js/vistas/ajustes.js', './js/vistas/agenda.js', './js/vistas/precios.js',
  './iconos/icono-192.png', './iconos/icono-512.png', './iconos/icono-maskable-512.png', './iconos/logo.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ARCHIVOS)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((claves) => Promise.all(claves.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  // Nunca cachear las llamadas a Supabase (datos, login, fotos)
  if (url.hostname.endsWith('supabase.co')) return;

  // Archivos de la app y librería: primero la red, si no hay señal, lo guardado
  // cache: 'no-cache' -> siempre pregunta al servidor si hay versión nueva
  // (si no cambió, el servidor responde "sin cambios" y no se descarga de nuevo)
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' })
      .then((resp) => {
        if (resp.ok && (url.origin === location.origin || url.hostname === 'esm.sh')) {
          const copia = resp.clone();
          caches.open(VERSION).then((c) => c.put(e.request, copia));
        }
        return resp;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('./index.html')))
  );
});
