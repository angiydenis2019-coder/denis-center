// Pantallas de la cuenta: elegir contraseña propia y cuenta suspendida
import { sb } from '../supabase.js';
import { negocio } from '../negocio.js';
import { prepararSalida } from '../sincronizar.js';
import { esc, mensajeError } from '../util.js';

// Primera vez (contraseña provisoria) o cuando el usuario quiere cambiarla
export function vistaCambiarClave(app, { voluntario = false, alTerminar = null } = {}) {
  app.innerHTML = `
    ${voluntario ? '<p class="miga"><a href="#/ajustes">← Volver a Ajustes</a></p>' : ''}
    <div class="login tarjeta">
      ${voluntario ? '' : '<img class="logo-login" src="iconos/emblema.png" alt="DC" style="max-width:140px">'}
      <h1>${voluntario ? 'Cambiar contraseña' : '¡Bienvenido!'}</h1>
      ${voluntario ? '' : `<p>Entraste con una contraseña provisoria. Elegí una propia para <b>${esc(negocio().nombre || 'tu negocio')}</b>. Solo vos la vas a saber.</p>`}
      <form id="f-clave">
        <label for="clave1">Contraseña nueva <span class="ayuda">— mínimo 8 letras o números</span></label>
        <input id="clave1" name="clave1" type="password" autocomplete="new-password" minlength="8" required>
        <label for="clave2">Repetila</label>
        <input id="clave2" name="clave2" type="password" autocomplete="new-password" minlength="8" required>
        <label class="fila" style="font-weight:500; cursor:pointer; margin-top:8px">
          <span>Mostrar lo que escribo</span>
          <input type="checkbox" id="ver-clave" style="width:22px;height:22px">
        </label>
        <div class="botones"><button class="btn ancho" type="submit">Guardar contraseña</button></div>
        <p class="msg error" hidden></p>
      </form>
      ${voluntario ? '' : '<p class="sub"><a href="#" id="salir-clave">Salir</a></p>'}
    </div>`;

  const f = app.querySelector('#f-clave');
  const msg = f.querySelector('.msg');
  app.querySelector('#ver-clave').addEventListener('change', (e) => {
    f.clave1.type = f.clave2.type = e.target.checked ? 'text' : 'password';
  });
  app.querySelector('#salir-clave')?.addEventListener('click', async (e) => { e.preventDefault(); if (await prepararSalida()) sb.auth.signOut(); });

  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    msg.hidden = true;
    const c1 = f.clave1.value, c2 = f.clave2.value;
    const mal = (t) => { msg.textContent = t; msg.hidden = false; };
    if (c1.length < 8) return mal('Tiene que tener al menos 8 caracteres.');
    if (c1 !== c2) return mal('Las dos contraseñas no coinciden.');
    if (!navigator.onLine) return mal('Necesitás señal para cambiar la contraseña.');
    const boton = f.querySelector('button[type=submit]');
    boton.disabled = true;
    const { error } = await sb.auth.updateUser({ password: c1 });
    if (error) { boton.disabled = false; return mal(/same|different/i.test(error.message) ? 'Tiene que ser distinta a la provisoria.' : mensajeError(error)); }
    await sb.rpc('marcar_clave_cambiada');
    boton.textContent = '✔ Contraseña guardada';
    setTimeout(() => (alTerminar ? alTerminar() : (location.hash = '#/ajustes')), 900);
  });
}

export function vistaSuspendida(app) {
  app.innerHTML = `
    <div class="login tarjeta">
      <img class="logo-login" src="iconos/emblema.png" alt="DC" style="max-width:140px">
      <h1>Cuenta suspendida</h1>
      <p>La cuenta de <b>${esc(negocio().nombre || 'este negocio')}</b> está pausada por el administrador de DC.</p>
      <p>Tus datos <b>no se borraron</b>: siguen guardados y vuelven a aparecer cuando se reactive la cuenta.</p>
      <p class="sub">Comunicate con el administrador para reactivarla.</p>
      <div class="botones"><button class="btn secundario ancho" id="btn-salir-susp" type="button">Salir</button></div>
    </div>`;
  app.querySelector('#btn-salir-susp').addEventListener('click', async () => { if (await prepararSalida()) sb.auth.signOut(); });
}
