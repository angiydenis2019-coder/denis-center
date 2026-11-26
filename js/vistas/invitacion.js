// Formulario PÚBLICO de invitación: el técnico invitado carga sus datos
// (sin cuenta todavía) y acepta los términos. Después el superadministrador aprueba.
import { sb } from '../supabase.js';
import { VERSION_TERMINOS, TEXTO_TERMINOS } from '../terminos.js';
import { esc, mensajeError } from '../util.js';

const MENSAJES = {
  usada: ['Este link ya fue usado', 'Tus datos ya se enviaron. Denis los va a revisar y te va a mandar el acceso por WhatsApp.'],
  vencida: ['Este link venció', 'Los links de invitación duran 7 días. Pedile a Denis que te mande uno nuevo.'],
  anulada: ['Invitación anulada', 'Esta invitación ya no está disponible. Si creés que es un error, comunicate con Denis.'],
  inexistente: ['Link no válido', 'Revisá que hayas abierto el link completo que te llegó por WhatsApp.'],
};

function cartel(app, titulo, texto, ok = false) {
  app.innerHTML = `
    <div class="login tarjeta">
      <img class="logo-login" src="iconos/emblema.png" alt="DC" style="max-width:140px">
      <h1>${ok ? '✔ ' : ''}${esc(titulo)}</h1>
      <p>${esc(texto)}</p>
    </div>`;
}

export async function vistaInvitacion(app, token) {
  app.innerHTML = '<p class="vacio">Cargando…</p>';
  if (!navigator.onLine) return cartel(app, 'Sin conexión', 'Necesitás señal para completar el formulario. Probá de nuevo en un rato.');
  const { data: estado, error } = await sb.rpc('invitacion_estado', { p_token: token || '' });
  if (error) return cartel(app, 'No se pudo abrir la invitación', mensajeError(error));
  if (estado !== 'valida') return cartel(app, ...(MENSAJES[estado] || MENSAJES.inexistente));

  app.innerHTML = `
    <div class="tarjeta banner">
      <img src="iconos/emblema.png" alt="DC" style="width:64px;float:right;margin-left:12px">
      <h1 style="margin-top:0">Bienvenido a DC</h1>
      <p style="margin-bottom:0">Completá tus datos para crear tu cuenta. Es la app para registrar tus trabajos, clientes, turnos, presupuestos y garantías.</p>
    </div>
    <form id="f-inv" class="tarjeta" autocomplete="on">
      <label for="iv-apellido">Apellido</label>
      <input id="iv-apellido" name="apellido" required minlength="2" autocomplete="family-name" autocapitalize="words">
      <label for="iv-nombre">Nombre</label>
      <input id="iv-nombre" name="nombre" required minlength="2" autocomplete="given-name" autocapitalize="words">
      <label for="iv-localidad">Localidad</label>
      <input id="iv-localidad" name="localidad" required autocomplete="address-level2" autocapitalize="words">
      <label for="iv-negocio">Nombre de tu negocio <span class="ayuda">— opcional</span></label>
      <input id="iv-negocio" name="negocio" placeholder="ej: Frío Total" autocapitalize="words">
      <label for="iv-email">Correo electrónico <span class="ayuda">— con este vas a entrar a la app</span></label>
      <input id="iv-email" name="email" type="email" required autocomplete="email" autocapitalize="none">
      <label for="iv-tel">Celular con WhatsApp</label>
      <input id="iv-tel" name="telefono" type="tel" required inputmode="tel" autocomplete="tel" placeholder="ej: 3718 123456">

      <details class="ayuda-det" style="margin-top:14px">
        <summary>Leer los Términos y Condiciones y la Política de Privacidad</summary>
        <div class="terminos" style="max-height:50vh;overflow:auto;margin-top:8px">${TEXTO_TERMINOS}</div>
      </details>
      <label class="fila acepto" style="margin-top:10px">
        <input type="checkbox" name="acepto" required>
        <span>Leí y acepto los <b>Términos y Condiciones de Uso y la Política de Privacidad</b> de DC (versión ${VERSION_TERMINOS}), incluido el guardado de los datos en servidores que pueden estar fuera de la Argentina.</span>
      </label>
      <div class="botones"><button class="btn ancho" type="submit">Enviar mis datos</button></div>
      <p class="msg error" hidden></p>
    </form>`;

  const f = app.querySelector('#f-inv');
  const msg = f.querySelector('.msg');
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    msg.hidden = true;
    const boton = f.querySelector('button[type=submit]');
    boton.disabled = true; boton.textContent = 'Enviando…';
    const { error: err } = await sb.rpc('invitacion_completar', {
      p_token: token,
      p_apellido: f.apellido.value, p_nombre: f.nombre.value, p_localidad: f.localidad.value,
      p_negocio: f.negocio.value, p_email: f.email.value, p_telefono: f.telefono.value,
      p_terminos_version: f.acepto.checked ? VERSION_TERMINOS : '',
      p_dispositivo: navigator.userAgent,
    });
    if (err) {
      msg.textContent = mensajeError(err); msg.hidden = false;
      boton.disabled = false; boton.textContent = 'Enviar mis datos';
      return;
    }
    window.scrollTo(0, 0);
    cartel(app, '¡Listo, datos enviados!', 'Denis va a revisar tu solicitud y te va a mandar por WhatsApp el acceso a la app con una contraseña provisoria. Ya podés cerrar esta página.', true);
  });
}
