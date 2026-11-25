import { sb, usuarioActual } from '../supabase.js';
import { negocio, cargarNegocio, actualizarNegocioLocal } from '../negocio.js';
import { esc, datosFormulario, mensajeError, fecha, FORMAS_PAGO } from '../util.js';

const VERSION_APP = '1.0 · etapa 4';

export async function vistaAjustes(app) {
  const user = await usuarioActual();
  const { data: yo, error } = await sb.from('perfiles').select('*').eq('id', user.id).maybeSingle();
  if (error) throw error;
  const esAdmin = yo?.rol === 'admin' && yo?.activo;
  const estadoNegocio = await cargarNegocio();
  const faltaSql = !estadoNegocio.ok || !('email' in (yo || {}));
  const n = negocio();

  app.innerHTML = `
    <h1>Ajustes</h1>
    ${faltaSql && esAdmin ? `<div class="tarjeta banner aviso-sql">⚠️ Falta ejecutar <b>sql/02_configuracion.sql</b> en Supabase
      (SQL Editor). Hasta entonces, los datos del negocio y la lista de usuarios pueden no funcionar.</div>` : ''}

    <h2>Mi perfil</h2>
    <form id="f-perfil" class="tarjeta">
      <div class="dato"><b>Correo</b> ${esc(user.email)}</div>
      <div class="dato"><b>Rol</b> ${yo?.rol === 'admin' ? 'Administrador' : 'Ayudante'}</div>
      <label for="mi-nombre">Mi nombre <span class="ayuda">— aparece en el saludo de Inicio</span></label>
      <input id="mi-nombre" name="nombre" required value="${esc(yo?.nombre)}">
      <div class="botones"><button class="btn" type="submit">Guardar nombre</button></div>
      <p class="msg sub" hidden></p>
    </form>

    ${esAdmin ? `
    <h2>Datos del negocio</h2>
    <form id="f-negocio" class="tarjeta">
      <p class="sub" style="margin-top:0">Se usan en los mensajes de WhatsApp y en el comprobante.</p>
      <label for="ng-nombre">Nombre del negocio</label>
      <input id="ng-nombre" name="nombre" required value="${esc(n.nombre)}">
      <label for="ng-tecnico">Técnico / responsable</label>
      <input id="ng-tecnico" name="tecnico" required value="${esc(n.tecnico)}">
      <label for="ng-telefono">Teléfono del negocio</label>
      <input id="ng-telefono" name="telefono" type="tel" value="${esc(n.telefono)}">
      <label for="ng-direccion">Dirección / localidad</label>
      <input id="ng-direccion" name="direccion" value="${esc(n.direccion)}">
      <label for="ng-pie">Texto final del comprobante</label>
      <textarea id="ng-pie" name="pie_comprobante">${esc(n.pie_comprobante)}</textarea>
      <div class="botones"><button class="btn" type="submit">Guardar datos</button></div>
      <p class="msg sub" hidden></p>
    </form>

    <h2>Usuarios y ayudantes</h2>
    <div class="tarjeta">
      <div id="usuarios"><p class="vacio">Cargando…</p></div>
      <details class="ayuda-det">
        <summary>¿Cómo sumo un ayudante?</summary>
        <ol>
          <li>En Supabase: <b>Autenticación → Usuarios → Agregar usuario → Crear nuevo usuario</b>.</li>
          <li>Poné su correo y una contraseña, y tildá <b>Confirmar usuario automáticamente</b>.</li>
          <li>Volvé acá: va a aparecer como <b>inactivo</b>. Activalo con el interruptor.</li>
          <li>Pasale el link de la app, su correo y su contraseña.</li>
        </ol>
        <p>Para que deje de entrar, desactivalo acá. Sus trabajos quedan guardados.</p>
      </details>
    </div>

    <h2>Copia de seguridad</h2>
    <div class="tarjeta">
      <p style="margin-top:0">Descarga un archivo Excel con clientes, equipos, trabajos, repuestos y pagos. Guardalo en la compu o en Drive de vez en cuando.</p>
      <p class="sub">Las fotos no se incluyen (quedan guardadas en Supabase).</p>
      <div class="botones"><button id="btn-respaldo" class="btn" type="button">⬇️ Descargar Excel</button></div>
      <p id="respaldo-msg" class="sub" hidden></p>
    </div>` : ''}

    <p class="sub version">Denis Center ${VERSION_APP}</p>
  `;

  // --- Mi nombre
  const fPerfil = app.querySelector('#f-perfil');
  fPerfil.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const msg = fPerfil.querySelector('.msg');
    const nombre = fPerfil.nombre.value.trim();
    let { error: err } = await sb.rpc('cambiar_mi_nombre', { nuevo: nombre });
    // Si todavía no se corrió el SQL 02, el admin puede editar directo
    if (err && esAdmin) ({ error: err } = await sb.from('perfiles').update({ nombre }).eq('id', user.id));
    mostrar(msg, err ? mensajeError(err) : '✔ Nombre guardado', !!err);
  });

  if (!esAdmin) return;

  // --- Datos del negocio
  const fNeg = app.querySelector('#f-negocio');
  fNeg.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const d = datosFormulario(fNeg);
    d.pie_comprobante = d.pie_comprobante ?? '';
    const { error: err } = await sb.from('negocio').update(d).eq('id', 1);
    if (!err) actualizarNegocioLocal(d);
    mostrar(fNeg.querySelector('.msg'), err ? mensajeError(err) : '✔ Datos guardados', !!err);
  });

  // --- Usuarios
  await pintarUsuarios(app.querySelector('#usuarios'), user.id);

  // --- Respaldo
  app.querySelector('#btn-respaldo').addEventListener('click', async (ev) => {
    const boton = ev.currentTarget;
    const msg = app.querySelector('#respaldo-msg');
    boton.disabled = true;
    try {
      await descargarRespaldo((t) => mostrar(msg, t, false));
      mostrar(msg, '✔ Copia descargada. Buscala en la carpeta Descargas.', false);
    } catch (err) {
      console.error(err);
      mostrar(msg, 'No se pudo generar: ' + mensajeError(err), true);
    }
    boton.disabled = false;
  });
}

function mostrar(el, texto, esError) {
  el.hidden = false;
  el.textContent = texto;
  el.classList.toggle('error', esError);
}

async function pintarUsuarios(caja, miId) {
  const [{ data: perfiles, error }, { data: trabajos }] = await Promise.all([
    sb.from('perfiles').select('*').order('creado_en'),
    sb.from('trabajos').select('tecnico_id').eq('estado', 'realizado').eq('eliminado', false),
  ]);
  if (error) { caja.innerHTML = `<p class="error">${esc(mensajeError(error))}</p>`; return; }
  const cuenta = {};
  (trabajos || []).forEach((t) => { cuenta[t.tecnico_id] = (cuenta[t.tecnico_id] || 0) + 1; });

  caja.innerHTML = perfiles.map((p) => `
    <div class="usuario fila linea" data-id="${esc(p.id)}">
      <div>
        <div class="titulo">${esc(p.nombre)} ${p.id === miId ? '<span class="sub">(vos)</span>' : ''}</div>
        <div class="sub">${esc(p.email || '')} · ${cuenta[p.id] || 0} trabajos realizados</div>
        <select class="u-rol" ${p.id === miId ? 'disabled' : ''} aria-label="Rol">
          <option value="ayudante" ${p.rol === 'ayudante' ? 'selected' : ''}>Ayudante</option>
          <option value="admin" ${p.rol === 'admin' ? 'selected' : ''}>Administrador</option>
        </select>
      </div>
      <label class="interruptor" title="Activo">
        <input type="checkbox" class="u-activo" ${p.activo ? 'checked' : ''} ${p.id === miId ? 'disabled' : ''}>
        <span>${p.activo ? 'Activo' : 'Inactivo'}</span>
      </label>
    </div>`).join('') + '<p class="msg sub" hidden></p>';

  const msg = caja.querySelector('.msg');
  caja.querySelectorAll('.usuario').forEach((fila) => {
    const id = fila.dataset.id;
    const guardar = async (cambios) => {
      const { error: err } = await sb.from('perfiles').update(cambios).eq('id', id);
      if (err) mostrar(msg, mensajeError(err), true);
      await pintarUsuarios(caja, miId);
      if (!err) mostrar(caja.querySelector('.msg'), '✔ Usuario actualizado', false);
    };
    fila.querySelector('.u-activo').addEventListener('change', (e) => guardar({ activo: e.target.checked }));
    fila.querySelector('.u-rol').addEventListener('change', (e) => guardar({ rol: e.target.value }));
  });
}

// ---------------------------------------------------------------------
// Copia de seguridad en Excel (una hoja por tabla)
// ---------------------------------------------------------------------
async function traerTodo(tabla, columnas, orden) {
  const filas = [];
  const paso = 1000;
  for (let desde = 0; ; desde += paso) {
    const { data, error } = await sb.from(tabla).select(columnas).eq('eliminado', false)
      .order(orden).range(desde, desde + paso - 1);
    if (error) throw error;
    filas.push(...data);
    if (data.length < paso) return filas;
  }
}

async function descargarRespaldo(progreso) {
  progreso('Preparando…');
  const XLSX = await import('https://esm.sh/xlsx@0.18.5');

  progreso('Leyendo clientes y equipos…');
  const clientes = await traerTodo('clientes', 'id, nombre, apellido, dni, telefono, direccion, notas, creado_en', 'creado_en');
  const equipos = await traerTodo('equipos', 'id, cliente_id, tipo, marca, modelo, numero_serie, ubicacion, notas, creado_en', 'creado_en');
  progreso('Leyendo trabajos…');
  const trabajos = await traerTodo('trabajos_resumen', '*', 'creado_en');
  const repuestos = await traerTodo('repuestos', 'trabajo_id, descripcion, cantidad, precio_unitario, creado_en', 'creado_en');
  const pagos = await traerTodo('pagos', 'trabajo_id, fecha, monto, forma_pago, notas', 'fecha');

  const nomCli = Object.fromEntries(clientes.map((c) => [c.id, [c.nombre, c.apellido].filter(Boolean).join(' ')]));
  const descEq = Object.fromEntries(equipos.map((e) => [e.id, [e.tipo, e.marca, e.modelo].filter(Boolean).join(' ')]));
  const num = (v) => Number(v) || 0;
  const descTr = Object.fromEntries(trabajos.map((t) => [t.id,
    [[t.cliente_nombre, t.cliente_apellido].filter(Boolean).join(' '), fecha(t.fecha_realizado || t.fecha_turno)].filter(Boolean).join(' · ')]));
  const fh = (v) => (v ? new Date(v).toLocaleString('es-AR') : '');

  const hojas = {
    Clientes: clientes.map((c) => ({
      Nombre: c.nombre, Apellido: c.apellido, DNI: c.dni, Teléfono: c.telefono, Dirección: c.direccion,
      Notas: c.notas, 'Cargado el': fecha(c.creado_en), ID: c.id,
    })),
    Equipos: equipos.map((e) => ({
      Cliente: nomCli[e.cliente_id], Tipo: e.tipo, Marca: e.marca, Modelo: e.modelo, 'N° serie': e.numero_serie,
      Ubicación: e.ubicacion, Notas: e.notas, ID: e.id,
    })),
    Trabajos: trabajos.map((t) => ({
      Cliente: [t.cliente_nombre, t.cliente_apellido].filter(Boolean).join(' '), Equipo: descEq[t.equipo_id] || '',
      Estado: t.estado, Turno: fh(t.fecha_turno), Realizado: fh(t.fecha_realizado),
      Falla: t.falla_reportada, Diagnóstico: t.diagnostico, 'Se hizo': t.trabajo_realizado,
      'Mano de obra': num(t.mano_obra), Repuestos: num(t.total_repuestos), Total: num(t.total),
      Pagado: num(t.pagado), Saldo: num(t.saldo), 'Garantía hasta': t.garantia_hasta ? fecha(t.garantia_hasta) : '',
      Notas: t.notas, ID: t.id,
    })),
    Repuestos: repuestos.map((r) => ({
      Trabajo: descTr[r.trabajo_id] || r.trabajo_id, Descripción: r.descripcion, Cantidad: num(r.cantidad),
      'Precio unitario': num(r.precio_unitario), Subtotal: num(r.cantidad) * num(r.precio_unitario),
    })),
    Pagos: pagos.map((p) => ({
      Trabajo: descTr[p.trabajo_id] || p.trabajo_id, Fecha: fh(p.fecha), Monto: num(p.monto),
      Forma: FORMAS_PAGO[p.forma_pago] || p.forma_pago, Notas: p.notas,
    })),
  };

  progreso('Armando el Excel…');
  const libro = XLSX.utils.book_new();
  for (const [nombre, filas] of Object.entries(hojas)) {
    const hoja = XLSX.utils.json_to_sheet(filas.length ? filas : [{ '(sin datos)': '' }]);
    hoja['!cols'] = Object.keys(filas[0] || { x: 1 }).map((k) => ({ wch: Math.max(10, Math.min(40, k.length + 4)) }));
    XLSX.utils.book_append_sheet(libro, hoja, nombre);
  }
  const hoy = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(libro, `denis-center-respaldo-${hoy}.xlsx`);
}
