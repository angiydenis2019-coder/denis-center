import { botonEliminar, activarEliminar } from './papelera.js';
import { sb, usuarioActual } from '../supabase.js';
import { ic } from '../iconos.js';
import { negocio } from '../negocio.js';
import { cargarPrecios, datalistRepuestos, precioDe } from './precios.js';
import { esc, pesos, fecha, nombreCompleto, descEquipo, linkWhatsApp, mensajeError } from '../util.js';

const ESTADOS = { borrador: 'Borrador', enviado: 'Enviado', aceptado: 'Aceptado', rechazado: 'Rechazado' };
const CLASE = { borrador: 'vencida', enviado: 'agendado', aceptado: 'pagado', rechazado: 'debe' };

const sumarDias = (iso, n) => { const d = new Date(iso); d.setDate(d.getDate() + n); return d; };
const vence = (p) => sumarDias(p.fecha, Number(p.validez_dias) || 15);
const vencido = (p) => p.estado === 'enviado' && vence(p) < new Date();
const numeroTxt = (p) => (p.numero ? `N° ${String(p.numero).padStart(4, '0')}` : 'sin número aún');
const totalDe = (p, items) => Number(p.mano_obra || 0) + items.reduce((a, i) => a + Number(i.cantidad) * Number(i.precio_unitario), 0);

export function etiquetaPresupuesto(p) {
  return vencido(p) ? '<span class="etiqueta vencida">Vencido</span>'
    : `<span class="etiqueta ${CLASE[p.estado]}">${ESTADOS[p.estado]}</span>`;
}

async function itemsDe(ids) {
  if (!ids.length) return [];
  const { data, error } = await sb.from('presupuesto_items').select('presupuesto_id, cantidad, precio_unitario')
    .in('presupuesto_id', ids).eq('eliminado', false);
  if (error) throw error;
  return data;
}

// Tarjeta para listas (con total)
function tarjeta(p, items, conCliente = true) {
  const total = totalDe(p, items.filter((i) => i.presupuesto_id === p.id));
  return `
    <a class="tarjeta" href="#/presupuesto/${esc(p.id)}">
      <div class="fila"><span class="titulo">${conCliente && p.clientes ? esc(nombreCompleto(p.clientes)) : esc(numeroTxt(p))}</span><strong>${pesos(total)}</strong></div>
      <div class="sub">${esc([conCliente ? numeroTxt(p) : null, fecha(p.fecha), p.trabajo_propuesto].filter(Boolean).join(' · '))}</div>
      <div class="etiquetas" style="margin-bottom:0">${etiquetaPresupuesto(p)}</div>
    </a>`;
}

// ---------------------------------------------------------------------
// LISTA (#/presupuestos)
// ---------------------------------------------------------------------
let filtro = 'pendientes';
export async function vistaPresupuestos(app) {
  const { data: todos, error } = await sb.from('presupuestos').select('*, clientes(id, nombre, apellido, eliminado)')
    .eq('eliminado', false).order('fecha', { ascending: false }).limit(300);
  const data = (todos || []).filter((p) => !p.clientes?.eliminado);
  if (error) {
    app.innerHTML = `<h1>Presupuestos</h1><div class="tarjeta banner aviso-sql">${ic('alerta', 18)} Falta ejecutar <b>sql/05_presupuestos.sql</b> en Supabase.</div>`;
    return;
  }
  const items = await itemsDe(data.map((p) => p.id));
  const filtros = {
    pendientes: (p) => p.estado === 'borrador' || p.estado === 'enviado',
    aceptado: (p) => p.estado === 'aceptado',
    rechazado: (p) => p.estado === 'rechazado',
    todos: () => true,
  };
  const lista = data.filter(filtros[filtro]);

  app.innerHTML = `
    <div class="fila"><h1>Presupuestos</h1></div>
    <div class="segmentado ancho-seg">
      ${[['pendientes', 'Pendientes'], ['aceptado', 'Aceptados'], ['rechazado', 'Rechazados'], ['todos', 'Todos']]
        .map(([k, v]) => `<button data-filtro="${k}" class="${filtro === k ? 'activo' : ''}">${v}</button>`).join('')}
    </div>
    <p class="sub">Para hacer uno nuevo, entrá a la ficha del cliente y tocá <b>Presupuesto</b>.</p>
    ${lista.length ? lista.map((p) => tarjeta(p, items)).join('') : '<p class="vacio">No hay presupuestos acá.</p>'}`;
  app.querySelectorAll('[data-filtro]').forEach((b) => b.addEventListener('click', () => { filtro = b.dataset.filtro; vistaPresupuestos(app); }));
}

// Sección en la ficha del cliente
export async function montarPresupuestosCliente(caja, clienteId) {
  const { data, error } = await sb.from('presupuestos').select('*').eq('cliente_id', clienteId).eq('eliminado', false)
    .order('fecha', { ascending: false });
  if (error) { caja.innerHTML = ''; return; }
  const items = await itemsDe(data.map((p) => p.id)).catch(() => []);
  caja.innerHTML = data.length ? data.map((p) => tarjeta(p, items, false)).join('') : '<p class="vacio">Sin presupuestos.</p>';
}

// Sección en Inicio: enviados esperando respuesta
export async function montarPresupuestosInicio(caja) {
  const { data: todos, error } = await sb.from('presupuestos').select('*, clientes(id, nombre, apellido, eliminado)')
    .eq('estado', 'enviado').eq('eliminado', false).order('fecha', { ascending: true });
  const data = (todos || []).filter((p) => !p.clientes?.eliminado);
  if (error || !data.length) { caja.hidden = true; return; }
  const items = await itemsDe(data.map((p) => p.id)).catch(() => []);
  caja.hidden = false;
  caja.innerHTML = `<h2>${ic('editar')} Presupuestos esperando respuesta <span class="sub">(${data.length})</span></h2>
    ${data.slice(0, 3).map((p) => tarjeta(p, items)).join('')}
    ${data.length > 3 ? '<a class="btn-texto-azul" href="#/presupuestos">Ver todos</a>' : ''}`;
}

// ---------------------------------------------------------------------
// DETALLE (#/presupuesto/<id>)
// ---------------------------------------------------------------------
export async function vistaPresupuestoDetalle(app, id) {
  const [pr, it] = await Promise.all([
    sb.from('presupuestos').select('*').eq('id', id).maybeSingle(),
    sb.from('presupuesto_items').select('*').eq('presupuesto_id', id).eq('eliminado', false).order('creado_en'),
  ]);
  if (pr.error) throw pr.error;
  const p = pr.data;
  if (!p) { app.innerHTML = '<p class="vacio">Presupuesto no encontrado.</p>'; return; }
  const items = it.data || [];
  const [cli, eq] = await Promise.all([
    sb.from('clientes').select('*').eq('id', p.cliente_id).maybeSingle(),
    p.equipo_id ? sb.from('equipos').select('*').eq('id', p.equipo_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const c = cli.data || {};
  const equipo = eq.data;
  const total = totalDe(p, items);
  const wa = linkWhatsApp(c.telefono, textoPresupuesto(p, items, c, equipo, total));
  const abierto = p.estado === 'borrador' || p.estado === 'enviado';

  app.innerHTML = `
    <p class="miga"><a href="#/cliente/${esc(c.id)}">← ${esc(nombreCompleto(c))}</a></p>
    <h1>Presupuesto ${esc(numeroTxt(p))}</h1>
    <div class="etiquetas">${etiquetaPresupuesto(p)} <span class="etiqueta vencida">Válido hasta ${esc(fecha(vence(p).toISOString()))}</span></div>

    <div class="tarjeta">
      <div class="dato"><b>Fecha</b> ${esc(fecha(p.fecha))}</div>
      ${equipo ? `<div class="dato"><b>Equipo</b> <a href="#/equipo/${esc(equipo.id)}">${esc(descEquipo(equipo))}</a></div>` : ''}
      ${p.trabajo_propuesto ? `<div class="dato"><b>Trabajo</b> ${esc(p.trabajo_propuesto)}</div>` : ''}
      ${p.notas ? `<div class="dato"><b>Notas</b> ${esc(p.notas)}</div>` : ''}
    </div>

    <div class="tarjeta">
      ${items.map((i) => `<div class="fila linea"><span>${esc(i.descripcion)} <span class="sub">× ${Number(i.cantidad)}</span></span><span>${pesos(i.cantidad * i.precio_unitario)}</span></div>`).join('')}
      <div class="fila linea"><span>Mano de obra</span><span>${pesos(p.mano_obra)}</span></div>
      <div class="fila linea total"><span>Total</span><span>${pesos(total)}</span></div>
    </div>

    <div class="botones">
      ${wa && p.estado !== 'rechazado' ? `<a class="btn whatsapp" id="btn-enviar" href="${esc(wa)}" target="_blank" rel="noopener">${ic('chat', 18)} ${p.estado === 'borrador' ? 'Enviar por WhatsApp' : 'Reenviar'}</a>` : ''}
      ${abierto ? `<a class="btn secundario" href="#/presupuesto-editar/${esc(p.id)}">${ic('editar', 18)} Editar</a>` : ''}
    </div>
    ${abierto ? `
    <div class="tarjeta">
      <p style="margin-top:0"><b>¿Qué respondió el cliente?</b></p>
      <div class="botones" style="margin-bottom:0">
        <button class="btn" id="btn-aceptar" type="button">${ic('check', 18)} Aceptó · crear trabajo</button>
        <button class="btn secundario" id="btn-rechazar" type="button">${ic('cerrar', 18)} No aceptó</button>
      </div>
    </div>` : ''}
    ${p.estado === 'aceptado' && p.trabajo_id ? `<div class="botones"><a class="btn" href="#/trabajo/${esc(p.trabajo_id)}">Ver el trabajo</a></div>` : ''}
    ${p.estado === 'rechazado' ? '<div class="botones"><button class="btn secundario" id="btn-reabrir" type="button">Volver a pendiente</button></div>' : ''}
    <p id="p-error" class="error" hidden></p>
    ${botonEliminar('Eliminar presupuesto')}`;

  activarEliminar(app, { tabla: 'presupuestos', id, destino: `#/cliente/${p.cliente_id}`,
    pregunta: `¿Eliminar el presupuesto ${numeroTxt(p)}?${p.trabajo_id ? ' El trabajo que se creó desde él no se elimina.' : ''}` });
  const error = app.querySelector('#p-error');
  const fallo = (err) => { error.textContent = mensajeError(err); error.hidden = false; };
  const recargar = () => vistaPresupuestoDetalle(app, id);

  // Al enviarlo por WhatsApp queda marcado como "Enviado"
  app.querySelector('#btn-enviar')?.addEventListener('click', () => {
    if (p.estado !== 'borrador') return;
    sb.from('presupuestos').update({ estado: 'enviado' }).eq('id', id).then(() => setTimeout(recargar, 600));
  });

  app.querySelector('#btn-rechazar')?.addEventListener('click', async () => {
    if (!confirm('¿Marcar el presupuesto como no aceptado?')) return;
    const { error: err } = await sb.from('presupuestos').update({ estado: 'rechazado' }).eq('id', id);
    err ? fallo(err) : recargar();
  });
  app.querySelector('#btn-reabrir')?.addEventListener('click', async () => {
    const { error: err } = await sb.from('presupuestos').update({ estado: 'enviado' }).eq('id', id);
    err ? fallo(err) : recargar();
  });

  // Aceptado: crea el trabajo (con sus repuestos) y abre el formulario para ponerle fecha
  app.querySelector('#btn-aceptar')?.addEventListener('click', async (ev) => {
    ev.currentTarget.disabled = true;
    const user = await usuarioActual();
    const trabajoId = crypto.randomUUID();
    let { error: err } = await sb.from('trabajos').insert({
      id: trabajoId, cliente_id: p.cliente_id, equipo_id: p.equipo_id, tecnico_id: user?.id,
      estado: 'agendado', falla_reportada: p.trabajo_propuesto, mano_obra: Number(p.mano_obra) || 0,
      notas: `Presupuesto ${numeroTxt(p)} aceptado.${p.notas ? ' ' + p.notas : ''}`,
    });
    if (!err && items.length) {
      ({ error: err } = await sb.from('repuestos').insert(items.map((i) => ({
        id: crypto.randomUUID(), trabajo_id: trabajoId, descripcion: i.descripcion,
        cantidad: Number(i.cantidad), precio_unitario: Number(i.precio_unitario),
      }))));
    }
    if (!err) ({ error: err } = await sb.from('presupuestos').update({ estado: 'aceptado', trabajo_id: trabajoId }).eq('id', id));
    if (err) { ev.currentTarget.disabled = false; fallo(err); return; }
    location.hash = `#/trabajo-editar/${trabajoId}`;
  });
}

function textoPresupuesto(p, items, c, equipo, total) {
  const n = negocio();
  const l = [
    `*${n.nombre}* — Presupuesto ${numeroTxt(p).replace('sin número aún', '')}`.trim(),
    `Cliente: ${nombreCompleto(c)}`,
    `Fecha: ${fecha(p.fecha)}`,
  ];
  if (equipo) l.push(`Equipo: ${descEquipo(equipo)}`);
  if (p.trabajo_propuesto) l.push(`Trabajo: ${p.trabajo_propuesto}`);
  l.push('', 'Detalle:');
  items.forEach((i) => l.push(`• ${i.descripcion} x${Number(i.cantidad)}: ${pesos(i.cantidad * i.precio_unitario)}`));
  if (Number(p.mano_obra) > 0) l.push(`• Mano de obra: ${pesos(p.mano_obra)}`);
  l.push(`*Total: ${pesos(total)}*`, `Válido hasta el ${fecha(vence(p).toISOString())}.`);
  if (p.notas) l.push('', p.notas);
  l.push('', 'Para confirmar, respondé este mensaje. ¡Gracias!');
  l.push([n.tecnico, n.telefono && `Tel. ${n.telefono}`].filter(Boolean).join(' · '));
  return l.join('\n');
}

// ---------------------------------------------------------------------
// FORMULARIO (#/presupuesto-nuevo/<clienteId>[/<equipoId>]  y  #/presupuesto-editar/<id>)
// ---------------------------------------------------------------------
export async function vistaPresupuestoFormulario(app, { id = null, clienteId = null, equipoId = null }) {
  let p = { cliente_id: clienteId, equipo_id: equipoId, validez_dias: 15, trabajo_propuesto: '', mano_obra: 0, notas: '' };
  let itemsPrevios = [];
  if (id) {
    const [pr, it] = await Promise.all([
      sb.from('presupuestos').select('*').eq('id', id).maybeSingle(),
      sb.from('presupuesto_items').select('*').eq('presupuesto_id', id).eq('eliminado', false).order('creado_en'),
    ]);
    if (pr.error) throw pr.error;
    if (!pr.data) { app.innerHTML = '<p class="vacio">Presupuesto no encontrado.</p>'; return; }
    p = pr.data; itemsPrevios = it.data || [];
  }
  const [{ data: c }, { data: equipos }, precios] = await Promise.all([
    sb.from('clientes').select('id, nombre, apellido').eq('id', p.cliente_id).maybeSingle(),
    sb.from('equipos').select('id, tipo, marca, modelo, ubicacion').eq('cliente_id', p.cliente_id).eq('eliminado', false).order('creado_en'),
    cargarPrecios(),
  ]);
  const servicios = precios.filter((x) => x.tipo === 'servicio');
  const v = (k) => esc(p[k] ?? '');

  app.innerHTML = `
    <p class="miga"><a href="${id ? '#/presupuesto/' + esc(id) : '#/cliente/' + esc(p.cliente_id)}">← Volver</a></p>
    <h1>${id ? 'Editar presupuesto' : 'Nuevo presupuesto'}</h1>
    <p class="sub">Cliente: <b>${esc(nombreCompleto(c || {}))}</b></p>
    <form id="f-pres" class="tarjeta">
      <label for="equipo_id">Equipo</label>
      <select id="equipo_id" name="equipo_id">
        <option value="">— Sin equipo / trabajo general —</option>
        ${(equipos || []).map((e) => `<option value="${esc(e.id)}" ${e.id === p.equipo_id ? 'selected' : ''}>${esc([descEquipo(e), e.ubicacion].filter(Boolean).join(' · '))}</option>`).join('')}
      </select>

      ${servicios.length ? `<label for="servicio-lista">Agregar servicio de la lista</label>
      <select id="servicio-lista"><option value="">— Elegir —</option>${servicios.map((s) => `<option value="${esc(s.id)}">${esc(s.descripcion)} · ${pesos(s.precio)}</option>`).join('')}</select>` : ''}

      <label for="trabajo_propuesto">Trabajo a realizar</label>
      <textarea id="trabajo_propuesto" name="trabajo_propuesto" placeholder="Ej: cambio de compresor y carga de gas">${v('trabajo_propuesto')}</textarea>

      <label>Repuestos / materiales</label>
      ${datalistRepuestos('dl-pres', precios)}
      <div id="filas-rep"></div>
      <button type="button" class="btn-mas" id="mas-rep">+ Agregar repuesto</button>

      <label for="mano_obra">Mano de obra ($)</label>
      <input id="mano_obra" name="mano_obra" type="number" min="0" step="any" value="${Number(p.mano_obra) || ''}">

      <div class="tarjeta total-form"><div class="fila"><span>Total del presupuesto</span><b id="total-form">$ 0</b></div></div>

      <label for="validez_dias">Válido por (días)</label>
      <input id="validez_dias" name="validez_dias" type="number" min="1" max="365" value="${Number(p.validez_dias) || 15}">
      <label for="notas">Notas para el cliente <span class="ayuda">— ej: incluye garantía de 90 días</span></label>
      <textarea id="notas" name="notas">${v('notas')}</textarea>

      <div class="botones">
        <button class="btn" type="submit">${ic('check', 18)} Guardar</button>
        <a class="btn secundario" href="${id ? '#/presupuesto/' + esc(id) : '#/cliente/' + esc(p.cliente_id)}">Cancelar</a>
      </div>
      <p id="f-error" class="error" hidden></p>
    </form>`;

  const form = app.querySelector('#f-pres');
  const filas = form.querySelector('#filas-rep');
  const leer = () => [...filas.querySelectorAll('.fila-rep')].map((f) => ({
    descripcion: f.querySelector('.r-desc').value.trim(),
    cantidad: Number(f.querySelector('.r-cant').value) || 1,
    precio_unitario: Number(f.querySelector('.r-precio').value) || 0,
  })).filter((r) => r.descripcion);
  const calcular = () => {
    form.querySelector('#total-form').textContent = pesos((Number(form.mano_obra.value) || 0)
      + leer().reduce((a, r) => a + r.cantidad * r.precio_unitario, 0));
  };
  function fila(r = {}) {
    const d = document.createElement('div');
    d.className = 'fila-rep';
    d.innerHTML = `
      <input class="r-desc" placeholder="Repuesto (ej: capacitor 35uF)" list="dl-pres" autocomplete="off" aria-label="Repuesto" value="${esc(r.descripcion ?? '')}">
      <input class="r-cant" type="number" min="0.01" step="any" value="${Number(r.cantidad) || 1}" aria-label="Cantidad">
      <input class="r-precio" type="number" min="0" step="any" placeholder="Precio c/u $" aria-label="Precio unitario" value="${r.precio_unitario != null ? Number(r.precio_unitario) : ''}">
      <button type="button" class="btn-quitar" aria-label="Quitar">${ic('cerrar', 18)}</button>`;
    d.querySelector('.r-desc').addEventListener('input', (e) => {
      const precio = precioDe(precios, e.target.value);
      if (precio !== undefined) d.querySelector('.r-precio').value = Number(precio);
      calcular();
    });
    d.querySelectorAll('input').forEach((i) => i.addEventListener('input', calcular));
    d.querySelector('.btn-quitar').addEventListener('click', () => { d.remove(); calcular(); });
    filas.appendChild(d);
    return d;
  }
  itemsPrevios.forEach((r) => fila(r));
  form.querySelector('#mas-rep').addEventListener('click', () => fila().querySelector('.r-desc').focus());
  form.mano_obra.addEventListener('input', calcular);
  form.querySelector('#servicio-lista')?.addEventListener('change', (e) => {
    const s = servicios.find((x) => x.id === e.target.value);
    if (!s) return;
    const ta = form.trabajo_propuesto;
    ta.value = ta.value.trim() ? ta.value.trim() + ', ' + s.descripcion : s.descripcion;
    form.mano_obra.value = (Number(form.mano_obra.value) || 0) + Number(s.precio);
    e.target.value = '';
    calcular();
  });
  calcular();

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const boton = form.querySelector('button[type=submit]');
    const error = form.querySelector('#f-error');
    boton.disabled = true; error.hidden = true;
    const datos = {
      equipo_id: form.equipo_id.value || null,
      trabajo_propuesto: form.trabajo_propuesto.value.trim() || null,
      mano_obra: Number(form.mano_obra.value) || 0,
      validez_dias: Number(form.validez_dias.value) || 15,
      notas: form.notas.value.trim() || null,
    };
    const presId = id || crypto.randomUUID();
    let err;
    if (id) {
      ({ error: err } = await sb.from('presupuestos').update(datos).eq('id', id));
      // Los ítems se reemplazan: se marcan los anteriores y se cargan los actuales
      if (!err && itemsPrevios.length) ({ error: err } = await sb.from('presupuesto_items').update({ eliminado: true }).eq('presupuesto_id', id));
    } else {
      const user = await usuarioActual();
      ({ error: err } = await sb.from('presupuestos').insert({ id: presId, cliente_id: p.cliente_id, tecnico_id: user?.id, ...datos }));
    }
    const nuevos = leer().map((r) => ({ id: crypto.randomUUID(), presupuesto_id: presId, ...r }));
    if (!err && nuevos.length) ({ error: err } = await sb.from('presupuesto_items').insert(nuevos));
    boton.disabled = false;
    if (err) { error.textContent = /presupuesto/.test(err.message || '') && /exist|relation/.test(err.message || '')
      ? 'Falta ejecutar sql/05_presupuestos.sql en Supabase.' : mensajeError(err); error.hidden = false; return; }
    location.hash = '#/presupuesto/' + presId;
  });
}
