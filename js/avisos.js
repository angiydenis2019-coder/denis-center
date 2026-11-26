// Avisos (notificaciones) en el celular: activar, probar y estado
import { sb } from './supabase.js';

export const avisosSoportados = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const esIphone = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
const instalada = () => window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;

function aBytes(b64) {
  const s = atob(b64.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((b64.length + 3) % 4));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

// 'activos' | 'apagados' | 'bloqueados' | 'no-soportado' | 'instalar-iphone'
export async function estadoAvisos() {
  if (!avisosSoportados()) return esIphone() && !instalada() ? 'instalar-iphone' : 'no-soportado';
  if (Notification.permission === 'denied') return 'bloqueados';
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  return sub && Notification.permission === 'granted' ? 'activos' : 'apagados';
}

async function errorFuncion(error) {
  let d = null;
  try { d = (await error.context?.json())?.error; } catch { /* nada */ }
  if (!d && /Failed to send|404|not found/i.test(error.message)) d = 'Falta instalar la función "avisos" en Supabase.';
  return new Error(d || error.message);
}

export async function activarAvisos() {
  if (!navigator.onLine) throw new Error('Necesitás señal para activar los avisos.');
  const permiso = await Notification.requestPermission();
  if (permiso !== 'granted') throw new Error('No diste permiso para los avisos. Podés habilitarlo en la configuración del navegador.');
  const { data, error } = await sb.functions.invoke('avisos', { body: { accion: 'clave' } });
  if (error) throw await errorFuncion(error);
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: aBytes(data.clave) });
  const j = sub.toJSON();
  const { error: e2 } = await sb.rpc('guardar_suscripcion', {
    p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth, p_dispositivo: navigator.userAgent,
  });
  if (e2) throw new Error(/guardar_suscripcion|function/i.test(e2.message) ? 'Falta ejecutar sql/12_avisos.sql en Supabase.' : e2.message);
}

export async function desactivarAvisos() {
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (sub) {
    await sb.from('suscripciones_push').delete().eq('endpoint', sub.endpoint);
    await sub.unsubscribe();
  }
}

export async function probarAviso() {
  const { data, error } = await sb.functions.invoke('avisos', { body: { accion: 'prueba' } });
  if (error) throw await errorFuncion(error);
  return data?.enviados || 0;
}
