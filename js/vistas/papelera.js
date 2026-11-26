// Papelera: lo eliminado se puede recuperar
import { sb } from '../supabase.js';
import { ic } from '../iconos.js';
import { esc, fecha, nombreCompleto, descEquipo, mensajeError } from '../util.js';

// Botón "Eliminar …" para el pie de una ficha. Devuelve HTML; activar con activarEliminar().
export function botonEliminar(texto) {
  return `<div class="zona-peligro"><button class="btn-peligro" type="button" data-eliminar>${ic('basura', 18)} ${esc(texto)}</button></div>`;
}

// Marca como eliminado (no se borra de verdad) y navega a "destino"
export function activarEliminar(app, { tabla, id, pregunta, destino }) {
  app.querySelector('[data-eliminar]')?.addEventListener('click', async (ev) => {
    if (!confirm(pregunta + '\n\nLo podés recuperar desde Ajustes → Papelera.')) return;
    ev.currentTarget.disabled = true;
    const { error } = await sb.from(tabla).update({ eliminado: true }).eq('id', id);
    if (error) { ev.currentTarget.disabled = false; alert(mensajeError(error)); return; }
    location.hash = destino;
  });
}

export async function vistaPapelera(app) {
  const [cli, eq, tr, pr] = await Promise.all([
    sb.from('clientes').select('id, nombre, apellido, dni, actualizado_en').eq('eliminado', true).order('actualizado_en', { ascending: false }).limit(100),
    sb.from('equipos').select('id, tipo, marca, modelo, actualizado_en, clientes(id, nombre, apellido)').eq('eliminado', true).order('actualizado_en', { ascending: false }).limit(100),
    sb.from('trabajos').select('id, estado, fecha_turno, fecha_realizado, trabajo_realizado, falla_reportada, actualizado_en, clientes(id, nombre, apellido)').eq('eliminado', true).order('actualizado_en', { ascending: false }).limit(100),
    sb.from('presupuestos').select('id, numero, trabajo_propuesto, fecha, actualizado_en, clientes(id, nombre, apellido)').eq('eliminado', true).order('actualizado_en', { ascending: false }).limit(100),
  ]);
  const fila = (tabla, id, titulo, sub, cuando) => `
    <div class="fila linea">
      <div style="min-width:0"><div class="titulo">${titulo}</div><div class="sub">${sub} · eliminado el ${esc(fecha(cuando))}</div></div>
      <button class="btn-mini" type="button" data-restaurar="${tabla}" data-id="${esc(id)}">Recuperar</button>
    </div>`;
  const seccion = (titulo, filas) => `<h2>${titulo}</h2>${filas.length ? `<div class="tarjeta">${filas.join('')}</div>` : '<p class="vacio">Nada eliminado.</p>'}`;

  app.innerHTML = `
    <p class="miga"><a href="#/gestion">← Gestión</a></p>
    <h1>Papelera</h1>
    <p class="sub">Lo que eliminás queda acá. Tocá <b>Recuperar</b> para que vuelva a aparecer.</p>
    ${seccion('Clientes', (cli.data || []).map((c) => fila('clientes', c.id, esc(nombreCompleto(c)), c.dni ? 'DNI ' + esc(c.dni) : 'Cliente', c.actualizado_en)))}
    ${seccion('Trabajos y turnos', (tr.data || []).map((t) => fila('trabajos', t.id, esc(nombreCompleto(t.clientes || {})),
      esc([t.estado === 'realizado' ? 'Trabajo del ' + fecha(t.fecha_realizado) : 'Turno ' + (t.fecha_turno ? fecha(t.fecha_turno) : ''), t.trabajo_realizado || t.falla_reportada].filter(Boolean).join(' · ')), t.actualizado_en)))}
    ${pr.error ? '' : seccion('Presupuestos', (pr.data || []).map((p) => fila('presupuestos', p.id, esc(nombreCompleto(p.clientes || {})),
      esc([p.numero ? 'N° ' + String(p.numero).padStart(4, '0') : 'Presupuesto', p.trabajo_propuesto].filter(Boolean).join(' · ')), p.actualizado_en)))}
    ${seccion('Equipos', (eq.data || []).map((e) => fila('equipos', e.id, esc(descEquipo(e)), esc(nombreCompleto(e.clientes || {})), e.actualizado_en)))}
  `;

  app.querySelectorAll('[data-restaurar]').forEach((b) => b.addEventListener('click', async () => {
    b.disabled = true;
    const { error } = await sb.from(b.dataset.restaurar).update({ eliminado: false }).eq('id', b.dataset.id);
    if (error) { b.disabled = false; alert(mensajeError(error)); return; }
    vistaPapelera(app);
  }));
}
