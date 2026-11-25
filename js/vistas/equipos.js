import { ic } from '../iconos.js';
import { sb } from '../supabase.js';
import { montarFotos } from '../fotos.js';
import {
  esc, fecha, fechaHora, pesos, nombreCompleto, datosFormulario, descEquipo,
  etiquetaCobro, etiquetaGarantia, mensajeError, TIPOS_EQUIPO,
} from '../util.js';

// ---------------------------------------------------------------------
// FICHA DEL EQUIPO: datos, garantía vigente e historial
// ---------------------------------------------------------------------
export async function vistaEquipoFicha(app, id) {
  const { data: e, error } = await sb.from('equipos').select('*, clientes(id, nombre, apellido)').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!e || e.eliminado) { app.innerHTML = '<p class="vacio">Equipo no encontrado.</p>'; return; }

  const { data: trabajos, error: err2 } = await sb.from('trabajos_resumen').select('*').eq('equipo_id', id)
    .order('fecha_realizado', { ascending: false, nullsFirst: true }).order('fecha_turno', { ascending: false });
  if (err2) throw err2;

  const ultimo = trabajos.find((t) => t.estado === 'realizado');
  const garantia = !ultimo
    ? '<p class="vacio">Sin trabajos realizados todavía.</p>'
    : ultimo.en_garantia
      ? `<div class="tarjeta banner ok">${ic('escudo', 18)} <b>En garantía</b> hasta el ${esc(fecha(ultimo.garantia_hasta))}<div class="sub">Por: ${esc(ultimo.trabajo_realizado || 'trabajo del ' + fecha(ultimo.fecha_realizado))}</div></div>`
      : `<div class="tarjeta banner vencida">Garantía vencida el ${esc(fecha(ultimo.garantia_hasta))}</div>`;

  app.innerHTML = `
    <p class="miga"><a href="#/cliente/${esc(e.clientes.id)}">← ${esc(nombreCompleto(e.clientes))}</a></p>
    <h1>${esc(descEquipo(e))}</h1>
    <div class="tarjeta">
      ${e.ubicacion ? `<div class="dato"><b>Ubicación</b> ${esc(e.ubicacion)}</div>` : ''}
      ${e.numero_serie ? `<div class="dato"><b>N° serie</b> ${esc(e.numero_serie)}</div>` : ''}
      ${e.notas ? `<div class="dato"><b>Notas</b> ${esc(e.notas)}</div>` : ''}
    </div>
    ${garantia}
    <div class="botones">
      <a class="btn" href="#/trabajo-nuevo/${esc(e.cliente_id)}/${esc(e.id)}">+ Trabajo / turno</a>
      <a class="btn secundario" href="#/equipo-editar/${esc(e.id)}">${ic('editar', 18)} Editar</a>
    </div>
    <h2>Fotos del equipo</h2>
    <p class="sub">Incluye las fotos de todos los trabajos hechos en este equipo.</p>
    <div id="fotos" class="tarjeta"></div>

    <h2>Historial de este equipo</h2>
    ${trabajos.length ? trabajos.map(tarjetaTrabajo).join('') : '<p class="vacio">Sin trabajos todavía.</p>'}
  `;
  montarFotos(app.querySelector('#fotos'), { equipoId: e.id });
}

// Tarjeta de trabajo reutilizable (ficha cliente / ficha equipo)
export function tarjetaTrabajo(t) {
  const titulo = t.estado === 'realizado' ? fecha(t.fecha_realizado)
    : t.estado === 'agendado' ? 'Turno ' + (t.fecha_turno ? fechaHora(t.fecha_turno) : 'sin fecha') : 'Cancelado';
  return `
    <a class="tarjeta" href="#/trabajo/${esc(t.id)}">
      <div class="fila">
        <div class="titulo">${esc(titulo)}</div>
        ${t.estado === 'realizado' ? `<strong>${pesos(t.total)}</strong>` : `<span class="etiqueta ${t.estado === 'agendado' ? 'agendado' : 'vencida'}">${esc(t.estado)}</span>`}
      </div>
      <div class="sub">${esc(descEquipo(t))}</div>
      <div class="sub">${esc(t.trabajo_realizado || t.falla_reportada || '')}</div>
      ${t.estado === 'realizado' ? `<div class="etiquetas">${etiquetaCobro(t.estado_cobro)} ${etiquetaGarantia(t)}</div>` : ''}
    </a>`;
}

// ---------------------------------------------------------------------
// FORMULARIO: nuevo equipo (de un cliente) / editar equipo
// ---------------------------------------------------------------------
export async function vistaEquipoFormulario(app, { clienteId = null, id = null }) {
  let e = { cliente_id: clienteId, tipo: '', marca: '', modelo: '', numero_serie: '', ubicacion: '', notas: '' };
  if (id) {
    const { data, error } = await sb.from('equipos').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    if (!data) { app.innerHTML = '<p class="vacio">Equipo no encontrado.</p>'; return; }
    e = data;
  }
  const { data: cli } = await sb.from('clientes').select('nombre, apellido').eq('id', e.cliente_id).maybeSingle();
  const v = (c) => esc(e[c] ?? '');
  const volver = id ? `#/equipo/${esc(id)}` : `#/cliente/${esc(e.cliente_id)}`;

  app.innerHTML = `
    <h1>${id ? 'Editar equipo' : 'Nuevo equipo'}</h1>
    <p class="sub">Cliente: <b>${esc(nombreCompleto(cli || {}))}</b></p>
    <form id="f-equipo" class="tarjeta">
      <label for="tipo">Tipo *</label>
      <input id="tipo" name="tipo" list="tipos" required value="${v('tipo')}" placeholder="Aire acondicionado, heladera…">
      <datalist id="tipos">${TIPOS_EQUIPO.map((t) => `<option value="${esc(t)}">`).join('')}</datalist>
      <label for="marca">Marca</label>
      <input id="marca" name="marca" value="${v('marca')}">
      <label for="modelo">Modelo</label>
      <input id="modelo" name="modelo" value="${v('modelo')}">
      <label for="numero_serie">N° de serie</label>
      <input id="numero_serie" name="numero_serie" value="${v('numero_serie')}">
      <label for="ubicacion">Ubicación <span class="ayuda">— ej: dormitorio, living, local</span></label>
      <input id="ubicacion" name="ubicacion" value="${v('ubicacion')}">
      <label for="notas">Notas</label>
      <textarea id="notas" name="notas">${v('notas')}</textarea>
      <div class="botones">
        <button class="btn" type="submit">Guardar</button>
        <a class="btn secundario" href="${volver}">Cancelar</a>
      </div>
      <p id="f-error" class="error" hidden></p>
    </form>`;

  const form = app.querySelector('#f-equipo');
  const error = app.querySelector('#f-error');
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const datos = datosFormulario(form);
    const boton = form.querySelector('button');
    boton.disabled = true; error.hidden = true;
    const nuevoId = id || crypto.randomUUID();
    const { error: err } = id
      ? await sb.from('equipos').update(datos).eq('id', id)
      : await sb.from('equipos').insert({ id: nuevoId, cliente_id: e.cliente_id, ...datos });
    boton.disabled = false;
    if (err) { error.textContent = mensajeError(err); error.hidden = false; return; }
    location.hash = '#/equipo/' + nuevoId;
  });
}
