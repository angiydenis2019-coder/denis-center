// Service worker de Denis Center
// 1) Guarda la app en el celular para que abra sin señal.
// 2) Modo sin señal para los datos (ver js/sw-datos.js).
// Cada vez que cambies archivos de la app, subí el número de versión.
importScripts('./js/sw-datos.js');

const VERSION = 'denis-center-v22';
const ARCHIVOS = [
  './', './index.html', './manifest.json', './css/estilos.css',
  './js/app.js', './js/config.js', './js/supabase.js', './js/util.js', './js/fotos.js', './js/negocio.js',
  './js/buscar.js', './js/recordatorios.js', './js/sincronizar.js', './js/sw-datos.js', './js/iconos.js', './js/tema.js', './js/rapidos.js', './js/dictado.js', './js/contactos.js',
  './js/vistas/login.js', './js/vistas/inicio.js', './js/vistas/clientes.js',
  './js/vistas/equipos.js', './js/vistas/trabajos.js', './js/vistas/ajustes.js', './js/vistas/agenda.js',
  './js/vistas/precios.js', './js/vistas/resumen.js', './js/vistas/presupuestos.js', './js/vistas/papelera.js', './js/vistas/recibo.js', './js/vistas/cuenta.js', './js/vistas/admin.js', './js/vistas/terminos.js', './js/vistas/invitacion.js', './js/terminos.js',
  './iconos/icono-192.png', './iconos/icono-512.png', './iconos/icono-maskable-512.png', './iconos/logo.png', './iconos/emblema.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ARCHIVOS)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((claves) => Promise.all(claves.filter((k) => k !== VERSION && k !== 'dc-compartido' && k !== 'dc-logos').map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

// fetch con tiempo límite (señal débil = como si no hubiera)
function fetchConLimite(req, ms) {
  return new Promise((ok, mal) => {
    const t = setTimeout(() => mal(new Error('tiempo agotado')), ms);
    fetch(req).then((r) => { clearTimeout(t); ok(r); }, (e) => { clearTimeout(t); mal(e); });
  });
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);

  // "Compartir" hacia Denis Center (desde WhatsApp u otra app): guardar y abrir Nuevo cliente
  if (req.method === 'POST' && url.origin === location.origin && url.pathname.endsWith('/compartir')) {
    e.respondWith((async () => {
      const datos = {};
      try {
        const fd = await req.formData();
        ['title', 'text', 'url'].forEach((k) => { if (fd.get(k)) datos[k] = String(fd.get(k)); });
        const archivo = fd.get('archivo');
        if (archivo && typeof archivo !== 'string') datos.vcard = await archivo.text();
      } catch { /* sin datos */ }
      const cache = await caches.open('dc-compartido');
      await cache.put('./compartido', new Response(JSON.stringify(datos), { headers: { 'Content-Type': 'application/json' } }));
      return Response.redirect('./#/cliente-nuevo/compartido', 303);
    })());
    return;
  }

  // ----- Datos de Supabase -----
  if (url.hostname.endsWith('supabase.co')) {
    const esRest = url.pathname.startsWith('/rest/v1/');
    const esSubidaFoto = url.pathname.startsWith('/storage/v1/object/fotos/') && req.method === 'POST';

    // Panel del administrador: siempre directo a internet (nunca a la cola)
    if (url.pathname.includes('/rpc/admin_') || url.pathname.includes('/rpc/invitacion_')) return;

    // Logos de los negocios: se guardan para verlos también sin señal
    if (url.pathname.startsWith('/storage/v1/object/public/logos/') && req.method === 'GET') {
      e.respondWith(fetch(req).then((resp) => {
        if (resp.ok) { const copia = resp.clone(); caches.open('dc-logos').then((c) => c.put(req, copia)); }
        return resp;
      }).catch(() => caches.open('dc-logos').then((c) => c.match(req)).then((r) => r || Response.error())));
      return;
    }

    // Lecturas: primero la red; si no hay señal, la copia del celular
    if (esRest && (req.method === 'GET' || req.method === 'HEAD')) {
      e.respondWith((async () => {
        try {
          const resp = await fetchConLimite(req.clone(), 8000);
          if (resp.ok) e.waitUntil(guardarRespuestaEnEspejo(req, resp));
          return resp;
        } catch {
          return responderDesdeEspejo(req);
        }
      })());
      return;
    }

    // Escrituras: si hay cola pendiente o no hay señal, van a la cola (mantiene el orden)
    if ((esRest && ['POST', 'PATCH'].includes(req.method)) || esSubidaFoto) {
      e.respondWith((async () => {
        if (await hayCola()) { await encolar(req); return respuestaFalsa(req); }
        try {
          const resp = await fetchConLimite(req.clone(), 20000);
          if (resp.ok && esRest && !url.pathname.includes('/rpc/')) {
            const cuerpo = await req.clone().text();
            e.waitUntil(aplicarAlEspejo(req.url, req.method, cuerpo));
          }
          return resp;
        } catch {
          await encolar(req);
          return respuestaFalsa(req);
        }
      })());
      return;
    }
    return; // login, fotos firmadas, etc.: normal
  }

  // ----- Archivos de la app y librerías -----
  if (req.method !== 'GET') return;
  e.respondWith(
    fetch(req, { cache: 'no-cache' })
      .then((resp) => {
        if (resp.ok && (url.origin === location.origin || ['esm.sh', 'fonts.googleapis.com', 'fonts.gstatic.com'].includes(url.hostname))) {
          const copia = resp.clone();
          caches.open(VERSION).then((c) => c.put(req, copia));
        }
        return resp;
      })
      .catch(() => caches.match(req).then((r) => r || caches.match('./index.html')))
  );
});

// Mensajes desde la app
self.addEventListener('message', (e) => {
  const m = e.data || {};
  if (m.tipo === 'sincronizar') e.waitUntil(sincronizar(m));
  if (m.tipo === 'estado') e.waitUntil(avisarEstado());
  if (m.tipo === 'borrar-datos') e.waitUntil(borrarDatos());
  if (m.tipo === 'ver-fallidos') {
    e.waitUntil(leerMeta('fallidos').then((f) => e.source?.postMessage({ tipo: 'fallidos', lista: f || [] })));
  }
  if (m.tipo === 'limpiar-fallidos') e.waitUntil(guardarMeta('fallidos', []).then(() => avisarEstado()));
});
