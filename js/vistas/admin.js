// Panel del SUPERADMINISTRADOR: alta de técnicos, contraseñas provisorias,
// suspender / reactivar cuentas. Solo muestra cantidades: los datos de
// cada técnico (clientes, trabajos, fotos) son privados de cada uno.
import { sb } from '../supabase.js';
import { ic } from '../iconos.js';
import { esc, fecha, fechaHora, linkWhatsApp, mensajeError } from '../util.js';
import { CONTACTO_EMAIL } from '../terminos.js';

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

function tarjetaClave({ titulo, nombre, email, clave, telefono }) {
  const msj = mensajeBienvenida({ nombre, email, clave });
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

    <details class="tarjeta" id="det-nuevo">
      <summary><b>${ic('mas', 18)} Nuevo técnico</b></summary>
      <form id="f-nuevo" style="margin-top:12px">
        <label for="nt-nombre">Nombre y apellido del técnico</label>
        <input id="nt-nombre" name="nombre" required autocomplete="off">
        <label for="nt-negocio">Nombre del negocio <span class="ayuda">— después lo puede cambiar él</span></label>
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
    const datos = {
      accion: 'crear',
      nombre: f.nombre.value.trim(),
      negocio: f.negocio.value.trim(),
      email: f.email.value.trim(),
      telefono: f.telefono.value.trim(),
    };
    try {
      const r = await llamar(datos);
      zona.innerHTML = tarjetaClave({ titulo: `Cuenta creada para ${datos.nombre}`, nombre: datos.nombre, email: r.email, clave: r.clave, telefono: datos.telefono });
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

  await pintarLista(app, zona);
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
    <div class="negocio-fila linea" data-id="${esc(n.id)}" data-usuario="${esc(n.usuario_id || '')}" data-tel="${esc(n.telefono || '')}" data-nombre="${esc(n.tecnico || n.nombre)}" data-email="${esc(n.email || '')}">
      <div class="titulo">
        <b>${esc(n.nombre)}</b>
        ${n.es_mio ? '<span class="etiqueta-estado">Vos</span>' : ''}
        ${!n.activo ? '<span class="etiqueta-estado suspendido">Suspendida</span>' : (n.es_mio ? '' : '<span class="etiqueta-estado">Activa</span>')}
        ${n.debe_cambiar_clave ? '<span class="etiqueta-estado provisoria">Clave provisoria</span>' : ''}
      </div>
      <div class="sub">${esc(n.tecnico || '')}${n.email ? ' · ' + esc(n.email) : ''}</div>
      <div class="sub">${Number(n.clientes)} clientes · ${Number(n.trabajos)} trabajos · ${Number(n.presupuestos)} presupuestos · ${Number(n.fotos)} fotos</div>
      <div class="sub">Alta: ${fecha(n.creado_en)} · Último ingreso: ${n.ultimo_ingreso ? fechaHora(n.ultimo_ingreso) : 'nunca'}</div>
      ${n.es_mio || !('terminos_version' in n) ? '' : `<div class="sub">Términos: ${n.terminos_aceptados_en ? `v${esc(n.terminos_version)} aceptados el ${fechaHora(n.terminos_aceptados_en)}` : '<b>todavía no aceptó</b>'}</div>`}
      ${n.es_mio ? '' : `<div class="acciones">
        <button class="btn secundario" type="button" data-accion="clave">${ic('actualizar', 16)} Nueva contraseña</button>
        ${n.activo
          ? `<button class="btn-peligro" type="button" data-accion="suspender">Suspender</button>`
          : `<button class="btn" type="button" data-accion="reactivar">Reactivar</button>`}
        ${n.telefono ? `<a class="btn secundario" target="_blank" rel="noopener" href="${esc(linkWhatsApp(n.telefono, `Hola ${n.tecnico || ''}`))}">${ic('chat', 16)} WhatsApp</a>` : ''}
      </div>`}
    </div>`).join('') + '<p class="msg sub" hidden></p>';

  const msg = caja.querySelector('.msg');
  const avisar = (t, esError) => { msg.hidden = false; msg.textContent = t; msg.classList.toggle('error', esError); };

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
    fila.querySelector('[data-accion=suspender]')?.addEventListener('click', () => cambiarEstado(false));
    fila.querySelector('[data-accion=reactivar]')?.addEventListener('click', () => cambiarEstado(true));
    fila.querySelector('[data-accion=clave]')?.addEventListener('click', async (e) => {
      if (!fila.dataset.usuario) return avisar('Esta cuenta no tiene usuario.', true);
      if (!confirm(`¿Darle una contraseña provisoria nueva a ${nombre}?\n\nLa que usa ahora deja de funcionar.`)) return;
      const b = e.currentTarget; b.disabled = true;
      try {
        const r = await llamar({ accion: 'restablecer', usuario_id: fila.dataset.usuario });
        zona.innerHTML = tarjetaClave({ titulo: `Contraseña nueva para ${nombre}`, nombre: fila.dataset.nombre, email: fila.dataset.email, clave: r.clave, telefono: fila.dataset.tel });
        activarCopiar(zona);
        window.scrollTo(0, 0);
        await pintarLista(app, zona);
      } catch (err) { avisar(err.message, true); b.disabled = false; }
    });
  });
}
