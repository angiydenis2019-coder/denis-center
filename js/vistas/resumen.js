import { sb } from '../supabase.js';
import { esc, pesos, FORMAS_PAGO } from '../util.js';

// Mes que se está mirando (se recuerda mientras la app esté abierta)
let mes = primerDia(new Date());
function primerDia(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
const sumarMeses = (d, n) => new Date(d.getFullYear(), d.getMonth() + n, 1);
const fmtMes = new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric' });
const fmtMesCorto = new Intl.DateTimeFormat('es-AR', { month: 'short' });
const mayus = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const enMes = (iso, m) => { const d = new Date(iso); return d >= m && d < sumarMeses(m, 1); };

async function traer(tabla, columnas, campoFecha, desde, hasta, extra = (q) => q) {
  const filas = [];
  for (let i = 0; ; i += 1000) {
    const { data, error } = await extra(sb.from(tabla).select(columnas)
      .gte(campoFecha, desde.toISOString()).lt(campoFecha, hasta.toISOString())).range(i, i + 999);
    if (error) throw error;
    filas.push(...data);
    if (data.length < 1000) return filas;
  }
}

export async function vistaResumen(app) {
  const desde6 = sumarMeses(mes, -5);
  const hasta = sumarMeses(mes, 1);

  const [trabajos, pagos, deudas] = await Promise.all([
    traer('trabajos_resumen', 'id, fecha_realizado, mano_obra, total_repuestos, total, saldo, equipo_tipo, tecnico_id',
      'fecha_realizado', desde6, hasta, (q) => q.eq('estado', 'realizado')),
    traer('pagos', 'fecha, monto, forma_pago', 'fecha', desde6, hasta, (q) => q.eq('eliminado', false)),
    sb.from('trabajos_resumen').select('saldo').eq('estado', 'realizado').gt('saldo', 0),
  ]);
  if (deudas.error) throw deudas.error;

  const tMes = trabajos.filter((t) => enMes(t.fecha_realizado, mes));
  const pMes = pagos.filter((p) => enMes(p.fecha, mes));
  const suma = (arr, f) => arr.reduce((a, x) => a + (Number(x[f]) || 0), 0);

  const cobrado = suma(pMes, 'monto');
  const facturado = suma(tMes, 'total');
  const manoObra = suma(tMes, 'mano_obra');
  const repuestos = suma(tMes, 'total_repuestos');
  const pendienteMes = suma(tMes.filter((t) => Number(t.saldo) > 0), 'saldo');
  const deudaTotal = suma(deudas.data, 'saldo');
  const promedio = tMes.length ? facturado / tMes.length : 0;

  // Últimos 6 meses (cobrado)
  const meses = Array.from({ length: 6 }, (_, i) => sumarMeses(desde6, i));
  const serie = meses.map((m) => ({
    m, cobrado: suma(pagos.filter((p) => enMes(p.fecha, m)), 'monto'),
    trabajos: trabajos.filter((t) => enMes(t.fecha_realizado, m)).length,
  }));
  const maxSerie = Math.max(1, ...serie.map((s) => s.cobrado));

  // Por forma de pago y por tipo de equipo (mes elegido)
  const agrupar = (arr, clave, valor) => {
    const g = {};
    arr.forEach((x) => { const k = clave(x); g[k] = g[k] || { n: 0, v: 0 }; g[k].n++; g[k].v += Number(x[valor]) || 0; });
    return Object.entries(g).sort((a, b) => b[1].v - a[1].v);
  };
  const porForma = agrupar(pMes, (p) => FORMAS_PAGO[p.forma_pago] || p.forma_pago, 'monto');
  const porTipo = agrupar(tMes, (t) => (t.equipo_tipo ? mayus(t.equipo_tipo.trim().toLowerCase()) : 'Sin equipo / general'), 'total');

  const barras = (grupos, total) => grupos.length ? grupos.map(([nombre, g]) => `
    <div class="barra-fila">
      <div class="fila"><span>${esc(nombre)} <span class="sub">(${g.n})</span></span><b>${pesos(g.v)}</b></div>
      <div class="barra-pista"><div class="barra-relleno" style="width:${total ? Math.max(2, (g.v / total) * 100) : 0}%"></div></div>
    </div>`).join('') : '<p class="vacio">Sin datos este mes.</p>';

  app.innerHTML = `
    <p class="miga"><a href="#/gestion">← Gestión</a></p>
    <h1>Resumen de ganancias</h1>
    <div class="fila agenda-nav">
      <button class="btn secundario" data-mover="-1" aria-label="Mes anterior">‹</button>
      <div class="agenda-titulo">${esc(mayus(fmtMes.format(mes)))}</div>
      <button class="btn secundario" data-mover="1" aria-label="Mes siguiente" ${sumarMeses(mes, 1) > new Date() ? 'disabled' : ''}>›</button>
    </div>

    <div class="resumen">
      <div class="tarjeta"><div class="sub">Cobrado en el mes</div><div class="numero">${pesos(cobrado)}</div></div>
      <div class="tarjeta"><div class="sub">Trabajos realizados</div><div class="numero">${tMes.length}</div></div>
      <div class="tarjeta"><div class="sub">Facturado (total trabajos)</div><div class="numero">${pesos(facturado)}</div></div>
      <div class="tarjeta"><div class="sub">Promedio por trabajo</div><div class="numero">${pesos(promedio)}</div></div>
    </div>

    <div class="tarjeta" style="margin-top:10px">
      <div class="fila linea"><span>Mano de obra</span><b>${pesos(manoObra)}</b></div>
      <div class="fila linea"><span>Repuestos cobrados</span><b>${pesos(repuestos)}</b></div>
      <div class="fila linea"><span>Pendiente de los trabajos del mes</span><b class="txt-deuda">${pesos(pendienteMes)}</b></div>
      <div class="fila linea total"><span>Te deben en total (todos los meses)</span><span class="txt-deuda">${pesos(deudaTotal)}</span></div>
      <p class="sub" style="margin-bottom:0">"Cobrado" es la plata que entró en el mes (incluye pagos de trabajos anteriores). Los repuestos se muestran a precio de venta, no a costo.</p>
    </div>

    <h2>Cobrado por mes</h2>
    <div class="tarjeta">
      <div class="grafico" role="img" aria-label="Cobrado en los últimos 6 meses">
        ${serie.map((s) => `
          <div class="col ${s.m.getTime() === mes.getTime() ? 'actual' : ''}" title="${esc(mayus(fmtMes.format(s.m)))}: ${pesos(s.cobrado)} · ${s.trabajos} trabajos">
            <span class="col-valor">${s.cobrado ? pesos(s.cobrado).replace(/\s/g, '') : ''}</span>
            <div class="col-barra" style="height:${(s.cobrado / maxSerie) * 100}%"></div>
            <span class="col-mes">${esc(fmtMesCorto.format(s.m).replace('.', ''))}</span>
          </div>`).join('')}
      </div>
      <details class="ayuda-det"><summary>Ver como tabla</summary>
        <table class="tabla"><thead><tr><th>Mes</th><th>Trabajos</th><th>Cobrado</th></tr></thead><tbody>
        ${serie.map((s) => `<tr><td>${esc(mayus(fmtMes.format(s.m)))}</td><td>${s.trabajos}</td><td>${pesos(s.cobrado)}</td></tr>`).join('')}
        </tbody></table>
      </details>
    </div>

    <h2>Cómo te pagaron</h2>
    <div class="tarjeta">${barras(porForma, cobrado)}</div>

    <h2>Por tipo de equipo</h2>
    <div class="tarjeta">${barras(porTipo, facturado)}</div>
  `;

  app.querySelectorAll('[data-mover]').forEach((b) => b.addEventListener('click', () => {
    mes = sumarMeses(mes, Number(b.dataset.mover)); vistaResumen(app);
  }));
}
