// Recordatorios de mantenimiento: equipos con su último trabajo hace más de N meses
import { sb } from './supabase.js';
import { negocio } from './negocio.js';
import { esc, fecha, descEquipo, linkWhatsApp, mensajeError } from './util.js';

const hoyISO = () => new Date().toISOString().slice(0, 10);
const sumarMeses = (d, n) => { const r = new Date(d); r.setMonth(r.getMonth() + n); return r; };

async function todas(armar) {
  const filas = [];
  for (let i = 0; ; i += 1000) {
    const { data, error } = await armar().range(i, i + 999);
    if (error) throw error;
    filas.push(...data);
    if (data.length < 1000) return filas;
  }
}

export async function equiposParaMantenimiento() {
  const meses = Number(negocio().meses_mantenimiento ?? 12);
  if (!meses) return [];

  const [equipos, hechos, turnos] = await Promise.all([
    todas(() => sb.from('equipos').select('*, clientes(id, nombre, apellido, telefono, eliminado)').eq('eliminado', false)),
    todas(() => sb.from('trabajos').select('equipo_id, fecha_realizado').eq('estado', 'realizado').eq('eliminado', false).not('equipo_id', 'is', null)),
    todas(() => sb.from('trabajos').select('equipo_id').eq('estado', 'agendado').eq('eliminado', false).not('equipo_id', 'is', null)),
  ]);

  const ultimo = {};
  hechos.forEach((t) => { if (!ultimo[t.equipo_id] || t.fecha_realizado > ultimo[t.equipo_id]) ultimo[t.equipo_id] = t.fecha_realizado; });
  const conTurno = new Set(turnos.map((t) => t.equipo_id));
  const hoy = new Date();

  return equipos
    .filter((e) => ultimo[e.id] && !conTurno.has(e.id) && e.clientes && !e.clientes.eliminado)
    .filter((e) => !e.recordatorio_hasta || e.recordatorio_hasta <= hoyISO())
    .map((e) => ({ ...e, ultimo: ultimo[e.id] }))
    .filter((e) => sumarMeses(new Date(e.ultimo), meses) <= hoy)
    .sort((a, b) => a.ultimo.localeCompare(b.ultimo)); // los más viejos primero
}

const mesesDesde = (iso) => {
  const d = new Date(iso), h = new Date();
  return (h.getFullYear() - d.getFullYear()) * 12 + h.getMonth() - d.getMonth();
};

// Sección para Inicio
export async function montarRecordatorios(caja) {
  let lista;
  try { lista = await equiposParaMantenimiento(); } catch (err) { console.warn('Recordatorios:', err); caja.hidden = true; return; }
  if (!lista.length) { caja.hidden = true; return; }
  let verTodos = false;
  const n = negocio();

  const pintar = () => {
    const mostrar = verTodos ? lista : lista.slice(0, 3);
    caja.hidden = false;
    caja.innerHTML = `
      <h2>🔔 Mantenimientos para ofrecer <span class="sub">(${lista.length})</span></h2>
      ${mostrar.map((e) => {
        const c = e.clientes;
        const mensaje = `Hola ${c.nombre}, te escribe ${n.tecnico} (${n.nombre}). Hace ${mesesDesde(e.ultimo)} meses le hicimos un trabajo a tu ${[e.tipo?.toLowerCase(), e.marca, e.modelo].filter(Boolean).join(' ') || 'equipo'}. ¿Querés que coordinemos un mantenimiento para que siga funcionando bien?`;
        const wa = linkWhatsApp(c.telefono, mensaje);
        return `
        <div class="tarjeta recordatorio" data-id="${esc(e.id)}">
          <a class="titulo" href="#/equipo/${esc(e.id)}">${esc([c.nombre, c.apellido].filter(Boolean).join(' '))} · ${esc(descEquipo(e))}</a>
          <div class="sub">Último trabajo hace ${mesesDesde(e.ultimo)} meses (${esc(fecha(e.ultimo))})${e.ubicacion ? ' · ' + esc(e.ubicacion) : ''}</div>
          <div class="botones chicos">
            ${wa ? `<a class="btn whatsapp" href="${esc(wa)}" target="_blank" rel="noopener">💬 Ofrecer</a>` : ''}
            <a class="btn secundario" href="#/trabajo-nuevo/${esc(c.id)}/${esc(e.id)}">📅 Agendar</a>
            <button class="btn secundario" data-posponer="3">⏰ 3 meses</button>
            <button class="btn-quitar" data-posponer="nunca" title="No recordar más este equipo">✕</button>
          </div>
        </div>`;
      }).join('')}
      ${lista.length > 3 ? `<button class="btn-texto-azul" data-ver>${verTodos ? 'Ver menos' : `Ver los ${lista.length}`}</button>` : ''}`;

    caja.querySelector('[data-ver]')?.addEventListener('click', () => { verTodos = !verTodos; pintar(); });
    caja.querySelectorAll('[data-posponer]').forEach((b) => b.addEventListener('click', async () => {
      const id = b.closest('[data-id]').dataset.id;
      const nunca = b.dataset.posponer === 'nunca';
      if (nunca && !confirm('¿No recordar más este equipo?')) return;
      const hasta = nunca ? '2999-12-31' : sumarMeses(new Date(), 3).toISOString().slice(0, 10);
      const { error } = await sb.from('equipos').update({ recordatorio_hasta: hasta }).eq('id', id);
      if (error) return alert(mensajeError(error));
      lista = lista.filter((e) => e.id !== id);
      if (!lista.length) { caja.hidden = true; return; }
      pintar();
    }));
  };
  pintar();
}
