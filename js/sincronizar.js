// Sincronización con el modo sin señal del service worker:
// le pasa un token vigente para que suba la cola y actualice la copia local,
// y muestra en la barra cuántos cambios faltan subir.
import { sb } from './supabase.js';
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

let estado = { pendientes: 0, fallidos: 0, sincronizando: false, actualizado: null };
let alTerminar = () => {};
let boton = null;

export const estadoSync = () => estado;

export async function pedirSincronizacion() {
  const sw = navigator.serviceWorker?.controller;
  if (!sw || !navigator.onLine) return;
  const { data } = await sb.auth.getSession(); // renueva el token si venció
  if (!data.session) return;
  sw.postMessage({ tipo: 'sincronizar', token: data.session.access_token, apikey: SUPABASE_KEY, base: SUPABASE_URL });
}

export function iniciarSincronizacion({ alActualizar }) {
  alTerminar = alActualizar;
  boton = document.getElementById('estado-sync');
  if (!('serviceWorker' in navigator)) return;

  navigator.serviceWorker.addEventListener('message', (e) => {
    const m = e.data || {};
    if (m.tipo === 'estado') {
      estado = { ...estado, ...m };
      pintar();
      if (m.enviados > 0) alTerminar();
    }
    if (m.tipo === 'fallidos') mostrarFallidos(m.lista);
  });

  boton?.addEventListener('click', () => {
    if (estado.fallidos) navigator.serviceWorker.controller?.postMessage({ tipo: 'ver-fallidos' });
    else if (!navigator.onLine) alert(`Hay ${estado.pendientes} cambio(s) guardados en el celular. Se suben solos cuando vuelva la señal.`);
    else pedirSincronizacion();
  });

  window.addEventListener('online', () => pedirSincronizacion());
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') pedirSincronizacion(); });
  setInterval(() => pedirSincronizacion(), 3 * 60 * 1000);

  navigator.serviceWorker.ready.then(() => {
    navigator.serviceWorker.controller?.postMessage({ tipo: 'estado' });
    pedirSincronizacion();
  });
}

function pintar() {
  if (!boton) return;
  const { pendientes, fallidos, sincronizando } = estado;
  boton.hidden = !pendientes && !fallidos;
  boton.className = 'estado-sync' + (fallidos ? ' error' : '');
  boton.textContent = fallidos ? `⚠️ ${fallidos} con error`
    : sincronizando && pendientes ? `⏫ Subiendo ${pendientes}…`
    : `⏳ ${pendientes} sin subir`;
}

function mostrarFallidos(lista) {
  const texto = lista.map((f) => `• ${f.metodo} ${new URL(f.url).pathname.split('/').pop()} (${f.estado}): ${f.detalle}`).join('\n');
  if (confirm(`Estos cambios no se pudieron subir:\n\n${texto}\n\n¿Borrar el aviso?`)) {
    navigator.serviceWorker.controller?.postMessage({ tipo: 'limpiar-fallidos' });
  }
}

// Al cerrar sesión: avisar si quedan cambios sin subir y borrar la copia local
export async function prepararSalida() {
  if (estado.pendientes > 0 &&
      !confirm(`Hay ${estado.pendientes} cambio(s) que todavía no se subieron. Si salís ahora, se pueden perder. ¿Salir igual?`)) {
    return false;
  }
  navigator.serviceWorker?.controller?.postMessage({ tipo: 'borrar-datos' });
  return true;
}
