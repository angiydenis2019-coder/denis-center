// Datos del negocio: se leen de la base (tabla "negocio") y, si todavía
// no existe, se usan los de config.js. Se usan en mensajes y comprobantes.
import { sb } from './supabase.js';
import { NEGOCIO } from './config.js';

let datos = { ...NEGOCIO, telefono: null, direccion: null, pie_comprobante: 'Gracias por su confianza.' };

export const negocio = () => datos;

export async function cargarNegocio() {
  const { data, error } = await sb.from('negocio').select('*').eq('id', 1).maybeSingle();
  if (!error && data) datos = { ...datos, ...data, garantiaDias: NEGOCIO.garantiaDias };
  return { ok: !error && !!data, error };
}

export function actualizarNegocioLocal(nuevos) {
  datos = { ...datos, ...nuevos };
}
