import { sb } from '../supabase.js';
import { mensajeError } from '../util.js';

export function vistaLogin(app) {
  app.innerHTML = `
    <div class="login tarjeta">
      <img class="logo-login" src="iconos/emblema.png" alt="DC" style="max-width:170px">
      <h1>Ingresar</h1>
      <form id="f-login">
        <label for="email">Correo</label>
        <input id="email" name="email" type="email" autocomplete="username" required>
        <label for="clave">Contraseña</label>
        <input id="clave" name="clave" type="password" autocomplete="current-password" required>
        <div class="botones"><button class="btn ancho" type="submit">Entrar</button></div>
        <p id="login-error" class="error" hidden></p>
      </form>
      <p class="sub" style="text-align:center"><a href="#/olvide-clave">¿Olvidaste tu contraseña?</a></p>
      <p class="sub" style="text-align:center"><a href="#/terminos/desde-login">Términos, condiciones y privacidad</a></p>
    </div>`;

  const form = app.querySelector('#f-login');
  const error = app.querySelector('#login-error');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const boton = form.querySelector('button[type=submit]');
    boton.disabled = true; error.hidden = true;
    const { error: err } = await sb.auth.signInWithPassword({
      email: form.email.value.trim(),
      password: form.clave.value,
    });
    boton.disabled = false;
    if (err) { error.textContent = mensajeError(err); error.hidden = false; }
    // Si sale bien, app.js detecta la sesión nueva y muestra Inicio
  });
}
