// DC — Función "admin-usuarios" (solo la usa el superadministrador)
//   crear:       crea el negocio + el usuario del técnico con una contraseña provisoria
//   restablecer: le da una contraseña provisoria nueva a un técnico que se la olvidó
// Se pega completa en Supabase > Edge Functions > Deploy a new function > Via Editor
// La clave secreta NUNCA está en la app: Supabase se la da a esta función automáticamente.
import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const responder = (cuerpo, estado = 200) =>
  new Response(JSON.stringify(cuerpo), { status: estado, headers: { ...CORS, 'Content-Type': 'application/json' } });

function claveSecreta() {
  try {
    const varias = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}');
    if (varias.default) return varias.default;
  } catch { /* sigue */ }
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
}
function clavePublica() {
  try {
    const varias = JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') || '{}');
    if (varias.default) return varias.default;
  } catch { /* sigue */ }
  return Deno.env.get('SUPABASE_ANON_KEY');
}

// Contraseña provisoria fácil de dictar: sin letras que se confunden (0/O, 1/l)
function claveProvisoria() {
  const letras = 'abcdefghjkmnpqrstuvwxyz';
  const numeros = '23456789';
  const r = new Uint32Array(8);
  crypto.getRandomValues(r);
  let s = '';
  for (let i = 0; i < 4; i++) s += letras[r[i] % letras.length];
  s += '-';
  for (let i = 4; i < 8; i++) s += numeros[r[i] % numeros.length];
  return s.charAt(0).toUpperCase() + s.slice(1); // ej: Kmtr-4827
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return responder({ error: 'Método no permitido' }, 405);

  const url = Deno.env.get('SUPABASE_URL');
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return responder({ error: 'Falta iniciar sesión' }, 401);

  // 1) ¿Quién llama? Tiene que ser el superadministrador
  const comoUsuario = createClient(url, clavePublica(), {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
  const { data: u, error: eu } = await comoUsuario.auth.getUser(token);
  if (eu || !u?.user) return responder({ error: 'Sesión vencida. Salí y volvé a entrar.' }, 401);
  const { data: esSuper, error: es } = await comoUsuario.rpc('es_superadmin');
  if (es || !esSuper) return responder({ error: 'Solo el superadministrador puede hacer esto' }, 403);

  const admin = createClient(url, claveSecreta(), { auth: { persistSession: false } });
  let cuerpo = {};
  try { cuerpo = await req.json(); } catch { /* vacío */ }

  // 2) Crear técnico nuevo
  if (cuerpo.accion === 'crear') {
    const email = String(cuerpo.email || '').trim().toLowerCase();
    const nombre = String(cuerpo.nombre || '').trim();
    const negocio = String(cuerpo.negocio || '').trim() || nombre;
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return responder({ error: 'El correo no es válido' }, 400);
    if (!nombre) return responder({ error: 'Falta el nombre del técnico' }, 400);

    const { data: neg, error: en } = await admin.from('negocios')
      .insert({ nombre: negocio, tecnico: nombre, telefono: cuerpo.telefono || null })
      .select('id').single();
    if (en) return responder({ error: 'No se pudo crear el negocio: ' + en.message }, 500);

    const clave = claveProvisoria();
    const { data: nuevo, error: ec } = await admin.auth.admin.createUser({
      email, password: clave, email_confirm: true,
      user_metadata: { nombre, negocio_id: neg.id },
    });
    if (ec) {
      await admin.from('negocios').delete().eq('id', neg.id);
      const msg = /already|registered|exists/i.test(ec.message) ? 'Ya existe un usuario con ese correo' : ec.message;
      return responder({ error: msg }, 400);
    }
    return responder({ ok: true, negocio_id: neg.id, usuario_id: nuevo.user.id, email, clave });
  }

  // 3) Contraseña provisoria nueva
  if (cuerpo.accion === 'restablecer') {
    const id = String(cuerpo.usuario_id || '');
    if (id === u.user.id) return responder({ error: 'Tu propia contraseña cambiala desde Ajustes' }, 400);
    const clave = claveProvisoria();
    const { error: er } = await admin.auth.admin.updateUserById(id, { password: clave });
    if (er) return responder({ error: er.message }, 400);
    await admin.from('perfiles').update({ debe_cambiar_clave: true }).eq('id', id);
    return responder({ ok: true, clave });
  }

  return responder({ error: 'Acción desconocida' }, 400);
});
