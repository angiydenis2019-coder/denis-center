// DC — Función "avisos": manda avisos (notificaciones) al celular del superadministrador
//   clave:     devuelve la clave pública para activar los avisos (la crea la primera vez)
//   solicitud: un técnico completó el formulario de invitación -> aviso al superadministrador
//   pedido-clave: un técnico pidió contraseña nueva -> aviso al superadministrador
//   prueba:    aviso de prueba a los celulares del usuario conectado
// Se pega completa en Supabase > Edge Functions > Deploy a new function > Via Editor (nombre: avisos)
// y se desactiva "Verify JWT" (la usan también técnicos que todavía no tienen cuenta).
import { createClient } from 'npm:@supabase/supabase-js@2';

const CONTACTO = 'mailto:deniscenter2026@gmail.com';


const enc = new TextEncoder();

const b64u = {
  enc(bytes) {
    let s = '';
    new Uint8Array(bytes).forEach((b) => { s += String.fromCharCode(b); });
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  },
  dec(str) {
    const b = atob(str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4));
    return Uint8Array.from(b, (c) => c.charCodeAt(0));
  },
};

const unir = (...partes) => {
  const total = partes.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let i = 0;
  for (const p of partes) { out.set(p, i); i += p.length; }
  return out;
};

async function hkdf(salt, ikm, info, bytes) {
  const clave = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, clave, bytes * 8));
}

// Claves VAPID nuevas: { publica (base64url, 65 bytes sin comprimir), privadaJwk }
async function generarClavesVapid() {
  const par = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const publica = new Uint8Array(await crypto.subtle.exportKey('raw', par.publicKey));
  const privadaJwk = await crypto.subtle.exportKey('jwk', par.privateKey);
  return { publica: b64u.enc(publica), privadaJwk };
}

async function firmaVapid(endpoint, privadaJwk, contacto) {
  const aud = new URL(endpoint).origin;
  const cab = b64u.enc(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const cuerpo = b64u.enc(enc.encode(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: contacto })));
  const clave = await crypto.subtle.importKey('jwk', privadaJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const firma = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, clave, enc.encode(`${cab}.${cuerpo}`));
  return `${cab}.${cuerpo}.${b64u.enc(firma)}`;
}

// Cifra el mensaje para una suscripción (aes128gcm, RFC 8291)
async function cifrar(texto, p256dh, auth) {
  const uaPublica = b64u.dec(p256dh);
  const secretoAuth = b64u.dec(auth);
  const par = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPublica = new Uint8Array(await crypto.subtle.exportKey('raw', par.publicKey));
  const uaClave = await crypto.subtle.importKey('raw', uaPublica, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaClave }, par.privateKey, 256));

  const ikm = await hkdf(secretoAuth, ecdh, unir(enc.encode('WebPush: info\0'), uaPublica, asPublica), 32);
  const sal = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(sal, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(sal, ikm, enc.encode('Content-Encoding: nonce\0'), 12);

  const claveAes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const plano = unir(enc.encode(texto), new Uint8Array([2])); // 0x02 = último registro
  const cifrado = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, claveAes, plano));

  const rs = new Uint8Array([0, 0, 16, 0]); // tamaño de registro 4096
  return unir(sal, rs, new Uint8Array([asPublica.length]), asPublica, cifrado);
}

// Envía un aviso. Devuelve el código HTTP del servicio de avisos (201 = enviado; 404/410 = suscripción vencida)
async function enviarAviso(suscripcion, datos, { publica, privadaJwk, contacto, fetchFn = fetch }) {
  const cuerpo = await cifrar(JSON.stringify(datos), suscripcion.p256dh, suscripcion.auth);
  const jwt = await firmaVapid(suscripcion.endpoint, privadaJwk, contacto);
  const resp = await fetchFn(suscripcion.endpoint, {
    method: 'POST',
    headers: {
      Authorization: `vapid t=${jwt}, k=${publica}`,
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: '86400',
      Urgency: 'high',
    },
    body: cuerpo,
  });
  return resp.status;
}

// ---------------------------------------------------------------------
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const responder = (cuerpo, estado = 200) =>
  new Response(JSON.stringify(cuerpo), { status: estado, headers: { ...CORS, 'Content-Type': 'application/json' } });

function claveSecreta() {
  try { const v = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}'); if (v.default) return v.default; } catch { /* sigue */ }
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
}

// Claves VAPID guardadas en la base (tabla privada, solo la lee esta función)
async function clavesVapid(admin) {
  const { data } = await admin.from('config_privada').select('valor').eq('clave', 'vapid').maybeSingle();
  if (data?.valor) return JSON.parse(data.valor);
  const nuevas = await generarClavesVapid();
  const { error } = await admin.from('config_privada').insert({ clave: 'vapid', valor: JSON.stringify(nuevas) });
  if (error) { // otra llamada las creó al mismo tiempo
    const { data: d2 } = await admin.from('config_privada').select('valor').eq('clave', 'vapid').single();
    return JSON.parse(d2.valor);
  }
  return nuevas;
}

async function avisarA(admin, suscripciones, datos) {
  const vapid = await clavesVapid(admin);
  let enviados = 0;
  for (const s of suscripciones) {
    try {
      const estado = await enviarAviso(s, datos, { ...vapid, contacto: CONTACTO });
      if (estado === 404 || estado === 410) await admin.from('suscripciones_push').delete().eq('id', s.id);
      else if (estado < 300) enviados++;
    } catch (e) { console.error('aviso', e); }
  }
  return enviados;
}

async function manejar(req) {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return responder({ error: 'Método no permitido' }, 405);
  const admin = createClient(Deno.env.get('SUPABASE_URL'), claveSecreta(), { auth: { persistSession: false } });
  let cuerpo = {};
  try { cuerpo = await req.json(); } catch { /* vacío */ }

  if (cuerpo.accion === 'clave') {
    const v = await clavesVapid(admin);
    return responder({ clave: v.publica });
  }

  if (cuerpo.accion === 'solicitud') {
    // Solo avisa una vez por invitación, y solo si se completó hace poco
    const { data: inv } = await admin.from('invitaciones').select('*')
      .eq('token', String(cuerpo.token || '')).eq('estado', 'completada').is('avisada_en', null).maybeSingle();
    if (!inv || Date.now() - new Date(inv.completada_en).getTime() > 15 * 60 * 1000) return responder({ ok: true, enviados: 0 });
    await admin.from('invitaciones').update({ avisada_en: new Date().toISOString() }).eq('id', inv.id);
    const { data: supers } = await admin.from('perfiles').select('id').eq('es_superadmin', true).eq('activo', true);
    const ids = (supers || []).map((p) => p.id);
    if (!ids.length) return responder({ ok: true, enviados: 0 });
    const { data: subs } = await admin.from('suscripciones_push').select('*').in('usuario_id', ids);
    const enviados = await avisarA(admin, subs || [], {
      titulo: 'Nueva solicitud en DC',
      cuerpo: `${inv.apellido}, ${inv.nombre}${inv.localidad ? ' (' + inv.localidad + ')' : ''} completó sus datos. Tocá para aprobar.`,
      url: './#/admin',
      etiqueta: 'solicitud-' + inv.id,
    });
    return responder({ ok: true, enviados });
  }

  if (cuerpo.accion === 'pedido-clave') {
    // Un técnico tocó "¿Olvidaste tu contraseña?": avisar una sola vez por pedido reciente
    const email = String(cuerpo.email || '').trim().toLowerCase();
    const { data: perfil } = await admin.from('perfiles').select('id, nombre, negocio_id').ilike('email', email).maybeSingle();
    if (!perfil) return responder({ ok: true, enviados: 0 });
    const hace = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data: pedido } = await admin.from('pedidos_clave').select('id').eq('usuario_id', perfil.id)
      .eq('estado', 'pendiente').is('avisado_en', null).gte('creado_en', hace).maybeSingle();
    if (!pedido) return responder({ ok: true, enviados: 0 });
    await admin.from('pedidos_clave').update({ avisado_en: new Date().toISOString() }).eq('id', pedido.id);
    const { data: neg } = await admin.from('negocios').select('nombre, admin_apellido, admin_nombre').eq('id', perfil.negocio_id).maybeSingle();
    const quien = neg?.admin_apellido ? `${neg.admin_apellido}, ${neg.admin_nombre || ''}` : (perfil.nombre || email);
    const { data: supers } = await admin.from('perfiles').select('id').eq('es_superadmin', true).eq('activo', true);
    const { data: subs } = await admin.from('suscripciones_push').select('*').in('usuario_id', (supers || []).map((p) => p.id));
    const enviados = await avisarA(admin, subs || [], {
      titulo: 'Pedido de contraseña en DC',
      cuerpo: `${quien}${neg?.nombre ? ' (' + neg.nombre + ')' : ''} olvidó su contraseña. Tocá para darle una provisoria.`,
      url: './#/admin',
      etiqueta: 'clave-' + pedido.id,
    });
    return responder({ ok: true, enviados });
  }

  if (cuerpo.accion === 'prueba') {
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    const { data: u } = await admin.auth.getUser(token);
    if (!u?.user) return responder({ error: 'Falta iniciar sesión' }, 401);
    const { data: subs } = await admin.from('suscripciones_push').select('*').eq('usuario_id', u.user.id);
    const enviados = await avisarA(admin, subs || [], {
      titulo: 'DC — Aviso de prueba', cuerpo: '¡Los avisos funcionan en este celular! 🔔', url: './#/admin', etiqueta: 'prueba',
    });
    return responder({ ok: true, enviados });
  }

  return responder({ error: 'Acción desconocida' }, 400);
}

if (typeof Deno !== 'undefined') Deno.serve(manejar);
