// Denis Center 1.0 — arranque, sesión y navegación entre pantallas
import { sb, configurado } from './supabase.js';
import { vistaLogin } from './vistas/login.js';
import { vistaInicio } from './vistas/inicio.js';
import { vistaClientes, vistaClienteFicha, vistaClienteFormulario } from './vistas/clientes.js';
import { vistaEquipoFicha, vistaEquipoFormulario } from './vistas/equipos.js';
import { vistaTrabajoDetalle, vistaTrabajoFormulario } from './vistas/trabajos.js';
import { vistaAjustes } from './vistas/ajustes.js';
import { vistaAgenda } from './vistas/agenda.js';
import { vistaPrecios } from './vistas/precios.js';
import { vistaResumen } from './vistas/resumen.js';
import { vistaPresupuestos, vistaPresupuestoDetalle, vistaPresupuestoFormulario } from './vistas/presupuestos.js';
import { cargarNegocio } from './negocio.js';
import { iniciarSincronizacion, prepararSalida, pedirSincronizacion } from './sincronizar.js';
import { esc } from './util.js';
import { siguienteTema, temaActual, aplicarTema } from './tema.js';

const app = document.getElementById('app');
const nav = document.getElementById('nav');
const btnSalir = document.getElementById('btn-salir');
const btnTema = document.getElementById('btn-tema');
const fab = document.getElementById('fab');
let sesion = null;
let negocioCargado = false;

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
  'ajustes':        () => vistaAjustes(app),
  'agenda':         () => vistaAgenda(app),
  'precios':        () => vistaPrecios(app),
  'resumen':        () => vistaResumen(app),
  'presupuestos':   () => vistaPresupuestos(app),
  'presupuesto':    (id) => vistaPresupuestoDetalle(app, id),
  'presupuesto-nuevo': (clienteId, equipoId) => vistaPresupuestoFormulario(app, { clienteId, equipoId }),
  'presupuesto-editar': (id) => vistaPresupuestoFormulario(app, { id }),
  'trabajo-editar': (id, extra) => vistaTrabajoFormulario(app, { id, completar: extra === 'completar' }),
};

async function navegar() {
  if (!configurado) {
    app.innerHTML = `<div class="tarjeta"><h1>Falta configurar</h1>
      <p>Abrí <b>js/config.js</b> y pegá la URL y la clave pública de tu proyecto de Supabase.</p></div>`;
    return;
  }
  if (!sesion) {
    nav.hidden = true; btnSalir.hidden = true; btnTema.hidden = true; fab.hidden = true;
    document.body.classList.remove('con-fab');
    return vistaLogin(app);
  }
  nav.hidden = false; btnSalir.hidden = false; btnTema.hidden = false;
  arrancarSync();
  if (!negocioCargado) { negocioCargado = true; cargarNegocio().catch(() => {}); }

  const [nombre, id, extra] = location.hash.replace(/^#\//, '').split('/');
  const ruta = rutas[nombre] ? nombre : 'inicio';
  nav.querySelectorAll('a').forEach((a) => {
    const r = a.dataset.ruta;
    a.classList.toggle('activo', r === ruta || (r === 'clientes' && /^(cliente|equipo|trabajo|presupuesto-|presupuesto$)/.test(ruta)) || (r === 'ajustes' && /^(precios|resumen|presupuestos)/.test(ruta)));
  });

  fab.hidden = !['inicio', 'agenda', 'clientes', 'cliente', 'equipo'].includes(ruta);
  document.body.classList.toggle('con-fab', !fab.hidden);
  app.innerHTML = '<p class="vacio">Cargando…</p>';
  try {
    await rutas[ruta](id || null, extra || null);
  } catch (err) {
    console.error(err);
    app.innerHTML = `<div class="tarjeta"><p class="error">Ocurrió un error: ${esc(err.message || err)}</p></div>`;
  }
  window.scrollTo(0, 0);
}

aplicarTema(temaActual());
btnTema.addEventListener('click', () => {
  const t = siguienteTema();
  btnTema.title = 'Estilo: ' + t.nombre;
  // Si estás en Ajustes, refrescar la selección
  document.querySelectorAll('[data-tema-op]').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.temaOp === t.id)));
});

btnSalir.addEventListener('click', async () => {
  if (!(await prepararSalida())) return;
  await sb.auth.signOut();
});

// Modo sin señal: al terminar de subir cambios, refresca la pantalla (salvo que estés escribiendo)
let syncIniciada = false;
function arrancarSync() {
  if (syncIniciada) { pedirSincronizacion(); return; }
  syncIniciada = true;
  iniciarSincronizacion({
    alActualizar: () => {
      if (/-(nuevo|editar)/.test(location.hash) || document.activeElement?.matches('input, textarea, select')) return;
      navegar();
    },
  });
}

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
      if (!reg) return;
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
      negocioCargado = false;
      if (sesion && !location.hash) location.hash = '#/inicio';
      navegar();
    }
  });
}
navegar();
