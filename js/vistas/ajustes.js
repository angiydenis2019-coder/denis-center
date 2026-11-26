import { ic } from '../iconos.js';
import { sb, usuarioActual } from '../supabase.js';
import { negocio, cargarNegocio, guardarNegocio, esMultinegocio, esSuperadmin, logoNegocio } from '../negocio.js';
import { estadoSync, pedirSincronizacion } from '../sincronizar.js';
import { TEMAS, temaActual, aplicarTema } from '../tema.js';
import { dictadoDisponible, dictadoActivo, activarDictado } from '../dictado.js';
import { esc, datosFormulario, mensajeError, fecha, FORMAS_PAGO } from '../util.js';

const VERSION_APP = '2.0';

export async function vistaAjustes(app) {
  const user = await usuarioActual();
  const { data: yo, error } = await sb.from('perfiles').select('*').eq('id', user.id).maybeSingle();
  if (error) throw error;
  const esAdmin = yo?.rol === 'admin' && yo?.activo;
  const estadoNegocio = await cargarNegocio();
  const faltaSql = !estadoNegocio.ok || !('email' in (yo || {}));
  const multi = esMultinegocio();
  const superadmin = esSuperadmin();
  const n = negocio();

  app.innerHTML = `
    <h1>Ajustes</h1>
    ${faltaSql && esAdmin ? `<div class="tarjeta banner aviso-sql">${ic('alerta', 18)} Falta ejecutar <b>sql/02_configuracion.sql</b> en Supabase
      (SQL Editor). Hasta entonces, los datos del negocio y la lista de usuarios pueden no funcionar.</div>` : ''}

    <h2>Mi perfil</h2>
    <form id="f-perfil" class="tarjeta">
      <div class="dato"><b>Correo</b> ${esc(user.email)}</div>
      <div class="dato"><b>Rol</b> ${yo?.rol === 'admin' ? 'Administrador' : 'Ayudante'}</div>
      <label for="mi-nombre">Mi nombre <span class="ayuda">— aparece en el saludo de Inicio</span></label>
      <input id="mi-nombre" name="nombre" required value="${esc(yo?.nombre)}">
      <div class="botones"><button class="btn" type="submit">Guardar nombre</button>
        <a class="btn secundario" href="#/cambiar-clave">Cambiar contraseña</a></div>
      <p class="msg sub" hidden></p>
    </form>

    ${esAdmin ? `
    <h2>Logo de tu negocio</h2>
    <div class="tarjeta">
      ${multi ? `<div class="logo-negocio">
        <img id="img-logo" src="${esc(logoNegocio() || 'iconos/emblema.png')}" alt="Logo del negocio">
        <div>
          <label class="btn secundario">${ic('galeria', 18)} ${logoNegocio() ? 'Cambiar logo' : 'Subir logo'}<input type="file" id="in-logo" accept="image/*" hidden></label>
          ${logoNegocio() ? '<button class="btn-texto" type="button" id="btn-quitar-logo">Quitar logo</button>' : ''}
        </div>
      </div>
      <p class="sub" style="margin-bottom:0">Aparece arriba en la app y en los comprobantes que mandás a tus clientes. Mejor si es cuadrado o con fondo transparente.</p>
      <p class="msg sub" id="logo-msg" hidden></p>`
      : `<p style="margin:0">Disponible después de ejecutar <b>sql/08_multinegocio.sql</b>.</p>`}
    </div>

    <details class="tarjeta desplegable">
      <summary>${ic('tarjeta', 20)} <span><b>Datos del negocio y para transferencias</b><span class="sub">Nombre, teléfono, dirección, alias y texto del comprobante</span></span></summary>
    <form id="f-negocio">
      <p class="sub" style="margin-top:12px">Se usan en los mensajes de WhatsApp, en el comprobante y en los presupuestos.</p>
      <label for="ng-nombre">Nombre del negocio</label>
      <input id="ng-nombre" name="nombre" required value="${esc(n.nombre)}">
      <label for="ng-tecnico">Técnico / responsable</label>
      <input id="ng-tecnico" name="tecnico" required value="${esc(n.tecnico)}">
      <label for="ng-telefono">Teléfono del negocio</label>
      <input id="ng-telefono" name="telefono" type="tel" value="${esc(n.telefono)}">
      <label for="ng-direccion">Dirección / localidad</label>
      <input id="ng-direccion" name="direccion" value="${esc(n.direccion)}">
      ${'meses_mantenimiento' in n ? `<label for="ng-meses">Recordar mantenimiento cada (meses) <span class="ayuda">— 0 para no recordar</span></label>
      <input id="ng-meses" name="meses_mantenimiento" type="number" min="0" max="60" value="${Number(n.meses_mantenimiento)}">` : ''}
      ${'alias' in n ? `
      <fieldset class="grupo-alias">
        <legend>${ic('tarjeta', 18)} Datos para transferencias</legend>
        <label for="ng-alias">Alias</label>
        <input id="ng-alias" name="alias" value="${esc(n.alias)}" placeholder="ej: denis.center.mp" autocapitalize="none">
        <label for="ng-cbu">CBU / CVU <span class="ayuda">— opcional</span></label>
        <input id="ng-cbu" name="cbu" inputmode="numeric" value="${esc(n.cbu)}">
        <label for="ng-titular">Titular de la cuenta <span class="ayuda">— opcional</span></label>
        <input id="ng-titular" name="titular" value="${esc(n.titular)}">
        <label for="ng-banco">Banco o billetera <span class="ayuda">— opcional (ej: Mercado Pago)</span></label>
        <input id="ng-banco" name="banco" value="${esc(n.banco)}">
      </fieldset>` : `<div class="tarjeta banner aviso-sql">Para guardar tu alias, ejecutá <b>sql/04_alias.sql</b> en Supabase.</div>`}
            <label for="ng-pie">Texto final del comprobante</label>
      <textarea id="ng-pie" name="pie_comprobante">${esc(n.pie_comprobante)}</textarea>
      <div class="botones"><button class="btn" type="submit">Guardar datos</button></div>
      <p class="msg sub" hidden></p>
    </form>
    </details>


    ` : ''}

    ${superadmin ? `<h2>Administración</h2>
    <div class="tarjeta">
      ${multi ? `<a class="enlace-fila" href="#/admin"><span class="con-ic">${ic('escudo')} Técnicos y cuentas</span> <span>›</span></a>
      <p class="sub" style="margin-bottom:0">Crear cuentas para otros técnicos, suspenderlas o darles una contraseña nueva.</p>`
      : `<div class="banner aviso-sql">${ic('alerta', 18)} Para sumar otros técnicos, ejecutá <b>sql/08_multinegocio.sql</b> en Supabase.</div>`}
    </div>` : ''}

    ${superadmin ? `<h2>Usuarios y ayudantes</h2>
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
    </div>` : ''}

    ${esAdmin ? `
    <h2>Copia de seguridad</h2>
    <div class="tarjeta">
      <p style="margin-top:0">Descarga un archivo Excel con clientes, equipos, trabajos, repuestos y pagos. Guardalo en la compu o en Drive de vez en cuando.</p>
      <p class="sub">Las fotos no se incluyen (quedan guardadas en Supabase).</p>
      <div class="botones"><button id="btn-respaldo" class="btn" type="button">${ic('descargar', 18)} Descargar Excel</button></div>
      <p id="respaldo-msg" class="sub" hidden></p>
    </div>
    ` : ''}

    <h2>Preferencias de la app</h2>
    <h3 class="titulo-pref">Apariencia</h3>
    <div class="tarjeta">
      <div class="temas" role="group" aria-label="Estilo de la app">
        ${TEMAS.map((t) => `<button type="button" class="tema-op" data-tema-op="${t.id}" aria-pressed="${t.id === temaActual()}">
          <span class="mini-pantalla mp-${t.id}" aria-hidden="true"><i></i><i></i><i></i></span><b>${t.nombre}</b></button>`).join('')}
      </div>
      <p class="sub" style="margin-bottom:0">Se guarda en este celular. También podés cambiarlo con el botón de la paleta, arriba.</p>
    </div>

    <h3 class="titulo-pref">Dictado por voz</h3>
    <div class="tarjeta">
      ${dictadoDisponible ? `<label class="fila" style="margin:0; cursor:pointer">
        <span>Mostrar el micrófono en los campos para dictar</span>
        <input type="checkbox" id="chk-dictado" style="width:24px;height:24px" ${dictadoActivo() ? 'checked' : ''}>
      </label>
      <p class="sub" style="margin-bottom:0">Tocás el micrófono, hablás y se escribe solo. Necesita señal; sin señal usá el micrófono del teclado del celular.</p>`
      : '<p style="margin:0">Este navegador no permite dictar desde la app. Podés usar el micrófono del teclado del celular.</p>'}
    </div>

    <h3 class="titulo-pref">Modo sin señal</h3>
    <div class="tarjeta">
      <p style="margin-top:0">La app guarda una copia de tus datos en este celular. Sin señal podés buscar, ver fichas y cargar trabajos, pagos y fotos: se suben solos cuando vuelve la señal.</p>
      <div class="dato"><b>Copia local</b> <span id="sync-fecha">${estadoSync().actualizado ? new Date(estadoSync().actualizado).toLocaleString('es-AR') : 'todavía no se descargó'}</span></div>
      <div class="dato"><b>Sin subir</b> ${estadoSync().pendientes} cambio(s)</div>
      <div class="botones"><button id="btn-sync" class="btn secundario" type="button">${ic('actualizar', 18)} Actualizar ahora</button></div>
    </div>

    <p class="sub version"><a href="#/terminos">Términos, condiciones y privacidad</a>${miPerfilTerminos(yo)}<br>DC ${VERSION_APP}</p>
  `;

  app.querySelectorAll('[data-tema-op]').forEach((b) => b.addEventListener('click', () => {
    aplicarTema(b.dataset.temaOp);
    app.querySelectorAll('[data-tema-op]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  }));

  app.querySelector('#chk-dictado')?.addEventListener('change', (e) => activarDictado(e.target.checked));

  app.querySelector('#btn-sync').addEventListener('click', (e) => {
    if (!navigator.onLine) { alert('Ahora no hay señal. Se actualiza solo cuando vuelva.'); return; }
    const b = e.currentTarget;
    b.textContent = '🔄 Actualizando…'; b.disabled = true;
    pedirSincronizacion();
    const antes = estadoSync().actualizado;
    let vueltas = 0;
    const t = setInterval(() => {
      const ahora = estadoSync();
      if ((ahora.actualizado !== antes && !ahora.sincronizando) || ++vueltas > 30) {
        clearInterval(t);
        b.textContent = '✔ Actualizado'; b.disabled = false;
        const f = app.querySelector('#sync-fecha');
        if (f && ahora.actualizado) f.textContent = new Date(ahora.actualizado).toLocaleString('es-AR');
      }
    }, 1000);
  });

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
    if ('meses_mantenimiento' in d) d.meses_mantenimiento = Number(d.meses_mantenimiento) || 0;
    const { error: err } = await guardarNegocio(d);
    if (!err) { const t = document.querySelector('.marca-txt'); if (t) t.textContent = d.nombre; }
    mostrar(fNeg.querySelector('.msg'), err ? mensajeError(err) : '✔ Datos guardados', !!err);
  });

  // --- Logo
  const inLogo = app.querySelector('#in-logo');
  const logoMsg = app.querySelector('#logo-msg');
  inLogo?.addEventListener('change', async () => {
    const archivo = inLogo.files?.[0];
    if (!archivo) return;
    if (!navigator.onLine) return mostrar(logoMsg, 'Necesitás señal para subir el logo.', true);
    mostrar(logoMsg, 'Subiendo logo…', false);
    try {
      const url = await subirLogo(archivo);
      const { error: err } = await guardarNegocio({ logo_url: url });
      if (err) throw err;
      app.querySelector('#img-logo').src = url;
      const m = document.querySelector('.marca-img'); if (m) m.src = url;
      mostrar(logoMsg, '✔ Logo guardado', false);
    } catch (err) {
      mostrar(logoMsg, 'No se pudo subir: ' + mensajeError(err), true);
    }
  });
  app.querySelector('#btn-quitar-logo')?.addEventListener('click', async () => {
    if (!confirm('¿Quitar el logo? En los comprobantes va a aparecer el nombre del negocio.')) return;
    const { error: err } = await guardarNegocio({ logo_url: null });
    if (err) return mostrar(logoMsg, mensajeError(err), true);
    vistaAjustes(app);
    const m = document.querySelector('.marca-img'); if (m) m.src = 'iconos/emblema.png';
  });

  // --- Usuarios (ayudantes del superadministrador)
  if (superadmin) await pintarUsuarios(app.querySelector('#usuarios'), user.id);

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

// Achica el logo a 512 px como máximo (PNG, conserva la transparencia) y lo sube
async function subirLogo(archivo) {
  const bmp = await createImageBitmap(archivo);
  const escala = Math.min(1, 512 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * escala); c.height = Math.round(bmp.height * escala);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close?.();
  const blob = await new Promise((ok, mal) => c.toBlob((b) => (b ? ok(b) : mal(new Error('Imagen no válida'))), 'image/png'));
  const ruta = `${negocio().id}/logo-${Date.now()}.png`;
  const { error } = await sb.storage.from('logos').upload(ruta, blob, { contentType: 'image/png', upsert: true });
  if (error) throw error;
  return sb.storage.from('logos').getPublicUrl(ruta).data.publicUrl;
}

function miPerfilTerminos(yo) {
  return yo?.terminos_aceptados_en ? ` · aceptados el ${fecha(yo.terminos_aceptados_en)}` : '';
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
