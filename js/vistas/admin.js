// Panel del SUPERADMINISTRADOR: alta de técnicos, contraseñas provisorias,
// suspender / reactivar cuentas. Solo muestra cantidades: los datos de
// cada técnico (clientes, trabajos, fotos) son privados de cada uno.
import { sb } from '../supabase.js';
import { ic } from '../iconos.js';
import { esc, fecha, fechaHora, linkWhatsApp, mensajeError } from '../util.js';
import { CONTACTO_EMAIL } from '../terminos.js';
import { estadoAvisos, activarAvisos, desactivarAvisos, probarAviso } from '../avisos.js';

const linkApp = () => location.origin + location.pathname;

function mensajeBienvenida({ nombre, email, clave }) {
  return `Hola ${nombre || ''}, ya tenés tu cuenta en *DC*, la app para registrar tus trabajos, clientes, turnos y garantías.\n\n`
    + `1) Abrí este link en el celular: ${linkApp()}\n`
    + `2) Entrá con:\n   Correo: ${email}\n   Contraseña provisoria: *${clave}*\n`
    + `3) La app te va a pedir que elijas tu propia contraseña.\n`
    + `4) En el menú del navegador tocá *Instalar app* (o *Agregar a pantalla principal*).\n\n`
    + `Después, en Ajustes, cargá el nombre de tu negocio, tu logo y tu alias.\n\nConsultas: ${CONTACTO_EMAIL}`;
}

// Llama a la función "admin-usuarios" de Supabase y devuelve el mensaje de error legible
async function llamar(cuerpo) {
  if (!navigator.onLine) throw new Error('Necesitás señal para esto.');
  const { data, error } = await sb.functions.invoke('admin-usuarios', { body: cuerpo });
  if (error) {
    let detalle = null;
    try { detalle = (await error.context?.json())?.error; } catch { /* sin cuerpo */ }
    if (!detalle && /Failed to send|404|not found/i.test(error.message)) {
      detalle = 'Todavía no está instalada la función "admin-usuarios" en Supabase (paso 3 de las instrucciones).';
    }
    throw new Error(detalle || error.message);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

function mensajeClaveNueva({ nombre, email, clave }) {
  return `Hola ${nombre || ''}, te generé una *contraseña provisoria* para entrar a *DC*.\n\n`
    + `1) Abrí la app: ${linkApp()}\n`
    + `2) Entrá con:\n   Correo: ${email}\n   Contraseña provisoria: *${clave}*\n`
    + `3) La app te va a pedir que elijas una contraseña nueva. Anotala en un lugar seguro.\n\n`
    + `Tus datos siguen todos guardados. Consultas: ${CONTACTO_EMAIL}`;
}

function tarjetaClave({ titulo, nombre, email, clave, telefono, tipo = 'alta' }) {
  const msj = tipo === 'nueva' ? mensajeClaveNueva({ nombre, email, clave }) : mensajeBienvenida({ nombre, email, clave });
  return `
    <div class="tarjeta banner" id="resultado-clave">
      <h3 style="margin-top:0">${ic('check', 18)} ${esc(titulo)}</h3>
      <div class="dato"><b>Correo</b> ${esc(email)}</div>
      <p class="sub" style="margin-bottom:4px">Contraseña provisoria (anotala o mandala ahora: no se vuelve a mostrar)</p>
      <div class="clave-provisoria">${esc(clave)}</div>
      <div class="botones">
        ${telefono ? `<a class="btn whatsapp" target="_blank" rel="noopener" href="${esc(linkWhatsApp(telefono, msj))}">${ic('chat', 18)} Mandar por WhatsApp</a>` : ''}
        <button class="btn secundario" type="button" id="btn-copiar-msj" data-msj="${esc(msj)}">${ic('copiar', 18)} Copiar mensaje</button>
      </div>
    </div>`;
}

function activarCopiar(raiz) {
  raiz.querySelector('#btn-copiar-msj')?.addEventListener('click', async (e) => {
    const t = e.currentTarget.dataset.msj;
    try { await navigator.clipboard.writeText(t); e.currentTarget.textContent = '✔ Copiado'; }
    catch { prompt('Copiá el mensaje:', t); }
  });
}

export async function vistaAdmin(app) {
  app.innerHTML = `
    <p class="miga"><a href="#/ajustes">← Ajustes</a></p>
    <h1>${ic('escudo', 22)} Administración DC</h1>
    <p class="sub">Desde acá das de alta a otros técnicos. Cada uno ve solo sus propios clientes y trabajos; vos ves cuántos tiene, no qué tiene.</p>

    <div id="zona-resultado"></div>

    <div class="tarjeta">
      <h3 style="margin-top:0">${ic('chat', 18)} Invitar técnico</h3>
      <p class="sub" style="margin-top:0">Le mandás un link por WhatsApp, él completa sus datos y acepta los términos, y vos aprobás la solicitud acá.</p>
      <form id="f-invitar">
        <label for="inv-para">Para quién <span class="ayuda">— opcional, para acordarte</span></label>
        <input id="inv-para" name="para" placeholder="ej: Carlos de Clorinda" autocomplete="off">
        <label for="inv-tel">Su celular <span class="ayuda">— opcional: si lo ponés, WhatsApp abre directo su chat</span></label>
        <input id="inv-tel" name="telefono" type="tel" inputmode="tel" autocomplete="off">
        <div class="botones"><button class="btn" type="submit">${ic('chat', 18)} Generar invitación</button></div>
        <p class="msg error" hidden></p>
      </form>
    </div>

    <div id="zona-pedidos-clave"></div>
    <div id="zona-solicitudes"></div>

    <div class="tarjeta" id="caja-avisos"><p class="vacio">Revisando avisos…</p></div>

    <details class="tarjeta" id="det-nuevo">
      <summary><b>${ic('mas', 18)} Cargar técnico a mano</b></summary>
      <form id="f-nuevo" style="margin-top:12px">
        <label for="nt-apellido">Apellido</label>
        <input id="nt-apellido" name="apellido" required autocomplete="off" autocapitalize="words">
        <label for="nt-nombre">Nombre</label>
        <input id="nt-nombre" name="nombre" required autocomplete="off" autocapitalize="words">
        <label for="nt-localidad">Localidad</label>
        <input id="nt-localidad" name="localidad" autocomplete="off" placeholder="ej: Clorinda">
        <label for="nt-negocio">Nombre del negocio <span class="ayuda">— opcional, después lo puede cambiar él</span></label>
        <input id="nt-negocio" name="negocio" placeholder="ej: Frío Total">
        <label for="nt-email">Correo <span class="ayuda">— con el que va a entrar</span></label>
        <input id="nt-email" name="email" type="email" required autocapitalize="none" autocomplete="off">
        <label for="nt-tel">Celular <span class="ayuda">— para mandarle los datos por WhatsApp</span></label>
        <input id="nt-tel" name="telefono" type="tel" inputmode="tel">
        <div class="botones"><button class="btn" type="submit">Crear cuenta</button></div>
        <p class="msg error" hidden></p>
      </form>
    </details>

    <h2>Técnicos</h2>
    <div id="lista-negocios" class="tarjeta"><p class="vacio">Cargando…</p></div>`;

  const zona = app.querySelector('#zona-resultado');
  const f = app.querySelector('#f-nuevo');
  const msg = f.querySelector('.msg');

  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    msg.hidden = true;
    const b = f.querySelector('button[type=submit]');
    b.disabled = true; b.textContent = 'Creando…';
    const apellido = f.apellido.value.trim();
    const nombre = f.nombre.value.trim();
    const localidad = f.localidad.value.trim();
    const datos = {
      accion: 'crear',
      nombre: `${nombre} ${apellido}`,
      negocio: f.negocio.value.trim() || `${apellido} ${nombre}`,
      email: f.email.value.trim(),
      telefono: f.telefono.value.trim(),
    };
    try {
      const r = await llamar(datos);
      const { error: eDatos } = await sb.rpc('admin_set_datos', { p_negocio: r.negocio_id, p_apellido: apellido, p_nombre: nombre, p_localidad: localidad });
      zona.innerHTML = tarjetaClave({ titulo: `Cuenta creada para ${apellido}, ${nombre}`, nombre, email: r.email, clave: r.clave, telefono: datos.telefono })
        + (eDatos ? `<p class="error">La cuenta se creó, pero no se guardaron apellido y localidad: falta ejecutar sql/10_datos_tecnico.sql en Supabase.</p>` : '');
      activarCopiar(zona);
      f.reset();
      app.querySelector('#det-nuevo').open = false;
      window.scrollTo(0, 0);
      await pintarLista(app, zona);
    } catch (err) {
      msg.textContent = err.message; msg.hidden = false;
    }
    b.disabled = false; b.textContent = 'Crear cuenta';
  });

  // --- Invitaciones
  const fi = app.querySelector('#f-invitar');
  fi.addEventListener('submit', async (e) => {
    e.preventDefault();
    const m = fi.querySelector('.msg'); m.hidden = true;
    if (!navigator.onLine) { m.textContent = 'Necesitás señal para esto.'; m.hidden = false; return; }
    const { data: token, error } = await sb.rpc('admin_crear_invitacion', { p_nota: fi.para.value });
    if (error) {
      m.textContent = /admin_crear_invitacion|function/i.test(error.message) ? 'Falta ejecutar sql/11_invitaciones.sql en Supabase.' : mensajeError(error);
      m.hidden = false; return;
    }
    const link = `${linkApp()}#/invitacion/${token}`;
    const msj = `Hola, te invito a usar *DC*, la app para registrar tus trabajos, clientes, turnos y garantías.\n\n`
      + `Completá tus datos en este link (vence en 7 días y se usa una sola vez):\n${link}\n\n`
      + `Cuando los revise, te mando el acceso por acá. Consultas: ${CONTACTO_EMAIL}`;
    const tel = fi.telefono.value.trim();
    zona.innerHTML = `
      <div class="tarjeta banner" id="resultado-invitacion">
        <h3 style="margin-top:0">${ic('check', 18)} Invitación lista${fi.para.value ? ' para ' + esc(fi.para.value) : ''}</h3>
        <p class="sub" style="word-break:break-all">${esc(link)}</p>
        <div class="botones">
          <a class="btn whatsapp" target="_blank" rel="noopener" href="${esc(tel ? linkWhatsApp(tel, msj) : 'https://wa.me/?text=' + encodeURIComponent(msj))}">${ic('chat', 18)} Mandar por WhatsApp</a>
          <button class="btn secundario" type="button" id="btn-copiar-msj" data-msj="${esc(msj)}">${ic('copiar', 18)} Copiar mensaje</button>
        </div>
      </div>`;
    activarCopiar(zona);
    fi.reset();
    window.scrollTo(0, 0);
    await pintarInvitaciones(app, zona);
  });

  await Promise.all([pintarPedidosClave(app, zona), pintarInvitaciones(app, zona), pintarLista(app, zona), pintarAvisos(app)]);
}

const TEXTO_AVISOS = {
  activos: ['🔔 Avisos activados en este celular', 'Te suena el celular cuando un técnico completa su solicitud.'],
  apagados: ['🔕 Avisos apagados en este celular', 'Activalos para que te suene el celular cuando un técnico complete su solicitud.'],
  bloqueados: ['🚫 Avisos bloqueados', 'El navegador tiene bloqueados los avisos de esta app. Habilitalos en Configuración del navegador → Configuración de sitios → Notificaciones, y volvé a esta pantalla.'],
  'no-soportado': ['Avisos no disponibles', 'Este navegador no permite avisos. Probá con Chrome en Android.'],
  'instalar-iphone': ['Instalá la app primero', 'En iPhone los avisos funcionan solo con la app instalada: tocá Compartir → Agregar a inicio, abrila desde ahí y volvé a esta pantalla.'],
};

async function pintarAvisos(app) {
  const caja = app.querySelector('#caja-avisos');
  let estado;
  try { estado = await estadoAvisos(); } catch { estado = 'no-soportado'; }
  const [titulo, texto] = TEXTO_AVISOS[estado];
  caja.innerHTML = `
    <h3 style="margin-top:0">${titulo}</h3>
    <p class="sub" style="margin-top:0">${texto}</p>
    <div class="botones">
      ${estado === 'apagados' ? `<button class="btn" type="button" id="btn-avisos-on">🔔 Activar avisos</button>` : ''}
      ${estado === 'activos' ? `<button class="btn secundario" type="button" id="btn-avisos-prueba">Probar aviso</button>
        <button class="btn-texto" type="button" id="btn-avisos-off">Desactivar</button>` : ''}
    </div>
    <p class="msg sub" hidden></p>`;
  const msg = caja.querySelector('.msg');
  const decir = (t, err) => { msg.hidden = false; msg.textContent = t; msg.classList.toggle('error', !!err); };
  caja.querySelector('#btn-avisos-on')?.addEventListener('click', async (e) => {
    const b = e.currentTarget; b.disabled = true;
    try {
      await activarAvisos();
      await pintarAvisos(app);
      const m = caja.querySelector('.msg'); m.hidden = false; m.textContent = '✔ Listo. Tocá "Probar aviso" para verificar.';
    } catch (err) {
      decir(/Registration failed|AbortError|push service/i.test(err.message)
        ? 'El navegador no pudo activar los avisos. Usá Chrome actualizado y, si tenés ahorro de batería o datos, desactivalo un momento.'
        : err.message, true);
      b.disabled = false;
    }
  });
  caja.querySelector('#btn-avisos-prueba')?.addEventListener('click', async (e) => {
    const b = e.currentTarget; b.disabled = true;
    try {
      const n = await probarAviso();
      decir(n ? '✔ Aviso enviado. Tendría que sonar en unos segundos.' : 'No se encontró este celular. Desactivá y volvé a activar los avisos.', !n);
    } catch (err) { decir(err.message, true); }
    b.disabled = false;
  });
  caja.querySelector('#btn-avisos-off')?.addEventListener('click', async () => {
    await desactivarAvisos().catch(() => {});
    await pintarAvisos(app);
  });
}

// Técnicos que tocaron "¿Olvidaste tu contraseña?"
async function pintarPedidosClave(app, zona) {
  const caja = app.querySelector('#zona-pedidos-clave');
  const { data, error } = await sb.rpc('admin_pedidos_clave');
  if (error || !data?.length) { caja.innerHTML = ''; return; }
  caja.innerHTML = `
    <h2>Pidieron contraseña nueva <span class="etiqueta-estado provisoria">${data.length}</span></h2>
    <div class="tarjeta">${data.map((k) => `
      <div class="negocio-fila linea" data-pedido="${esc(k.id)}">
        <div class="titulo"><b>${esc(k.apellido ? `${k.apellido}, ${k.nombre_tecnico || ''}` : k.nombre || k.email)}</b></div>
        <div class="sub">${esc(k.negocio || '')}${k.negocio ? ' · ' : ''}${esc(k.email)}</div>
        <div class="sub">Lo pidió el ${fechaHora(k.creado_en)}</div>
        <div class="acciones">
          <button class="btn" type="button" data-accion="dar">${ic('actualizar', 16)} Dar contraseña provisoria</button>
          <button class="btn-texto" type="button" data-accion="descartar">Descartar</button>
        </div>
      </div>`).join('')}</div>
    <p class="msg sub" hidden></p>`;
  const avisar = (t, err) => { const m = caja.querySelector(':scope > .msg'); m.hidden = false; m.textContent = t; m.classList.toggle('error', !!err); };
  caja.querySelectorAll('[data-pedido]').forEach((fila) => {
    const k = data.find((x) => x.id === fila.dataset.pedido);
    const nombre = k.nombre_tecnico || k.nombre || '';
    fila.querySelector('[data-accion=dar]').addEventListener('click', async (e) => {
      const b = e.currentTarget; b.disabled = true; b.textContent = 'Generando…';
      try {
        const r = await llamar({ accion: 'restablecer', usuario_id: k.usuario_id });
        await sb.rpc('admin_resolver_pedido_clave', { p_id: k.id, p_estado: 'resuelto' });
        zona.innerHTML = tarjetaClave({ titulo: `Contraseña provisoria para ${k.apellido ? k.apellido + ', ' : ''}${nombre}`, nombre, email: k.email, clave: r.clave, telefono: k.telefono, tipo: 'nueva' });
        activarCopiar(zona);
        window.scrollTo(0, 0);
        await Promise.all([pintarPedidosClave(app, zona), pintarLista(app, zona)]);
      } catch (err) { avisar(err.message, true); b.disabled = false; b.textContent = 'Dar contraseña provisoria'; }
    });
    fila.querySelector('[data-accion=descartar]').addEventListener('click', async () => {
      if (!confirm('¿Descartar este pedido? No se cambia ninguna contraseña.')) return;
      await sb.rpc('admin_resolver_pedido_clave', { p_id: k.id, p_estado: 'descartado' });
      await pintarPedidosClave(app, zona);
    });
  });
}

// Solicitudes completadas (para aprobar) e invitaciones enviadas sin completar
async function pintarInvitaciones(app, zona) {
  const caja = app.querySelector('#zona-solicitudes');
  const { data, error } = await sb.from('invitaciones').select('*').in('estado', ['pendiente', 'completada']).order('creado_en', { ascending: false });
  if (error) { caja.innerHTML = ''; return; } // sql/11 sin ejecutar: no se muestra nada
  const solicitudes = data.filter((i) => i.estado === 'completada');
  const enviadas = data.filter((i) => i.estado === 'pendiente');
  const ahora = Date.now();
  caja.innerHTML = `
    ${solicitudes.length ? `<h2>Solicitudes para aprobar <span class="etiqueta-estado provisoria">${solicitudes.length}</span></h2>
    <div class="tarjeta">${solicitudes.map((i) => `
      <div class="negocio-fila linea" data-inv="${esc(i.id)}">
        <div class="titulo"><b>${esc(i.apellido)}, ${esc(i.nombre)}</b>${i.nota ? `<span class="sub">(${esc(i.nota)})</span>` : ''}</div>
        <div class="sub">${esc(i.localidad || '')}${i.negocio ? ' · ' + esc(i.negocio) : ''}</div>
        <div class="sub">${esc(i.email)} · ${esc(i.telefono)}</div>
        <div class="sub">Completó el ${fechaHora(i.completada_en)} · Aceptó términos v${esc(i.terminos_version || '-')}</div>
        <div class="acciones">
          <button class="btn" type="button" data-accion="aprobar">${ic('check', 16)} Aprobar y crear cuenta</button>
          <button class="btn-peligro" type="button" data-accion="rechazar">Rechazar</button>
        </div>
      </div>`).join('')}</div>` : ''}
    ${enviadas.length ? `<details class="tarjeta ayuda-det">
      <summary>Invitaciones enviadas sin completar (${enviadas.length})</summary>
      ${enviadas.map((i) => `
        <div class="fila linea" data-inv="${esc(i.id)}" style="align-items:center">
          <div><div>${esc(i.nota || 'Sin nombre')}</div>
            <div class="sub">${new Date(i.vence_en).getTime() < ahora ? '<b>Vencida</b>' : 'Vence el ' + fecha(i.vence_en)}</div></div>
          <button class="btn-texto" type="button" data-accion="anular">Anular</button>
        </div>`).join('')}
    </details>` : ''}
    <p class="msg sub" hidden></p>`;

  const avisar = (t, esError) => {
    const m = caja.querySelector(':scope > .msg'); if (!m) return;
    m.hidden = false; m.textContent = t; m.classList.toggle('error', esError);
  };
  const resolver = async (id, estado, negocioId = null) =>
    sb.rpc('admin_resolver_invitacion', { p_id: id, p_estado: estado, p_negocio: negocioId });

  caja.querySelectorAll('[data-inv]').forEach((fila) => {
    const inv = data.find((x) => x.id === fila.dataset.inv);
    fila.querySelector('[data-accion=aprobar]')?.addEventListener('click', async (e) => {
      if (!confirm(`¿Crear la cuenta de ${inv.apellido}, ${inv.nombre}?`)) return;
      const b = e.currentTarget; b.disabled = true; b.textContent = 'Creando…';
      try {
        const r = await llamar({
          accion: 'crear', nombre: `${inv.nombre} ${inv.apellido}`,
          negocio: inv.negocio || `${inv.apellido} ${inv.nombre}`, email: inv.email, telefono: inv.telefono,
        });
        await sb.rpc('admin_set_datos', { p_negocio: r.negocio_id, p_apellido: inv.apellido, p_nombre: inv.nombre, p_localidad: inv.localidad || '' });
        await resolver(inv.id, 'aprobada', r.negocio_id);
        zona.innerHTML = tarjetaClave({ titulo: `Cuenta creada para ${inv.apellido}, ${inv.nombre}`, nombre: inv.nombre, email: r.email, clave: r.clave, telefono: inv.telefono });
        activarCopiar(zona);
        window.scrollTo(0, 0);
        await Promise.all([pintarInvitaciones(app, zona), pintarLista(app, zona)]);
      } catch (err) {
        avisar(err.message, true); b.disabled = false; b.textContent = 'Aprobar y crear cuenta';
      }
    });
    fila.querySelector('[data-accion=rechazar]')?.addEventListener('click', async () => {
      if (!confirm(`¿Rechazar la solicitud de ${inv.apellido}, ${inv.nombre}? No se crea ninguna cuenta.`)) return;
      const { error: err } = await resolver(inv.id, 'rechazada');
      if (err) return avisar(mensajeError(err), true);
      await pintarInvitaciones(app, zona); avisar('✔ Solicitud rechazada', false);
    });
    fila.querySelector('[data-accion=anular]')?.addEventListener('click', async () => {
      if (!confirm('¿Anular esta invitación? El link deja de funcionar.')) return;
      const { error: err } = await resolver(inv.id, 'anulada');
      if (err) return avisar(mensajeError(err), true);
      await pintarInvitaciones(app, zona); avisar('✔ Invitación anulada', false);
    });
  });
}

async function pintarLista(app, zona) {
  const caja = app.querySelector('#lista-negocios');
  const { data, error } = await sb.rpc('admin_negocios');
  if (error) {
    caja.innerHTML = `<p class="error">${esc(/admin_negocios|function/i.test(error.message) ? 'Falta ejecutar sql/08_multinegocio.sql en Supabase.' : mensajeError(error))}</p>`;
    return;
  }
  const activos = data.filter((n) => n.activo).length;
  caja.innerHTML = `<p class="sub" style="margin-top:0">${data.length} cuenta(s) · ${activos} activa(s)</p>` + data.map((n) => `
    <div class="negocio-fila linea" data-id="${esc(n.id)}" data-usuario="${esc(n.usuario_id || '')}" data-tel="${esc(n.telefono || '')}" data-nombre="${esc(n.nombre_tecnico || n.tecnico || n.nombre)}" data-email="${esc(n.email || '')}">
      <div class="titulo">
        <b>${esc(n.nombre)}</b>
        ${n.es_mio ? '<span class="etiqueta-estado">Vos</span>' : ''}
        ${!n.activo ? '<span class="etiqueta-estado suspendido">Suspendida</span>' : (n.es_mio ? '' : '<span class="etiqueta-estado">Activa</span>')}
        ${n.debe_cambiar_clave ? '<span class="etiqueta-estado provisoria">Clave provisoria</span>' : ''}
      </div>
      <div class="sub">${n.apellido ? `<b>${esc(n.apellido)}${n.nombre_tecnico ? ', ' + esc(n.nombre_tecnico) : ''}</b>` : esc(n.tecnico || '')}${n.localidad ? ' · ' + esc(n.localidad) : ''}${n.email ? ' · ' + esc(n.email) : ''}</div>
      <div class="sub">${Number(n.clientes)} clientes · ${Number(n.trabajos)} trabajos · ${Number(n.presupuestos)} presupuestos · ${Number(n.fotos)} fotos</div>
      <div class="sub">Alta: ${fecha(n.creado_en)} · Último ingreso: ${n.ultimo_ingreso ? fechaHora(n.ultimo_ingreso) : 'nunca'}</div>
      ${n.es_mio || !('terminos_version' in n) ? '' : `<div class="sub">Términos: ${n.terminos_aceptados_en ? `v${esc(n.terminos_version)} aceptados el ${fechaHora(n.terminos_aceptados_en)}` : '<b>todavía no aceptó</b>'}</div>`}
      ${n.es_mio ? '' : `<div class="acciones">
        <button class="btn secundario" type="button" data-accion="clave">${ic('actualizar', 16)} Nueva contraseña</button>
        ${n.activo
          ? `<button class="btn-peligro" type="button" data-accion="suspender">Suspender</button>`
          : `<button class="btn" type="button" data-accion="reactivar">Reactivar</button>`}
        ${n.telefono ? `<a class="btn secundario" target="_blank" rel="noopener" href="${esc(linkWhatsApp(n.telefono, `Hola ${n.nombre_tecnico || n.tecnico || ''}`))}">${ic('chat', 16)} WhatsApp</a>` : ''}
      </div>
      ${'localidad' in n ? `<details class="editar-tecnico">
        <summary>${ic('editar', 16)} Editar datos</summary>
        <form class="f-datos">
          <label>Apellido<input name="apellido" value="${esc(n.apellido || '')}" autocapitalize="words"></label>
          <label>Nombre<input name="nombre" value="${esc(n.nombre_tecnico || '')}" autocapitalize="words"></label>
          <label>Localidad<input name="localidad" value="${esc(n.localidad || '')}"></label>
          <div class="botones"><button class="btn" type="submit">Guardar</button></div>
        </form>
      </details>` : ''}`}
    </div>`).join('') + '<p class="msg sub" hidden></p>';

  const avisar = (t, esError) => {
    const msg = caja.querySelector(':scope > .msg');
    if (!msg) return;
    msg.hidden = false; msg.textContent = t; msg.classList.toggle('error', esError);
  };

  caja.querySelectorAll('.negocio-fila').forEach((fila) => {
    const id = fila.dataset.id;
    const nombre = fila.querySelector('.titulo b').textContent;
    const cambiarEstado = async (activo) => {
      const pregunta = activo
        ? `¿Reactivar la cuenta de ${nombre}?`
        : `¿Suspender la cuenta de ${nombre}?\n\nNo va a poder usar la app hasta que la reactives. Sus datos NO se borran.`;
      if (!confirm(pregunta)) return;
      const { error } = await sb.rpc('admin_set_activo', { p_negocio: id, p_activo: activo });
      if (error) return avisar(mensajeError(error), true);
      await pintarLista(app, zona);
      avisar(activo ? `✔ ${nombre} reactivada` : `✔ ${nombre} suspendida`, false);
    };
    fila.querySelector('.f-datos')?.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const fd = ev.currentTarget;
      const { error } = await sb.rpc('admin_set_datos', { p_negocio: id, p_apellido: fd.apellido.value, p_nombre: fd.nombre.value, p_localidad: fd.localidad.value });
      if (error) return avisar(mensajeError(error), true);
      await pintarLista(app, zona);
      avisar(`✔ Datos de ${nombre} guardados`, false);
    });
    fila.querySelector('[data-accion=suspender]')?.addEventListener('click', () => cambiarEstado(false));
    fila.querySelector('[data-accion=reactivar]')?.addEventListener('click', () => cambiarEstado(true));
    fila.querySelector('[data-accion=clave]')?.addEventListener('click', async (e) => {
      if (!fila.dataset.usuario) return avisar('Esta cuenta no tiene usuario.', true);
      if (!confirm(`¿Darle una contraseña provisoria nueva a ${nombre}?\n\nLa que usa ahora deja de funcionar.`)) return;
      const b = e.currentTarget; b.disabled = true;
      try {
        const r = await llamar({ accion: 'restablecer', usuario_id: fila.dataset.usuario });
        zona.innerHTML = tarjetaClave({ titulo: `Contraseña nueva para ${nombre}`, nombre: fila.dataset.nombre, email: fila.dataset.email, clave: r.clave, telefono: fila.dataset.tel, tipo: 'nueva' });
        activarCopiar(zona);
        window.scrollTo(0, 0);
        await pintarLista(app, zona);
      } catch (err) { avisar(err.message, true); b.disabled = false; }
    });
  });
}
