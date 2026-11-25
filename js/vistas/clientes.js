import { sb } from '../supabase.js';
import { negocio } from '../negocio.js';
import { esc, pesos, nombreCompleto, linkWhatsApp, datosFormulario, mensajeError, descEquipo } from '../util.js';
import { tarjetaTrabajo } from './equipos.js';

// Normaliza para buscar sin importar mayúsculas ni tildes
const normalizar = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// ---------------------------------------------------------------------
// LISTA DE CLIENTES con buscador
// ---------------------------------------------------------------------
export async function vistaClientes(app) {
  const { data, error } = await sb.from('clientes')
    .select('id, nombre, apellido, dni, telefono, direccion')
    .eq('eliminado', false).order('apellido').order('nombre');
  if (error) throw error;

  app.innerHTML = `
    <div class="fila"><h1>Clientes</h1><a class="btn" href="#/cliente-nuevo">+ Nuevo</a></div>
    <input class="buscador" id="buscar" type="search" placeholder="Buscar por nombre, apellido, DNI o teléfono" autocomplete="off">
    <div id="lista"></div>`;

  const lista = app.querySelector('#lista');
  const pintar = (texto) => {
    const q = normalizar(texto).trim();
    const filtrados = q
      ? data.filter((c) => normalizar([c.nombre, c.apellido, c.dni, c.telefono].join(' ')).includes(q))
      : data;
    lista.innerHTML = filtrados.length
      ? filtrados.map((c) => `
          <a class="tarjeta" href="#/cliente/${esc(c.id)}">
            <div class="titulo">${esc(c.apellido)}${c.apellido ? ', ' : ''}${esc(c.nombre)}</div>
            <div class="sub">${[c.dni && 'DNI ' + esc(c.dni), c.telefono && '📞 ' + esc(c.telefono), esc(c.direccion)].filter(Boolean).join(' · ')}</div>
          </a>`).join('')
      : `<p class="vacio">${data.length ? 'No se encontró ningún cliente.' : 'Todavía no cargaste clientes.'}</p>`;
  };
  const buscar = app.querySelector('#buscar');
  buscar.addEventListener('input', () => pintar(buscar.value));
  pintar('');
}

// ---------------------------------------------------------------------
// FICHA DEL CLIENTE: datos, WhatsApp, equipos e historial de trabajos
// ---------------------------------------------------------------------
export async function vistaClienteFicha(app, id) {
  const [cli, equipos, trabajos] = await Promise.all([
    sb.from('clientes').select('*').eq('id', id).maybeSingle(),
    sb.from('equipos').select('*').eq('cliente_id', id).eq('eliminado', false).order('creado_en'),
    sb.from('trabajos_resumen').select('*').eq('cliente_id', id)
      .order('fecha_realizado', { ascending: false, nullsFirst: true })
      .order('fecha_turno', { ascending: false }),
  ]);
  for (const r of [cli, equipos, trabajos]) if (r.error) throw r.error;
  const c = cli.data;
  if (!c || c.eliminado) { app.innerHTML = '<p class="vacio">Cliente no encontrado.</p>'; return; }

  const n = negocio();
  const saludo = `Hola ${c.nombre}, te escribe ${n.tecnico} (${n.nombre}).`;
  const wa = linkWhatsApp(c.telefono, saludo);
  const deuda = trabajos.data.reduce((s, t) => s + (t.estado === 'realizado' && t.saldo > 0 ? Number(t.saldo) : 0), 0);

  app.innerHTML = `
    <h1>${esc(nombreCompleto(c))}</h1>
    <div class="tarjeta">
      ${c.dni ? `<div class="dato"><b>DNI</b> ${esc(c.dni)}</div>` : ''}
      ${c.telefono ? `<div class="dato"><b>Teléfono</b> ${esc(c.telefono)}</div>` : ''}
      ${c.direccion ? `<div class="dato"><b>Dirección</b> ${esc(c.direccion)}</div>` : ''}
      ${c.notas ? `<div class="dato"><b>Notas</b> ${esc(c.notas)}</div>` : ''}
      ${deuda > 0 ? `<div class="dato"><b>Saldo</b> <strong style="color:var(--rojo)">Debe ${pesos(deuda)}</strong></div>` : ''}
    </div>
    <div class="botones">
      ${wa ? `<a class="btn whatsapp" href="${esc(wa)}" target="_blank" rel="noopener">💬 WhatsApp</a>` : ''}
      ${c.telefono ? `<a class="btn secundario" href="tel:${esc(c.telefono.replace(/[^\d+]/g, ''))}">📞 Llamar</a>` : ''}
      <a class="btn secundario" href="#/cliente-editar/${esc(c.id)}">✏️ Editar</a>
    </div>
    <div class="botones">
      <a class="btn" href="#/trabajo-nuevo/${esc(c.id)}">+ Trabajo / turno</a>
      <a class="btn secundario" href="#/equipo-nuevo/${esc(c.id)}">+ Equipo</a>
    </div>

    <h2>Equipos</h2>
    ${equipos.data.length ? equipos.data.map((e) => `
      <a class="tarjeta" href="#/equipo/${esc(e.id)}">
        <div class="titulo">${esc(descEquipo(e))}</div>
        <div class="sub">${esc([e.ubicacion, e.numero_serie && 'N° serie ' + e.numero_serie].filter(Boolean).join(' · '))}</div>
      </a>`).join('') : '<p class="vacio">Sin equipos cargados.</p>'}

    <h2>Historial de trabajos</h2>
    ${trabajos.data.length ? trabajos.data.map(tarjetaTrabajo).join('') : '<p class="vacio">Sin trabajos todavía.</p>'}
  `;
}

// ---------------------------------------------------------------------
// FORMULARIO: nuevo cliente / editar cliente
// ---------------------------------------------------------------------
export async function vistaClienteFormulario(app, id) {
  let c = { nombre: '', apellido: '', dni: '', telefono: '', direccion: '', notas: '' };
  if (id) {
    const { data, error } = await sb.from('clientes').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    if (!data) { app.innerHTML = '<p class="vacio">Cliente no encontrado.</p>'; return; }
    c = data;
  }
  const v = (campo) => esc(c[campo] ?? '');

  app.innerHTML = `
    <h1>${id ? 'Editar cliente' : 'Nuevo cliente'}</h1>
    <form id="f-cliente" class="tarjeta">
      <label for="nombre">Nombre *</label>
      <input id="nombre" name="nombre" required value="${v('nombre')}" autocapitalize="words">
      <label for="apellido">Apellido</label>
      <input id="apellido" name="apellido" value="${v('apellido')}" autocapitalize="words">
      <label for="dni">DNI</label>
      <input id="dni" name="dni" inputmode="numeric" pattern="[0-9.]*" value="${v('dni')}">
      <label for="telefono">Teléfono <span class="ayuda">— código de área + número, sin 0 ni 15 (ej: 3704 123456)</span></label>
      <input id="telefono" name="telefono" type="tel" value="${v('telefono')}">
      <label for="direccion">Dirección</label>
      <input id="direccion" name="direccion" value="${v('direccion')}">
      <label for="notas">Notas</label>
      <textarea id="notas" name="notas">${v('notas')}</textarea>
      <div class="botones">
        <button class="btn" type="submit">Guardar</button>
        <a class="btn secundario" href="${id ? '#/cliente/' + esc(id) : '#/clientes'}">Cancelar</a>
      </div>
      <p id="f-error" class="error" hidden></p>
    </form>`;

  const form = app.querySelector('#f-cliente');
  const error = app.querySelector('#f-error');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const datos = datosFormulario(form);
    if (datos.dni) datos.dni = datos.dni.replace(/\D/g, '');
    datos.apellido = datos.apellido ?? '';
    const boton = form.querySelector('button');
    boton.disabled = true; error.hidden = true;

    const nuevoId = id || crypto.randomUUID();
    const { error: err } = id
      ? await sb.from('clientes').update(datos).eq('id', id)
      : await sb.from('clientes').insert({ id: nuevoId, ...datos });

    boton.disabled = false;
    if (err) { error.textContent = mensajeError(err); error.hidden = false; return; }
    location.hash = '#/cliente/' + nuevoId;
  });
}
