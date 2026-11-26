// Pestaña GESTIÓN: presupuestos, ganancias, lista de precios y papelera
import { sb } from '../supabase.js';
import { ic } from '../iconos.js';
import { miPerfil } from '../negocio.js';
import { pesos } from '../util.js';

export async function vistaGestion(app) {
  const esAdmin = (miPerfil()?.rol || 'admin') === 'admin';
  const ahora = new Date();
  const inicioMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1).toISOString();

  app.innerHTML = `
    <h1>Gestión</h1>
    <div class="resumen">
      <a class="tarjeta" href="#/presupuestos"><div class="sub">Presupuestos sin respuesta ›</div><div class="numero" id="g-pres">…</div></a>
      ${esAdmin ? `<a class="tarjeta" href="#/resumen"><div class="sub">Cobrado este mes ›</div><div class="numero" id="g-mes">…</div></a>` : ''}
    </div>
    <div class="tarjeta">
      <a class="enlace-fila" href="#/presupuestos"><span class="con-ic">${ic('documento')} Presupuestos</span> <span>›</span></a>
      ${esAdmin ? `<a class="enlace-fila" href="#/resumen"><span class="con-ic">${ic('grafico')} Resumen de ganancias</span> <span>›</span></a>` : ''}
      <a class="enlace-fila" href="#/precios"><span class="con-ic">${ic('precio')} Lista de precios</span> <span>›</span></a>
      ${esAdmin ? `<a class="enlace-fila" href="#/papelera"><span class="con-ic">${ic('basura')} Papelera</span> <span>›</span></a>` : ''}
    </div>`;

  // Números rápidos (si fallan, se muestra un guion)
  const [pres, pagos] = await Promise.all([
    sb.from('presupuestos').select('id', { count: 'exact', head: true }).eq('eliminado', false).in('estado', ['borrador', 'enviado']),
    esAdmin ? sb.from('pagos').select('monto').eq('eliminado', false).gte('fecha', inicioMes) : Promise.resolve({ data: [] }),
  ]);
  const elPres = app.querySelector('#g-pres');
  if (elPres) elPres.textContent = pres.error ? '–' : String(pres.count ?? 0);
  const elMes = app.querySelector('#g-mes');
  if (elMes) elMes.textContent = pagos.error ? '–' : pesos((pagos.data || []).reduce((s, p) => s + Number(p.monto || 0), 0));
}
