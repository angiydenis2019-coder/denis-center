import { botonEliminar, activarEliminar } from './papelera.js';
import { agendaDisponible, elegirDeAgenda, leerPortapapeles, leerCompartido, normalizarTelefono } from '../contactos.js';
import { ic } from '../iconos.js';
import { sb } from '../supabase.js';
import { negocio, tieneAlias, mensajeAlias, activarCopiarAlias } from '../negocio.js';
import { esc, pesos, nombreCompleto, linkWhatsApp, datosFormulario, mensajeError, descEquipo } from '../util.js';
import { tarjetaTrabajo } from './equipos.js';
import { botonesRapidos, activarRapidos } from '../rapidos.js';
import { montarPresupuestosCliente } from './presupuestos.js';
import { cargarIndice, filtrar, tarjetaCliente } from '../buscar.js';

// ---------------------------------------------------------------------
// LISTA DE CLIENTES con buscador
// ---------------------------------------------------------------------
export async function vistaClientes(app) {
  const indice = await cargarIndice();

  app.innerHTML = `
    <div class="fila"><h1>Clientes</h1><a class="btn" href="#/cliente-nuevo">+ Nuevo</a></div>
    <input class="buscador" id="buscar" type="search" placeholder="Nombre, apellido, DNI, teléfono o equipo" autocomplete="off">
    <p class="sub" id="cuenta"></p>
    <div id="lista"></div>`;

  const lista = app.querySelector('#lista');
  const cuenta = app.querySelector('#cuenta');
  const pintar = (texto) => {
    const res = filtrar(indice, texto);
    cuenta.textContent = texto.trim() ? `${res.length} resultado${res.length === 1 ? '' : 's'}` : `${indice.length} clientes`;
    lista.innerHTML = res.length
      ? res.map(tarjetaCliente).join('')
      : `<p class="vacio">${indice.length ? 'No se encontró ningún cliente.' : 'Todavía no cargaste clientes.'}</p>`;
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
      ${wa ? `<a class="btn whatsapp" href="${esc(wa)}" target="_blank" rel="noopener">${ic('chat', 18)} WhatsApp</a>` : ''}
      ${c.telefono ? `<a class="btn secundario" href="tel:${esc(c.telefono.replace(/[^\d+]/g, ''))}">${ic('telefono', 18)} Llamar</a>` : ''}
      <a class="btn secundario" href="#/cliente-editar/${esc(c.id)}">${ic('editar', 18)} Editar</a>
    </div>
    ${tieneAlias() ? `<div class="botones">
      ${c.telefono ? `<a class="btn alias" href="${esc(linkWhatsApp(c.telefono, mensajeAlias(c.nombre, deuda)))}" target="_blank" rel="noopener">${ic('tarjeta', 18)} Pasar alias${deuda > 0 ? ' (' + pesos(deuda) + ')' : ''}</a>` : ''}
      <button class="btn secundario" type="button" data-copiar-alias>${ic('copiar', 18)} Copiar alias</button>
    </div>` : ''}
    <div id="rapidos-cli">${botonesRapidos({ nombre: c.nombre, telefono: c.telefono, direccion: c.direccion })}</div>
    <div class="botones acciones-cli">
      <a class="btn" href="#/trabajo-nuevo/${esc(c.id)}">${ic('mas', 18)} Trabajo / turno</a>
      <a class="btn secundario" href="#/presupuesto-nuevo/${esc(c.id)}">${ic('documento', 18)} Presupuesto</a>
      <a class="btn secundario" href="#/equipo-nuevo/${esc(c.id)}">${ic('mas', 18)} Equipo</a>
    </div>

    <h2>Equipos</h2>
    ${equipos.data.length ? equipos.data.map((e) => `
      <a class="tarjeta" href="#/equipo/${esc(e.id)}">
        <div class="titulo">${esc(descEquipo(e))}</div>
        <div class="sub">${esc([e.ubicacion, e.numero_serie && 'N° serie ' + e.numero_serie].filter(Boolean).join(' · '))}</div>
      </a>`).join('') : '<p class="vacio">Sin equipos cargados.</p>'}

    <h2>Historial de trabajos</h2>
    ${trabajos.data.length ? trabajos.data.map(tarjetaTrabajo).join('') : '<p class="vacio">Sin trabajos todavía.</p>'}

    <h2>Presupuestos</h2>
    <div id="pres-cli"><p class="vacio">Cargando…</p></div>
    ${botonEliminar('Eliminar cliente')}
  `;
  activarCopiarAlias(app.querySelector('[data-copiar-alias]'));
  activarRapidos(app.querySelector('#rapidos-cli'));
  montarPresupuestosCliente(app.querySelector('#pres-cli'), c.id);
  activarEliminar(app, { tabla: 'clientes', id: c.id, destino: '#/clientes',
    pregunta: `¿Eliminar a ${nombreCompleto(c)}? Sus equipos, trabajos y presupuestos dejan de aparecer.` });
}

// ---------------------------------------------------------------------
// FORMULARIO: nuevo cliente / editar cliente
// ---------------------------------------------------------------------
export async function vistaClienteFormulario(app, id, compartido = false) {
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
    ${id ? '' : `<div class="traer">
      <p class="sub" style="margin:0 0 8px">Traer los datos desde el celular:</p>
      <div class="botones" style="margin:0">
        ${agendaDisponible ? `<button class="btn secundario" type="button" id="btn-agenda">${ic('clientes', 18)} Mis contactos</button>` : ''}
        ${navigator.clipboard?.readText ? `<button class="btn secundario" type="button" id="btn-pegar">${ic('copiar', 18)} Pegar número</button>` : ''}
      </div>
      <p class="sub" id="traer-msg" style="margin:8px 0 0" hidden></p>
    </div>`}
    <form id="f-cliente" class="tarjeta">
      <label for="nombre">Nombre *</label>
      <input id="nombre" name="nombre" required value="${v('nombre')}" autocapitalize="words">
      <label for="apellido">Apellido</label>
      <input id="apellido" name="apellido" value="${v('apellido')}" autocapitalize="words">
      <label for="dni">DNI</label>
      <input id="dni" name="dni" inputmode="numeric" pattern="[0-9.]*" value="${v('dni')}">
      <label for="telefono">Teléfono <span class="ayuda">— código de área + número, sin 0 ni 15 (ej: 3704 123456)</span></label>
      <input id="telefono" name="telefono" type="tel" value="${v('telefono')}">
      <p id="tel-duplicado" class="aviso-dup" hidden></p>
      <label for="direccion">Dirección <span class="ayuda">— con la localidad, o pegá el link de ubicación que te manden por WhatsApp</span></label>
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
  const msg = app.querySelector('#traer-msg');
  const avisar = (texto) => { if (msg) { msg.hidden = false; msg.textContent = texto; } };

  // Completa el formulario con lo que se trajo (sin pisar lo que ya escribiste)
  const completar = (d) => {
    if (!d) return false;
    let algo = false;
    for (const k of ['nombre', 'apellido', 'telefono']) {
      if (d[k] && !form[k].value.trim()) { form[k].value = d[k]; algo = true; }
      else if (d[k] && k === 'telefono') { form[k].value = d[k]; algo = true; }
    }
    form.telefono.dispatchEvent(new Event('input', { bubbles: true }));
    return algo;
  };

  app.querySelector('#btn-agenda')?.addEventListener('click', async () => {
    try {
      const d = await elegirDeAgenda();
      if (completar(d)) avisar('✔ Datos traídos de tus contactos. Revisalos antes de guardar.');
    } catch { avisar('No se pudo abrir la agenda del celular.'); }
  });
  app.querySelector('#btn-pegar')?.addEventListener('click', async () => {
    try {
      const d = await leerPortapapeles();
      if (d.telefono) { completar(d); avisar(`✔ Número pegado: ${d.telefono}`); }
      else avisar('No encontré un número en lo que copiaste. En WhatsApp, tocá el número y elegí "Copiar".');
    } catch { avisar('Permití el acceso al portapapeles para pegar el número.'); }
  });
  if (compartido) {
    const d = await leerCompartido();
    if (completar(d)) avisar('✔ Datos traídos desde WhatsApp. Revisalos antes de guardar.');
  }

  // Aviso si el teléfono ya es de otro cliente
  const dup = app.querySelector('#tel-duplicado');
  let otros = null;
  const revisarDuplicado = async () => {
    const tel = normalizarTelefono(form.telefono.value);
    if (tel.length < 8) { dup.hidden = true; return; }
    if (!otros) {
      const { data } = await sb.from('clientes').select('id, nombre, apellido, telefono').eq('eliminado', false);
      otros = (data || []).filter((x) => x.id !== id);
    }
    const igual = otros.find((x) => normalizarTelefono(x.telefono).slice(-8) === tel.slice(-8));
    dup.hidden = !igual;
    if (igual) dup.innerHTML = `${ic('alerta', 16)} Ya tenés un cliente con ese teléfono: <a href="#/cliente/${esc(igual.id)}">${esc(nombreCompleto(igual))}</a>`;
  };
  let espera = null;
  form.telefono.addEventListener('input', () => { clearTimeout(espera); espera = setTimeout(revisarDuplicado, 400); });
  if (form.telefono.value) revisarDuplicado();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const datos = datosFormulario(form);
    if (datos.dni) datos.dni = datos.dni.replace(/\D/g, '');
    if (datos.telefono) datos.telefono = normalizarTelefono(datos.telefono) || datos.telefono;
    datos.apellido = datos.apellido ?? '';
    const boton = form.querySelector('button[type=submit]');
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
