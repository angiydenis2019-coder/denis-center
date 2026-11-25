// Denis Center 1.0 — arranque, sesión y navegación entre pantallas
import { sb, configurado } from './supabase.js';
import { vistaLogin } from './vistas/login.js';
import { vistaInicio } from './vistas/inicio.js';
import { vistaClientes, vistaClienteFicha, vistaClienteFormulario } from './vistas/clientes.js';
import { vistaEquipoFicha, vistaEquipoFormulario } from './vistas/equipos.js';
import { vistaTrabajoDetalle, vistaTrabajoFormulario } from './vistas/trabajos.js';
import { esc } from './util.js';

const app = document.getElementById('app');
const nav = document.getElementById('nav');
const btnSalir = document.getElementById('btn-salir');
let sesion = null;

// Rutas: #/nombre/param1/param2 (ver tabla abajo)
const rutas = {
  'inicio':         () => vistaInicio(app),
  'clientes':       () => vistaClientes(app),
  'cliente':        (id) => vistaClienteFicha(app, id),
  'cliente-nuevo':  () => vistaClienteFormulario(app, null),
  'cliente-editar': (id) => vistaClienteFormulario(app, id),
  'equipo':         (id) => vistaEquipoFicha(app, id),
  'equipo-nuevo':   (clienteId) => vistaEquipoFormulario(app, { clienteId }),
  'equipo-editar':  (id) => vistaEquipoFormulario(app, { id }),
  'trabajo':        (id) => vistaTrabajoDetalle(app, id),
  'trabajo-nuevo':  (clienteId, equipoId) => vistaTrabajoFormulario(app, { clienteId, equipoId }),
  'trabajo-editar': (id, extra) => vistaTrabajoFormulario(app, { id, completar: extra === 'completar' }),
};

async function navegar() {
  if (!configurado) {
    app.innerHTML = `<div class="tarjeta"><h1>Falta configurar</h1>
      <p>Abrí <b>js/config.js</b> y pegá la URL y la clave pública de tu proyecto de Supabase.</p></div>`;
    return;
  }
  if (!sesion) {
    nav.hidden = true; btnSalir.hidden = true;
    return vistaLogin(app);
  }
  nav.hidden = false; btnSalir.hidden = false;

  const [nombre, id, extra] = location.hash.replace(/^#\//, '').split('/');
  const ruta = rutas[nombre] ? nombre : 'inicio';
  nav.querySelectorAll('a').forEach((a) => {
    const r = a.dataset.ruta;
    a.classList.toggle('activo', r === ruta || (r === 'clientes' && /^(cliente|equipo|trabajo)/.test(ruta)));
  });

  app.innerHTML = '<p class="vacio">Cargando…</p>';
  try {
    await rutas[ruta](id || null, extra || null);
  } catch (err) {
    console.error(err);
    app.innerHTML = `<div class="tarjeta"><p class="error">Ocurrió un error: ${esc(err.message || err)}</p></div>`;
  }
  window.scrollTo(0, 0);
}

btnSalir.addEventListener('click', async () => {
  await sb.auth.signOut();
});

window.addEventListener('hashchange', navegar);

// Aviso de conexión
const aviso = document.getElementById('aviso-offline');
const actualizarConexion = () => { aviso.hidden = navigator.onLine; };
window.addEventListener('online', actualizarConexion);
window.addEventListener('offline', actualizarConexion);
actualizarConexion();

// Service worker (permite instalar la app y abrirla sin señal)
// Al abrir la app (o volver a ella) busca si hay una versión nueva y, si la hay, recarga sola.
if ('serviceWorker' in navigator) {
  const habiaVersion = !!navigator.serviceWorker.controller;
  let recargando = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (habiaVersion && !recargando) { recargando = true; location.reload(); }
  });
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' })
    .then((reg) => {
      reg.update();
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') reg.update();
      });
    })
    .catch((e) => console.warn('SW no registrado', e));
}

// Arranque
if (configurado) {
  const { data } = await sb.auth.getSession();
  sesion = data.session;
  sb.auth.onAuthStateChange((_evento, nueva) => {
    const cambio = !!nueva !== !!sesion;
    sesion = nueva;
    if (cambio) {
      if (sesion && !location.hash) location.hash = '#/inicio';
      navegar();
    }
  });
}
navegar();
