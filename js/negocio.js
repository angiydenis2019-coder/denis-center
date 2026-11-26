// Datos del negocio del usuario conectado (cada técnico tiene el suyo).
// Se leen de la tabla "negocios" (versión multi-negocio). Si todavía no se
// ejecutó sql/08, se usa la tabla vieja "negocio" y, si no, config.js.
import { sb, usuarioActual } from './supabase.js';
import { NEGOCIO } from './config.js';

const BASE = { ...NEGOCIO, telefono: null, direccion: null, pie_comprobante: 'Gracias por su confianza.', logo_url: null };
let datos = { ...BASE };
let perfil = null;          // fila de "perfiles" del usuario conectado
let multi = false;          // true si ya se ejecutó sql/08

export const negocio = () => datos;
export const miPerfil = () => perfil;
export const esMultinegocio = () => multi;
export const esSuperadmin = () => !!perfil?.es_superadmin && !!perfil?.activo;
export const negocioSuspendido = () => multi && datos.activo === false;
export const debeCambiarClave = () => !!perfil?.debe_cambiar_clave;
// Logo propio del técnico (si no cargó, el comprobante usa el nombre del negocio)
export const logoNegocio = () => datos.logo_url || null;

export async function cargarNegocio() {
  const user = await usuarioActual();
  if (!user) return { ok: false };
  const { data: yo, error: e1 } = await sb.from('perfiles').select('*').eq('id', user.id).maybeSingle();
  if (e1) return { ok: false, error: e1 };
  perfil = yo;
  if (yo && 'negocio_id' in yo && yo.negocio_id) {
    const { data, error } = await sb.from('negocios').select('*').eq('id', yo.negocio_id).maybeSingle();
    if (!error && data) {
      multi = true;
      datos = { ...BASE, ...data, garantiaDias: NEGOCIO.garantiaDias };
      return { ok: true };
    }
    if (error) return { ok: false, error };
  }
  // Base de datos todavía sin sql/08
  multi = false;
  const { data, error } = await sb.from('negocio').select('*').eq('id', 1).maybeSingle();
  if (!error && data) datos = { ...BASE, ...data, logo_url: 'iconos/logo.png', garantiaDias: NEGOCIO.garantiaDias };
  return { ok: !error && !!data, error };
}

// Guarda los datos del negocio (nombre, alias, logo…)
export async function guardarNegocio(cambios) {
  const { error } = multi
    ? await sb.from('negocios').update(cambios).eq('id', datos.id)
    : await sb.from('negocio').update(cambios).eq('id', 1);
  if (!error) datos = { ...datos, ...cambios };
  return { error };
}

export function actualizarNegocioLocal(nuevos) {
  datos = { ...datos, ...nuevos };
}

export function olvidarNegocio() {
  datos = { ...BASE }; perfil = null; multi = false;
}

// Carpeta de las fotos: cada negocio tiene la suya
export const carpetaNegocio = () => (multi && datos.id ? datos.id + '/' : '');

// ---------------------------------------------------------------------
// Alias / datos para transferir
// ---------------------------------------------------------------------
export const tieneAlias = () => !!(datos.alias || datos.cbu);

export function datosTransferencia() {
  return [
    datos.alias && `Alias: *${datos.alias}*`,
    datos.cbu && `CBU/CVU: ${datos.cbu}`,
    datos.titular && `Titular: ${datos.titular}`,
    datos.banco && `Banco/billetera: ${datos.banco}`,
  ].filter(Boolean).join('\n');
}

// Mensaje para mandar el alias (con monto si se indica)
export function mensajeAlias(nombreCliente, monto = 0) {
  const montoTxt = monto > 0
    ? `\nMonto a transferir: *${new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(monto)}*`
    : '';
  return `Hola ${nombreCliente || ''}, te paso mis datos para transferir:\n\n${datosTransferencia()}${montoTxt}\n\nCuando hagas la transferencia, mandame el comprobante por acá. ¡Gracias! ${datos.tecnico} (${datos.nombre})`
    .replace('Hola ,', 'Hola,');
}

// Botón "Copiar alias": copia al portapapeles y avisa en el mismo botón
export function activarCopiarAlias(boton) {
  boton?.addEventListener('click', async () => {
    const texto = datos.alias || datos.cbu;
    try {
      await navigator.clipboard.writeText(texto);
      const antes = boton.textContent;
      boton.textContent = '✔ Copiado';
      setTimeout(() => { boton.textContent = antes; }, 1500);
    } catch {
      prompt('Copiá tu alias:', texto);
    }
  });
}
