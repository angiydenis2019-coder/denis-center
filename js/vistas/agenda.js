import { sb } from '../supabase.js';
import { esc, pesos, descEquipo } from '../util.js';

// Estado de la agenda (se recuerda mientras la app esté abierta)
let modo = 'dia';           // 'dia' | 'semana'
let base = hoy();           // día que se está mirando

function hoy() { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }
const sumarDias = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
const inicioSemana = (d) => sumarDias(d, -((d.getDay() + 6) % 7)); // lunes
const mismoDia = (a, b) => a.toDateString() === b.toDateString();
const hora = (iso) => new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const fmtDia = new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
const fmtCorto = new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: '2-digit' });

export async function vistaAgenda(app) {
  const desde = modo === 'dia' ? base : inicioSemana(base);
  const dias = modo === 'dia' ? 1 : 7;
  const hasta = sumarDias(desde, dias);

  const [turnos, hechos] = await Promise.all([
    sb.from('trabajos_resumen').select('id, estado, fecha_turno, falla_reportada, cliente_nombre, cliente_apellido, equipo_tipo, equipo_marca, equipo_modelo')
      .eq('estado', 'agendado').gte('fecha_turno', desde.toISOString()).lt('fecha_turno', hasta.toISOString()),
    sb.from('trabajos_resumen').select('id, estado, fecha_realizado, trabajo_realizado, cliente_nombre, cliente_apellido, equipo_tipo, equipo_marca, equipo_modelo, total, saldo')
      .eq('estado', 'realizado').gte('fecha_realizado', desde.toISOString()).lt('fecha_realizado', hasta.toISOString()),
  ]);
  for (const r of [turnos, hechos]) if (r.error) throw r.error;

  const items = [
    ...turnos.data.map((t) => ({ ...t, cuando: t.fecha_turno })),
    ...hechos.data.map((t) => ({ ...t, cuando: t.fecha_realizado })),
  ].sort((a, b) => new Date(a.cuando) - new Date(b.cuando));

  const titulo = modo === 'dia'
    ? fmtDia.format(desde).replace(/^\w/, (c) => c.toUpperCase())
    : `Semana del ${fmtCorto.format(desde)} al ${fmtCorto.format(sumarDias(hasta, -1))}`;

  const bloques = [];
  for (let i = 0; i < dias; i++) {
    const dia = sumarDias(desde, i);
    const delDia = items.filter((t) => mismoDia(new Date(t.cuando), dia));
    const pendientes = delDia.filter((t) => t.estado === 'agendado').length;
    bloques.push(`
      <div class="agenda-dia ${mismoDia(dia, hoy()) ? 'es-hoy' : ''}">
        ${modo === 'semana' ? `
        <div class="fila agenda-cab">
          <button class="btn-texto-azul" data-ir="${dia.toISOString()}">${esc(fmtDia.format(dia).replace(/^\w/, (c) => c.toUpperCase()))}</button>
          <span class="fila"><span class="sub">${pendientes ? pendientes + ' turno' + (pendientes > 1 ? 's' : '') : ''}</span>
            <button class="btn-mini" data-nuevo="${dia.toISOString()}" aria-label="Agregar turno">+ Turno</button></span>
        </div>` : ''}
        ${delDia.length ? delDia.map(itemAgenda).join('') : `<p class="vacio${modo === 'semana' ? ' chico' : ''}">${modo === 'dia' ? 'No hay nada agendado para este día.' : 'Libre'}</p>`}
        ${modo === 'dia' ? `<button class="btn-mas" data-nuevo="${dia.toISOString()}">+ Turno</button>` : ''}
      </div>`);
  }

  app.innerHTML = `
    <div class="fila"><h1>Agenda</h1>
      <div class="segmentado">
        <button data-modo="dia" class="${modo === 'dia' ? 'activo' : ''}">Día</button>
        <button data-modo="semana" class="${modo === 'semana' ? 'activo' : ''}">Semana</button>
      </div>
    </div>
    <div class="fila agenda-nav">
      <button class="btn secundario" data-mover="-1" aria-label="Anterior">‹</button>
      <div class="agenda-titulo">${esc(titulo)}</div>
      <button class="btn secundario" data-mover="1" aria-label="Siguiente">›</button>
    </div>
    ${(modo === 'dia' ? mismoDia(base, hoy()) : mismoDia(inicioSemana(base), inicioSemana(hoy()))) ? '' : '<div class="botones" style="justify-content:center;margin-top:0"><button class="btn-texto-azul" data-hoy>Volver a hoy</button></div>'}
    ${bloques.join('')}
  `;

  const recargar = () => vistaAgenda(app);
  app.querySelectorAll('[data-modo]').forEach((b) => b.addEventListener('click', () => { modo = b.dataset.modo; recargar(); }));
  app.querySelectorAll('[data-mover]').forEach((b) => b.addEventListener('click', () => {
    base = sumarDias(base, Number(b.dataset.mover) * (modo === 'dia' ? 1 : 7)); recargar();
  }));
  app.querySelector('[data-hoy]')?.addEventListener('click', () => { base = hoy(); recargar(); });
  app.querySelectorAll('[data-ir]').forEach((b) => b.addEventListener('click', () => {
    base = new Date(b.dataset.ir); modo = 'dia'; recargar();
  }));
  app.querySelectorAll('[data-nuevo]').forEach((b) => b.addEventListener('click', () => {
    const d = new Date(b.dataset.nuevo);
    const ahora = new Date();
    // Hoy: próxima hora en punto; otro día: 9:00
    if (mismoDia(d, ahora)) d.setHours(Math.min(ahora.getHours() + 1, 23), 0, 0, 0); else d.setHours(9, 0, 0, 0);
    sessionStorage.setItem('dc_fecha_turno', d.toISOString());
    location.hash = '#/trabajo-nuevo';
  }));
}

function itemAgenda(t) {
  const hecho = t.estado === 'realizado';
  return `
    <a class="tarjeta agenda-item ${hecho ? 'hecho' : ''}" href="#/trabajo/${esc(t.id)}">
      <div class="agenda-hora">${esc(hora(t.cuando))}</div>
      <div class="agenda-cuerpo">
        <div class="fila"><span class="titulo">${esc([t.cliente_nombre, t.cliente_apellido].filter(Boolean).join(' '))}</span>
          ${hecho ? `<span class="sub">✔ ${pesos(t.total)}${Number(t.saldo) > 0 ? ' · debe ' + pesos(t.saldo) : ''}</span>` : ''}</div>
        <div class="sub">${esc([descEquipo(t), hecho ? t.trabajo_realizado : t.falla_reportada].filter(Boolean).join(' — '))}</div>
      </div>
    </a>`;
}
