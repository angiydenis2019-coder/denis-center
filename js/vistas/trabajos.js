import { botonEliminar, activarEliminar } from './papelera.js';
import { ic } from '../iconos.js';
import { sb, usuarioActual } from '../supabase.js';
import { montarFotos } from '../fotos.js';
import { botonesRapidos, activarRapidos } from '../rapidos.js';
import { cargarPrecios, datalistRepuestos, precioDe } from './precios.js';
import { negocio, tieneAlias, mensajeAlias, activarCopiarAlias, datosTransferencia } from '../negocio.js';
import {
  esc, pesos, fecha, fechaHora, nombreCompleto, datosFormulario, descEquipo, linkWhatsApp,
  etiquetaCobro, etiquetaGarantia, mensajeError, aInputFecha, deInputFecha, FORMAS_PAGO,
} from '../util.js';

// ---------------------------------------------------------------------
// DETALLE DEL TRABAJO: datos, repuestos, pagos, saldo, garantía, WhatsApp
// ---------------------------------------------------------------------
export async function vistaTrabajoDetalle(app, id) {
  const [tr, rep, pag] = await Promise.all([
    sb.from('trabajos_resumen').select('*').eq('id', id).maybeSingle(),
    sb.from('repuestos').select('*').eq('trabajo_id', id).eq('eliminado', false).order('creado_en'),
    sb.from('pagos').select('*').eq('trabajo_id', id).eq('eliminado', false).order('fecha'),
  ]);
  for (const r of [tr, rep, pag]) if (r.error) throw r.error;
  const t = tr.data;
  if (!t) { app.innerHTML = '<p class="vacio">Trabajo no encontrado.</p>'; return; }
  const repuestos = rep.data, pagos = pag.data;
  const { data: cliDir } = await sb.from('clientes').select('direccion').eq('id', t.cliente_id).maybeSingle();
  const direccionCliente = cliDir?.direccion;
  const precios = await cargarPrecios();
  const cliente = { nombre: t.cliente_nombre, apellido: t.cliente_apellido };

  const encabezado = t.estado === 'realizado'
    ? `Trabajo del ${esc(fecha(t.fecha_realizado))}`
    : t.estado === 'agendado' ? `Turno: ${t.fecha_turno ? esc(fechaHora(t.fecha_turno)) : 'sin fecha'}` : 'Turno cancelado';

  const wa = t.estado === 'realizado'
    ? linkWhatsApp(t.cliente_telefono, textoComprobante(t))
    : t.estado === 'agendado' && t.fecha_turno
      ? linkWhatsApp(t.cliente_telefono, `Hola ${t.cliente_nombre}, te confirmo la visita para el ${fechaHora(t.fecha_turno)}. ${negocio().tecnico} (${negocio().nombre}).`)
      : null;

  app.innerHTML = `
    <p class="miga"><a href="#/cliente/${esc(t.cliente_id)}">← ${esc(nombreCompleto(cliente))}</a></p>
    <h1>${encabezado}</h1>
    <div class="etiquetas">${t.estado === 'realizado' ? etiquetaCobro(t.estado_cobro) + ' ' + etiquetaGarantia(t) : `<span class="etiqueta ${t.estado === 'agendado' ? 'agendado' : 'vencida'}">${esc(t.estado)}</span>`}</div>

    <div class="tarjeta">
      ${t.equipo_id ? `<div class="dato"><b>Equipo</b> <a href="#/equipo/${esc(t.equipo_id)}">${esc(descEquipo(t))}</a></div>` : ''}
      ${t.falla_reportada ? `<div class="dato"><b>Falla</b> ${esc(t.falla_reportada)}</div>` : ''}
      ${t.diagnostico ? `<div class="dato"><b>Diagnóstico</b> ${esc(t.diagnostico)}</div>` : ''}
      ${t.trabajo_realizado ? `<div class="dato"><b>Se hizo</b> ${esc(t.trabajo_realizado)}</div>` : ''}
      ${t.notas ? `<div class="dato"><b>Notas</b> ${esc(t.notas)}</div>` : ''}
    </div>

    ${t.estado === 'agendado' ? `<div id="rapidos-tr">${botonesRapidos({ nombre: t.cliente_nombre, telefono: t.cliente_telefono, direccion: direccionCliente })}</div>` : ''}
    <div class="botones">
      ${t.estado === 'agendado' ? `<a class="btn" href="#/trabajo-editar/${esc(t.id)}/completar">${ic('check', 18)} Completar trabajo</a>` : ''}
      ${wa ? `<a class="btn whatsapp" href="${esc(wa)}" target="_blank" rel="noopener">${ic('chat', 18)} ${t.estado === 'realizado' ? 'Mensaje' : 'Confirmar turno'}</a>` : ''}
      ${t.estado === 'realizado' ? `<a class="btn secundario" href="#/recibo/${esc(t.id)}">${ic('documento', 18)} Boleta</a>` : ''}
      <a class="btn secundario" href="#/trabajo-editar/${esc(t.id)}">${ic('editar', 18)} Editar</a>
    </div>
    ${tieneAlias() && t.estado === 'realizado' && Number(t.saldo) > 0 ? `<div class="botones">
      ${t.cliente_telefono ? `<a class="btn alias" href="${esc(linkWhatsApp(t.cliente_telefono, mensajeAlias(t.cliente_nombre, Number(t.saldo))))}" target="_blank" rel="noopener">${ic('tarjeta', 18)} Pasar alias (${pesos(t.saldo)})</a>` : ''}
      <button class="btn secundario" type="button" data-copiar-alias>${ic('copiar', 18)} Copiar alias</button>
    </div>` : ''}

    ${t.estado === 'cancelado' ? '' : `
    <h2>Fotos</h2>
    <div id="fotos" class="tarjeta"></div>

    <h2>Repuestos</h2>
    <div class="tarjeta">
      ${repuestos.length ? repuestos.map((r) => `
        <div class="fila linea">
          <div>${esc(r.descripcion)} <span class="sub">× ${Number(r.cantidad)} · ${pesos(r.precio_unitario)} c/u</span></div>
          <div class="fila"><b>${pesos(r.cantidad * r.precio_unitario)}</b>
            <button class="btn-quitar" data-quitar-rep="${esc(r.id)}" title="Quitar" aria-label="Quitar">${ic('cerrar', 18)}</button></div>
        </div>`).join('') : '<p class="vacio">Sin repuestos.</p>'}
      <form id="f-rep" class="mini">
        <input name="descripcion" placeholder="Repuesto (ej: capacitor 35uF)" required list="dl-rep" autocomplete="off">
        ${datalistRepuestos('dl-rep', precios)}
        <input name="cantidad" type="number" min="0.01" step="any" value="1" required aria-label="Cantidad">
        <input name="precio_unitario" type="number" min="0" step="any" placeholder="Precio" required aria-label="Precio unitario">
        <button class="btn" type="submit">Agregar</button>
      </form>
    </div>

    <h2>Cobro</h2>
    <div class="tarjeta">
      <div class="fila linea"><span>Mano de obra</span><span>${pesos(t.mano_obra)}</span></div>
      <div class="fila linea"><span>Repuestos</span><span>${pesos(t.total_repuestos)}</span></div>
      <div class="fila linea total"><span>Total</span><span>${pesos(t.total)}</span></div>
      ${pagos.map((p) => `
        <div class="fila linea">
          <span>Pago ${esc(fecha(p.fecha))} · ${esc(FORMAS_PAGO[p.forma_pago] || p.forma_pago)}</span>
          <span class="fila">− ${pesos(p.monto)} <button class="btn-quitar" data-quitar-pago="${esc(p.id)}" title="Quitar" aria-label="Quitar">${ic('cerrar', 18)}</button></span>
        </div>`).join('')}
      <div class="fila linea total ${t.saldo > 0 ? 'deuda' : 'ok'}"><span>Saldo pendiente</span><span>${pesos(t.saldo)}</span></div>
      ${t.saldo > 0 ? `
      <form id="f-pago" class="mini">
        <input name="monto" type="number" min="0.01" step="any" value="${Number(t.saldo)}" required aria-label="Monto">
        <select name="forma_pago" aria-label="Forma de pago">${Object.entries(FORMAS_PAGO).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
        <button class="btn" type="submit">Registrar pago</button>
      </form>` : ''}
    </div>`}
    <p id="d-error" class="error" hidden></p>
    ${botonEliminar(t.estado === 'agendado' ? 'Eliminar turno' : 'Eliminar trabajo')}
  `;

  activarCopiarAlias(app.querySelector('[data-copiar-alias]'));
  activarRapidos(app.querySelector('#rapidos-tr'));
  activarEliminar(app, { tabla: 'trabajos', id: t.id, destino: `#/cliente/${t.cliente_id}`,
    pregunta: t.estado === 'agendado' ? '¿Eliminar este turno?' : '¿Eliminar este trabajo? Sus repuestos, pagos y fotos dejan de contarse.' });
  const cajaFotos = app.querySelector('#fotos');
  if (cajaFotos) montarFotos(cajaFotos, { trabajoId: t.id, equipoId: t.equipo_id });

  const error = app.querySelector('#d-error');
  const recargar = () => vistaTrabajoDetalle(app, id);
  const fallo = (err) => { error.textContent = mensajeError(err); error.hidden = false; };

  const fRep = app.querySelector('#f-rep');
  fRep?.descripcion.addEventListener('input', () => {
    const p = precioDe(precios, fRep.descripcion.value);
    if (p !== undefined) fRep.precio_unitario.value = Number(p);
  });

  fRep?.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const d = datosFormulario(ev.target);
    const { error: err } = await sb.from('repuestos').insert({
      id: crypto.randomUUID(), trabajo_id: id, descripcion: d.descripcion,
      cantidad: Number(d.cantidad), precio_unitario: Number(d.precio_unitario),
    });
    err ? fallo(err) : recargar();
  });

  app.querySelector('#f-pago')?.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const d = datosFormulario(ev.target);
    const { error: err } = await sb.from('pagos').insert({
      id: crypto.randomUUID(), trabajo_id: id, monto: Number(d.monto), forma_pago: d.forma_pago,
    });
    err ? fallo(err) : recargar();
  });

  app.querySelectorAll('[data-quitar-rep], [data-quitar-pago]').forEach((b) => b.addEventListener('click', async () => {
    const esRep = !!b.dataset.quitarRep;
    if (!confirm(esRep ? '¿Quitar este repuesto?' : '¿Quitar este pago?')) return;
    const { error: err } = await sb.from(esRep ? 'repuestos' : 'pagos')
      .update({ eliminado: true }).eq('id', esRep ? b.dataset.quitarRep : b.dataset.quitarPago);
    err ? fallo(err) : recargar();
  }));
}

// Texto del comprobante que se manda por WhatsApp
function textoComprobante(t) {
  const n = negocio();
  const l = [
    `*${n.nombre}* — Comprobante de trabajo`,
    `Cliente: ${t.cliente_nombre} ${t.cliente_apellido}`.trim(),
    `Fecha: ${fecha(t.fecha_realizado)}`,
  ];
  if (t.equipo_id) l.push(`Equipo: ${descEquipo(t)}`);
  if (t.trabajo_realizado) l.push(`Trabajo realizado: ${t.trabajo_realizado}`);
  // Sin detalle: el cliente ve solo el total (el detalle queda en la app)
  l.push(`*Total: ${pesos(t.total)}* (mano de obra y repuestos incluidos)`);
  if (Number(t.pagado) > 0) l.push(`Pagado: ${pesos(t.pagado)}`);
  if (Number(t.saldo) > 0) {
    l.push(`*Saldo pendiente: ${pesos(t.saldo)}*`);
    if (tieneAlias()) l.push('', 'Para transferir:', datosTransferencia(), '');
  }
  l.push(`Garantía: ${n.garantiaDias} días, hasta el ${fecha(t.garantia_hasta)}.`, '');
  if (n.pie_comprobante) l.push(n.pie_comprobante);
  l.push([n.tecnico, n.telefono && `Tel. ${n.telefono}`, n.direccion].filter(Boolean).join(' · '));
  return l.join('\n');
}

// ---------------------------------------------------------------------
// FORMULARIO: nuevo trabajo/turno o editar (incluye "completar")
//   #/trabajo-nuevo[/clienteId[/equipoId]]   #/trabajo-editar/id[/completar]
// ---------------------------------------------------------------------
export async function vistaTrabajoFormulario(app, { id = null, clienteId = null, equipoId = null, completar = false }) {
  // Fecha sugerida desde la Agenda (botón "+ Turno" de un día)
  const sugerida = !id && sessionStorage.getItem('dc_fecha_turno');
  if (sugerida) sessionStorage.removeItem('dc_fecha_turno');
  let t = { cliente_id: clienteId, equipo_id: equipoId, estado: 'agendado', fecha_turno: sugerida ? new Date(sugerida).toISOString() : null, fecha_realizado: null,
    falla_reportada: '', diagnostico: '', trabajo_realizado: '', mano_obra: 0, notas: '' };
  if (id) {
    const { data, error } = await sb.from('trabajos').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    if (!data) { app.innerHTML = '<p class="vacio">Trabajo no encontrado.</p>'; return; }
    t = data;
    if (completar) t.estado = 'realizado';
  }

  const { data: clientes, error: errC } = await sb.from('clientes').select('id, nombre, apellido')
    .eq('eliminado', false).order('apellido').order('nombre');
  if (errC) throw errC;
  if (!clientes.length) {
    app.innerHTML = `<div class="tarjeta"><p>Primero cargá un cliente.</p><a class="btn" href="#/cliente-nuevo">+ Nuevo cliente</a></div>`;
    return;
  }

  const precios = await cargarPrecios();
  const servicios = precios.filter((p) => p.tipo === 'servicio');
  const conExtras = !id || completar; // al crear o completar: repuestos y cobro en el mismo paso
  const v = (c) => esc(t[c] ?? '');
  const volver = id ? `#/trabajo/${esc(id)}` : t.cliente_id ? `#/cliente/${esc(t.cliente_id)}` : '#/inicio';

  app.innerHTML = `
    <h1>${completar ? 'Completar trabajo' : id ? 'Editar trabajo' : 'Nuevo trabajo / turno'}</h1>
    <form id="f-trabajo" class="tarjeta">
      <label for="cliente_id">Cliente *</label>
      <select id="cliente_id" name="cliente_id" required ${id ? 'disabled' : ''}>
        <option value="">— Elegí un cliente —</option>
        ${clientes.map((c) => `<option value="${esc(c.id)}" ${c.id === t.cliente_id ? 'selected' : ''}>${esc(c.apellido ? c.apellido + ', ' + c.nombre : c.nombre)}</option>`).join('')}
      </select>
      ${id ? '' : '<p class="ayuda"><a href="#/cliente-nuevo">+ Cliente nuevo</a></p>'}

      <label for="equipo_id">Equipo</label>
      <select id="equipo_id" name="equipo_id"></select>
      <p class="ayuda" id="link-equipo"></p>

      <label>¿Qué querés registrar?</label>
      <div class="opciones">
        <label class="opcion"><input type="radio" name="estado" value="agendado" ${t.estado === 'agendado' ? 'checked' : ''}> Turno a futuro</label>
        <label class="opcion"><input type="radio" name="estado" value="realizado" ${t.estado === 'realizado' ? 'checked' : ''}> Trabajo realizado</label>
        ${id ? `<label class="opcion"><input type="radio" name="estado" value="cancelado" ${t.estado === 'cancelado' ? 'checked' : ''}> Cancelado</label>` : ''}
      </div>

      <div data-seccion="agendado">
        <label for="fecha_turno">Fecha y hora del turno</label>
        <input id="fecha_turno" name="fecha_turno" type="datetime-local" value="${t.fecha_turno ? aInputFecha(t.fecha_turno) : ''}">
      </div>

      <label for="falla_reportada">Falla que reporta el cliente</label>
      <textarea id="falla_reportada" name="falla_reportada" placeholder="Ej: el aire no enfría">${v('falla_reportada')}</textarea>

      <div data-seccion="realizado">
        <label for="fecha_realizado">Fecha en que se hizo *</label>
        <input id="fecha_realizado" name="fecha_realizado" type="datetime-local" value="${aInputFecha(t.fecha_realizado)}">
        <label for="diagnostico">Diagnóstico</label>
        <textarea id="diagnostico" name="diagnostico">${v('diagnostico')}</textarea>
        ${servicios.length ? `<label for="servicio-lista">Agregar servicio de la lista</label>
        <select id="servicio-lista"><option value="">— Elegir —</option>${servicios.map((p) =>
          `<option value="${esc(p.id)}">${esc(p.descripcion)} · ${pesos(p.precio)}</option>`).join('')}</select>
        <p class="ayuda">Completa "Qué se hizo" y suma el precio a la mano de obra.</p>` : ''}
        <label for="trabajo_realizado">Qué se hizo</label>
        <textarea id="trabajo_realizado" name="trabajo_realizado" placeholder="Ej: cambio de capacitor y carga de gas">${v('trabajo_realizado')}</textarea>
        <label for="mano_obra">Mano de obra ($)</label>
        <input id="mano_obra" name="mano_obra" type="number" min="0" step="any" value="${Number(t.mano_obra) || ''}">
        ${conExtras ? `
        <label>Repuestos usados</label>
        ${datalistRepuestos('dl-rep-form', precios)}
        <div id="filas-rep"></div>
        <button type="button" class="btn-mas" id="mas-rep">+ Agregar repuesto</button>

        <div class="tarjeta total-form">
          <div class="fila"><span>Total del trabajo</span><b id="total-form">$ 0</b></div>
          <label for="cobrado">Cobrado ahora ($) <span class="ayuda">— dejalo vacío si no te pagó</span></label>
          <div class="fila">
            <input id="cobrado" name="cobrado" type="number" min="0" step="any">
            <button type="button" class="btn secundario" id="cobre-todo">Todo</button>
          </div>
          <label for="forma_pago">Forma de pago</label>
          <select id="forma_pago" name="forma_pago">${Object.entries(FORMAS_PAGO).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
        </div>` : '<p class="ayuda">Los repuestos y los pagos se modifican desde el detalle del trabajo.</p>'}
      </div>

      <label for="notas">Notas</label>
      <textarea id="notas" name="notas">${v('notas')}</textarea>

      <div class="botones">
        <button class="btn" type="submit">Guardar</button>
        <a class="btn secundario" href="${volver}">Cancelar</a>
      </div>
      <p id="f-error" class="error" hidden></p>
    </form>`;

  const form = app.querySelector('#f-trabajo');
  const error = app.querySelector('#f-error');
  const selCliente = form.querySelector('#cliente_id');
  const selEquipo = form.querySelector('#equipo_id');
  const linkEquipo = form.querySelector('#link-equipo');

  // Equipos del cliente elegido
  async function cargarEquipos() {
    const cid = selCliente.value;
    selEquipo.innerHTML = '<option value="">— Sin equipo / trabajo general —</option>';
    linkEquipo.innerHTML = '';
    if (!cid) return;
    const { data } = await sb.from('equipos').select('id, tipo, marca, modelo, ubicacion')
      .eq('cliente_id', cid).eq('eliminado', false).order('creado_en');
    (data || []).forEach((e) => {
      const o = new Option([descEquipo(e), e.ubicacion].filter(Boolean).join(' · '), e.id, false, e.id === t.equipo_id);
      selEquipo.add(o);
    });
    linkEquipo.innerHTML = `<a href="#/equipo-nuevo/${esc(cid)}">+ Agregar equipo a este cliente</a>`;
  }
  selCliente.addEventListener('change', () => { t.equipo_id = null; cargarEquipos(); });
  await cargarEquipos();

  // Mostrar u ocultar campos según el estado
  const actualizarSecciones = () => {
    const estado = form.querySelector('input[name=estado]:checked')?.value;
    form.querySelectorAll('[data-seccion]').forEach((s) => { s.hidden = s.dataset.seccion !== estado; });
    form.fecha_realizado.required = estado === 'realizado';
  };
  form.querySelectorAll('input[name=estado]').forEach((r) => r.addEventListener('change', actualizarSecciones));
  actualizarSecciones();

  // Servicio de la lista -> completa "qué se hizo" y suma mano de obra
  form.querySelector('#servicio-lista')?.addEventListener('change', (e) => {
    const p = servicios.find((x) => x.id === e.target.value);
    if (!p) return;
    const ta = form.trabajo_realizado;
    ta.value = ta.value.trim() ? ta.value.trim() + ', ' + p.descripcion : p.descripcion;
    form.mano_obra.value = (Number(form.mano_obra.value) || 0) + Number(p.precio);
    e.target.value = '';
    calcularTotal();
  });

  // Repuestos en el mismo formulario
  const filasRep = form.querySelector('#filas-rep');
  function agregarFilaRep() {
    const fila = document.createElement('div');
    fila.className = 'fila-rep';
    fila.innerHTML = `
      <input class="r-desc" placeholder="Repuesto (ej: capacitor 35uF)" list="dl-rep-form" autocomplete="off" aria-label="Repuesto">
      <input class="r-cant" type="number" min="0.01" step="any" value="1" aria-label="Cantidad">
      <input class="r-precio" type="number" min="0" step="any" placeholder="Precio c/u $" aria-label="Precio unitario">
      <button type="button" class="btn-quitar" title="Quitar" aria-label="Quitar">${ic('cerrar', 18)}</button>`;
    fila.querySelector('.r-desc').addEventListener('input', (e) => {
      const p = precioDe(precios, e.target.value);
      if (p !== undefined) fila.querySelector('.r-precio').value = Number(p);
      calcularTotal();
    });
    fila.querySelectorAll('input').forEach((i) => i.addEventListener('input', calcularTotal));
    fila.querySelector('.btn-quitar').addEventListener('click', () => { fila.remove(); calcularTotal(); });
    filasRep.appendChild(fila);
    fila.querySelector('.r-desc').focus();
  }
  const leerRepuestos = () => [...(filasRep?.querySelectorAll('.fila-rep') || [])]
    .map((f) => ({ descripcion: f.querySelector('.r-desc').value.trim(),
      cantidad: Number(f.querySelector('.r-cant').value) || 1, precio_unitario: Number(f.querySelector('.r-precio').value) || 0 }))
    .filter((r) => r.descripcion);
  function calcularTotal() {
    const caja = form.querySelector('#total-form');
    if (!caja) return 0;
    const total = (Number(form.mano_obra.value) || 0) + leerRepuestos().reduce((a, r) => a + r.cantidad * r.precio_unitario, 0);
    caja.textContent = pesos(total);
    return total;
  }
  form.querySelector('#mas-rep')?.addEventListener('click', agregarFilaRep);
  form.querySelector('#cobre-todo')?.addEventListener('click', () => { form.cobrado.value = calcularTotal() || ''; });
  form.mano_obra.addEventListener('input', calcularTotal);

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const d = datosFormulario(form);
    const datos = {
      equipo_id: d.equipo_id,
      estado: d.estado,
      fecha_turno: deInputFecha(d.fecha_turno),
      falla_reportada: d.falla_reportada,
      fecha_realizado: d.estado === 'realizado' ? deInputFecha(d.fecha_realizado) : null,
      diagnostico: d.diagnostico,
      trabajo_realizado: d.trabajo_realizado,
      mano_obra: Number(d.mano_obra) || 0,
      notas: d.notas,
    };
    const boton = form.querySelector('button[type=submit]');
    boton.disabled = true; error.hidden = true;

    let nuevoId = id;
    let err;
    if (id) {
      ({ error: err } = await sb.from('trabajos').update(datos).eq('id', id));
    } else {
      nuevoId = crypto.randomUUID();
      const user = await usuarioActual();
      ({ error: err } = await sb.from('trabajos').insert({ id: nuevoId, cliente_id: d.cliente_id, tecnico_id: user.id, ...datos }));
    }
    if (!err && conExtras && d.estado === 'realizado') {
      const reps = leerRepuestos().map((r) => ({ id: crypto.randomUUID(), trabajo_id: nuevoId, ...r }));
      if (reps.length) ({ error: err } = await sb.from('repuestos').insert(reps));
      const cobrado = Number(d.cobrado) || 0;
      if (!err && cobrado > 0) {
        ({ error: err } = await sb.from('pagos').insert({
          id: crypto.randomUUID(), trabajo_id: nuevoId, monto: cobrado, forma_pago: d.forma_pago || 'efectivo',
        }));
      }
    }
    boton.disabled = false;
    if (err) { error.textContent = mensajeError(err); error.hidden = false; return; }
    location.hash = '#/trabajo/' + nuevoId;
  });
}
