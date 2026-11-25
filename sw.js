// Service worker de Denis Center: guarda la app en el celular para que
// abra aunque no haya señal. (Los DATOS offline llegan en la etapa de sincronización.)
// Cada vez que cambies archivos de la app, subí el número de versión.
const VERSION = 'denis-center-v4';
const ARCHIVOS = [
  './', './index.html', './manifest.json', './css/estilos.css',
  './js/app.js', './js/config.js', './js/supabase.js', './js/util.js', './js/fotos.js',
  './js/vistas/login.js', './js/vistas/inicio.js', './js/vistas/clientes.js',
  './js/vistas/equipos.js', './js/vistas/trabajos.js',
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
  e.respondWith(
    fetch(e.request)
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
