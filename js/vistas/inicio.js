import { sb } from '../supabase.js';
import { cargarIndice, filtrar, tarjetaCliente } from '../buscar.js';
import { esc, pesos, fechaHora, fecha, etiquetaCobro } from '../util.js';

export async function vistaInicio(app) {
  // Perfil: avisar si el usuario todavía no fue activado
  const { data: { user } } = await sb.auth.getUser();
  const { data: perfil } = await sb.from('perfiles').select('nombre, rol, activo').eq('id', user.id).maybeSingle();
  if (!perfil?.activo) {
    app.innerHTML = `<div class="tarjeta"><h1>Usuario pendiente</h1>
      <p>Tu usuario todavía no fue activado. Pedile al administrador que lo active.</p></div>`;
    return;
  }

  const [turnos, deudas, clientes] = await Promise.all([
    sb.from('trabajos_resumen')
      .select('id, fecha_turno, falla_reportada, cliente_id, cliente_nombre, cliente_apellido, equipo_tipo, equipo_marca')
      .eq('estado', 'agendado').order('fecha_turno', { ascending: true, nullsFirst: false }).limit(30),
    sb.from('trabajos_resumen')
      .select('id, fecha_realizado, cliente_id, cliente_nombre, cliente_apellido, total, saldo, estado_cobro')
      .eq('estado', 'realizado').gt('saldo', 0).order('fecha_realizado', { ascending: true }),
    sb.from('clientes').select('id', { count: 'exact', head: true }).eq('eliminado', false),
  ]);
  for (const r of [turnos, deudas, clientes]) if (r.error) throw r.error;

  const hoy = new Date().toDateString();
  const turnosHoy = turnos.data.filter((t) => t.fecha_turno && new Date(t.fecha_turno).toDateString() === hoy);
  const totalDeuda = deudas.data.reduce((s, d) => s + Number(d.saldo), 0);

  app.innerHTML = `
    <h1>Hola, ${esc(perfil.nombre)} 👋</h1>
    <input class="buscador" id="buscar-inicio" type="search" placeholder="🔍 Buscar cliente: nombre, DNI, teléfono o equipo" autocomplete="off">
    <div id="resultados" hidden></div>
    <div id="tablero">
    <div class="resumen">
      <div class="tarjeta"><div class="sub">Turnos de hoy</div><div class="numero">${turnosHoy.length}</div></div>
      <div class="tarjeta"><div class="sub">Turnos pendientes</div><div class="numero">${turnos.data.length}</div></div>
      <div class="tarjeta"><div class="sub">Me deben</div><div class="numero deuda">${pesos(totalDeuda)}</div></div>
      <div class="tarjeta"><div class="sub">Clientes</div><div class="numero">${clientes.count ?? 0}</div></div>
    </div>

    <div class="botones dos"><a class="btn" href="#/trabajo-nuevo">+ Trabajo / turno</a><a class="btn secundario" href="#/cliente-nuevo">+ Cliente</a></div>

    <h2>Próximos turnos</h2>
    ${turnos.data.length ? turnos.data.map((t) => `
      <a class="tarjeta" href="#/trabajo/${esc(t.id)}">
        <div class="fila">
          <div class="titulo">${esc(t.cliente_nombre)} ${esc(t.cliente_apellido)}</div>
          <span class="etiqueta agendado">${t.fecha_turno ? esc(fechaHora(t.fecha_turno)) : 'Sin fecha'}</span>
        </div>
        <div class="sub">${esc([t.equipo_tipo, t.equipo_marca].filter(Boolean).join(' '))}${t.falla_reportada ? ' — ' + esc(t.falla_reportada) : ''}</div>
      </a>`).join('') : '<p class="vacio">No hay turnos agendados.</p>'}

    <h2>Me deben</h2>
    ${deudas.data.length ? deudas.data.map((d) => `
      <a class="tarjeta" href="#/trabajo/${esc(d.id)}">
        <div class="fila">
          <div class="titulo">${esc(d.cliente_nombre)} ${esc(d.cliente_apellido)}</div>
          <strong>${pesos(d.saldo)}</strong>
        </div>
        <div class="sub">Trabajo del ${esc(fecha(d.fecha_realizado))} · total ${pesos(d.total)} ${etiquetaCobro(d.estado_cobro)}</div>
      </a>`).join('') : '<p class="vacio">Nadie te debe nada. 🎉</p>'}
    </div>
  `;

  // Buscador: mientras haya texto, muestra resultados en lugar del tablero
  const input = app.querySelector('#buscar-inicio');
  const resultados = app.querySelector('#resultados');
  const tablero = app.querySelector('#tablero');
  let indice = null;
  input.addEventListener('input', async () => {
    const texto = input.value;
    const hay = texto.trim() !== '';
    tablero.hidden = hay;
    resultados.hidden = !hay;
    if (!hay) return;
    if (!indice) {
      resultados.innerHTML = '<p class="vacio">Buscando…</p>';
      try { indice = await cargarIndice(); } catch (err) { resultados.innerHTML = `<p class="error">${esc(err.message)}</p>`; return; }
    }
    if (input.value !== texto) return; // ya escribió otra cosa
    const res = filtrar(indice, texto).slice(0, 30);
    resultados.innerHTML = res.length
      ? res.map(tarjetaCliente).join('')
      : `<p class="vacio">No se encontró ningún cliente.</p><div class="botones"><a class="btn secundario" href="#/cliente-nuevo">+ Cargar cliente nuevo</a></div>`;
  });
}
