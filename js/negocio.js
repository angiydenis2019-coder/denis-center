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
