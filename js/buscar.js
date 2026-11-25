// Búsqueda de clientes por nombre, apellido, DNI, teléfono, dirección o equipo
import { sb } from './supabase.js';
import { esc, descEquipo } from './util.js';

// Sin mayúsculas ni tildes
export const normalizar = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const soloDigitos = (s) => String(s ?? '').replace(/\D/g, '');

// Trae clientes y equipos y arma el texto donde se busca
export async function cargarIndice() {
  const [cli, eq] = await Promise.all([
    sb.from('clientes').select('id, nombre, apellido, dni, telefono, direccion')
      .eq('eliminado', false).order('apellido').order('nombre'),
    sb.from('equipos').select('cliente_id, tipo, marca, modelo, numero_serie, ubicacion').eq('eliminado', false),
  ]);
  if (cli.error) throw cli.error;
  const equiposPorCliente = {};
  (eq.data || []).forEach((e) => (equiposPorCliente[e.cliente_id] ||= []).push(e));

  return cli.data.map((c) => {
    const equipos = equiposPorCliente[c.id] || [];
    return {
      ...c,
      equipos,
      textoCliente: normalizar([c.nombre, c.apellido, c.dni, c.telefono, c.direccion].join(' '))
        + ' ' + soloDigitos(c.dni) + ' ' + soloDigitos(c.telefono),
      textosEquipos: equipos.map((e) => normalizar([e.tipo, e.marca, e.modelo, e.numero_serie, e.ubicacion].join(' '))),
    };
  });
}

// Cada palabra escrita tiene que aparecer (en cualquier orden)
export function filtrar(indice, texto) {
  const palabras = normalizar(texto).trim().split(/\s+/).filter(Boolean);
  if (!palabras.length) return indice.map((c) => ({ c, equipo: null }));
  const resultado = [];
  for (const c of indice) {
    const todo = c.textoCliente + ' ' + c.textosEquipos.join(' ');
    if (!palabras.every((p) => todo.includes(p))) continue;
    // Si alguna palabra solo coincide con un equipo, lo mostramos como pista
    const porEquipo = palabras.some((p) => !c.textoCliente.includes(p));
    const equipo = porEquipo ? c.equipos.find((e, i) => palabras.some((p) => c.textosEquipos[i].includes(p))) : null;
    resultado.push({ c, equipo });
  }
  return resultado;
}

export function tarjetaCliente({ c, equipo }) {
  return `
    <a class="tarjeta" href="#/cliente/${esc(c.id)}">
      <div class="titulo">${esc(c.apellido)}${c.apellido ? ', ' : ''}${esc(c.nombre)}</div>
      <div class="sub">${[c.dni && 'DNI ' + esc(c.dni), c.telefono && '📞 ' + esc(c.telefono), esc(c.direccion)].filter(Boolean).join(' · ')}</div>
      ${equipo ? `<div class="sub pista">🔧 ${esc([descEquipo(equipo), equipo.numero_serie && 'N° ' + equipo.numero_serie].filter(Boolean).join(' · '))}</div>` : ''}
    </a>`;
}
