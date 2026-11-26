// Términos y Condiciones: lectura y aceptación (la primera vez y con cada versión nueva)
import { sb } from '../supabase.js';
import { VERSION_TERMINOS, TEXTO_TERMINOS } from '../terminos.js';
import { prepararSalida } from '../sincronizar.js';
import { mensajeError } from '../util.js';

export function vistaTerminos(app, { aceptar = false, versionAnterior = null, alTerminar = null } = {}) {
  app.innerHTML = `
    ${aceptar ? '' : `<p class="miga"><a href="${location.hash.includes('desde-login') ? '#/' : '#/ajustes'}">← Volver</a></p>`}
    ${aceptar ? `<div class="tarjeta banner">
      <h1 style="margin-top:0">${versionAnterior ? 'Actualizamos los términos' : 'Antes de empezar'}</h1>
      <p style="margin-bottom:0">${versionAnterior
        ? 'Cambiaron los Términos y Condiciones de DC. Leelos y aceptalos para seguir usando la app.'
        : 'Leé los Términos y Condiciones y la Política de Privacidad de DC. Explican cómo se guardan y protegen tus datos y los de tus clientes.'}</p>
    </div>` : ''}
    <article class="tarjeta terminos" tabindex="0">${TEXTO_TERMINOS}</article>
    ${aceptar ? `
    <form id="f-terminos" class="tarjeta">
      <label class="fila acepto">
        <input type="checkbox" id="chk-acepto" required>
        <span>Leí y acepto los <b>Términos y Condiciones de Uso y la Política de Privacidad</b> de DC (versión ${VERSION_TERMINOS}), incluido el guardado de los datos en servidores que pueden estar fuera de la Argentina.</span>
      </label>
      <div class="botones">
        <button class="btn ancho" type="submit" disabled>Acepto</button>
        <button class="btn secundario ancho" type="button" id="btn-no-acepto">No acepto (salir)</button>
      </div>
      <p class="msg error" hidden></p>
    </form>` : ''}`;

  if (!aceptar) return;
  const f = app.querySelector('#f-terminos');
  const chk = f.querySelector('#chk-acepto');
  const boton = f.querySelector('button[type=submit]');
  const msg = f.querySelector('.msg');
  chk.addEventListener('change', () => { boton.disabled = !chk.checked; });
  f.querySelector('#btn-no-acepto').addEventListener('click', async () => {
    if (!confirm('Sin aceptar los términos no se puede usar la app. ¿Salir?')) return;
    if (await prepararSalida()) sb.auth.signOut();
  });
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    msg.hidden = true;
    if (!navigator.onLine) { msg.textContent = 'Necesitás señal para aceptar los términos.'; msg.hidden = false; return; }
    boton.disabled = true;
    const { error } = await sb.rpc('aceptar_terminos', { p_version: VERSION_TERMINOS, p_dispositivo: navigator.userAgent });
    if (error) {
      msg.textContent = /aceptar_terminos|function/i.test(error.message)
        ? 'Falta un paso del administrador (sql/09_terminos.sql). Avisale a Denis.' : mensajeError(error);
      msg.hidden = false; boton.disabled = false; return;
    }
    boton.textContent = '✔ Aceptado';
    setTimeout(() => alTerminar?.(), 600);
  });
}
