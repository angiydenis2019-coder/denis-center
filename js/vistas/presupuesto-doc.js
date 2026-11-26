// Presupuesto como documento (imagen o PDF) para mandar al cliente,
// con el logo y los datos del técnico. Pantalla #/presupuesto-doc/<id>
import { sb } from '../supabase.js';
import { ic } from '../iconos.js';
import { negocio, cargarNegocio, datosTransferencia } from '../negocio.js';
import { esc, pesos, fecha, nombreCompleto, descEquipo } from '../util.js';
import { cargarLogo, renglones } from './recibo.js';
import { vence, numeroTxt, totalDe } from './presupuestos.js';

const ANCHO = 1240;              // A4 a 150 ppp
const ALTO_A4 = 1754;
const M = 80;
const NAVY = '#0b2e5c', AZUL = '#1f7be6', CELESTE = '#2f8cf0', TEXTO = '#12233d', GRIS = '#5a6b82', FILA = '#f2f7fd';
const TITULOS = "'Montserrat', 'Inter', system-ui, sans-serif";
const CUERPO = "'Inter', system-ui, sans-serif";

export async function dibujarPresupuesto(d) {
  await document.fonts?.ready;
  const logo = await cargarLogo(d.negocio.logo_url);
  const c = document.createElement('canvas');
  c.width = ANCHO; c.height = 4000;
  const x = c.getContext('2d');
  x.fillStyle = '#fff'; x.fillRect(0, 0, ANCHO, c.height);

  // --- Encabezado con franjas
  const H = 300;
  x.fillStyle = NAVY; x.fillRect(0, 0, ANCHO, H);
  x.fillStyle = AZUL;
  x.beginPath(); x.moveTo(560, 0); x.lineTo(900, 0); x.lineTo(700, H); x.lineTo(360, H); x.closePath(); x.fill();
  x.fillStyle = CELESTE; x.globalAlpha = 0.55;
  x.beginPath(); x.moveTo(930, 0); x.lineTo(990, 0); x.lineTo(790, H); x.lineTo(730, H); x.closePath(); x.fill();
  x.globalAlpha = 1;

  // Logo en recuadro blanco
  const L = 190, lx = M, ly = (H - L) / 2;
  x.fillStyle = '#fff'; x.beginPath(); x.roundRect(lx, ly, L, L, 22); x.fill();
  if (logo) {
    const e = Math.min((L - 20) / logo.width, (L - 20) / logo.height);
    const w = logo.width * e, h = logo.height * e;
    x.drawImage(logo, lx + (L - w) / 2, ly + (L - h) / 2, w, h);
  } else {
    const ini = (d.negocio.nombre || 'DC').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('');
    x.fillStyle = NAVY; x.font = `italic 800 80px ${TITULOS}`; x.textAlign = 'center'; x.fillText(ini, lx + L / 2, ly + L / 2 + 28);
  }

  // Nombre y contacto del negocio
  x.textAlign = 'left'; x.fillStyle = '#fff';
  let ty = 118;
  x.font = `800 40px ${TITULOS}`;
  renglones(x, d.negocio.nombre, 340).slice(0, 2).forEach((l) => { x.fillText(l, lx + L + 30, ty); ty += 46; });
  x.font = `500 27px ${CUERPO}`;
  [d.negocio.tecnico, d.negocio.telefono && `Tel. ${d.negocio.telefono}`, d.negocio.direccion].filter(Boolean).slice(0, 3)
    .forEach((l) => { x.fillText(renglones(x, String(l), 340)[0] || '', lx + L + 30, ty); ty += 36; });

  // Título
  x.textAlign = 'right'; x.font = `800 64px ${TITULOS}`; x.fillText('PRESUPUESTO', ANCHO - M, 135);
  x.font = `600 34px ${CUERPO}`; x.fillText(d.numero, ANCHO - M, 190);

  // --- Cliente y datos
  let y = H + 80;
  const colDer = 720;
  x.textAlign = 'left';
  x.fillStyle = TEXTO; x.font = `800 30px ${TITULOS}`; x.fillText('PARA', M, y);
  x.font = `700 36px ${CUERPO}`; x.fillText(d.cliente, M, y + 48);
  x.fillStyle = GRIS; x.font = `500 28px ${CUERPO}`;
  let cy = y + 92;
  [d.dni && `DNI ${d.dni}`, d.telCliente, d.dirCliente].filter(Boolean).forEach((l) => {
    renglones(x, l, colDer - M - 40).slice(0, 2).forEach((r) => { x.fillText(r, M, cy); cy += 38; });
  });

  const meta = [['FECHA', d.fecha], ['VÁLIDO HASTA', d.vence], d.equipo && ['EQUIPO', d.equipo]].filter(Boolean);
  let my = y;
  meta.forEach(([k, v]) => {
    x.fillStyle = TEXTO; x.font = `800 26px ${TITULOS}`; x.textAlign = 'left'; x.fillText(k, colDer, my);
    x.fillStyle = GRIS; x.font = `500 27px ${CUERPO}`; x.textAlign = 'right';
    const r = renglones(x, v, 300);
    r.slice(0, 2).forEach((l, i) => x.fillText(l, ANCHO - M, my + i * 34));
    my += 34 * Math.min(r.length, 2) + 16;
  });
  y = Math.max(cy, my) + 30;

  if (d.trabajo) {
    x.textAlign = 'left'; x.fillStyle = TEXTO; x.font = `800 26px ${TITULOS}`; x.fillText('TRABAJO', M, y);
    x.fillStyle = TEXTO; x.font = `500 30px ${CUERPO}`;
    renglones(x, d.trabajo, ANCHO - M * 2 - 170).forEach((l) => { x.fillText(l, M + 170, y); y += 40; });
    y += 24;
  }

  // --- Tabla
  const W = ANCHO - M * 2;
  const cols = [{ t: 'DESCRIPCIÓN', w: W - 520, a: 'left' }, { t: 'CANT.', w: 120, a: 'center' }, { t: 'PRECIO', w: 200, a: 'right' }, { t: 'IMPORTE', w: 200, a: 'right' }];
  const xs = []; cols.reduce((acc, col) => { xs.push(acc); return acc + col.w; }, M);
  const celda = (txt, i, yy) => {
    const col = cols[i]; x.textAlign = col.a;
    const px = col.a === 'left' ? xs[i] + 20 : col.a === 'center' ? xs[i] + col.w / 2 : xs[i] + col.w - 20;
    x.fillText(txt, px, yy);
  };
  x.fillStyle = CELESTE; x.fillRect(M, y, W, 64);
  x.fillStyle = '#fff'; x.font = `700 26px ${TITULOS}`;
  cols.forEach((col, i) => celda(col.t, i, y + 42));
  y += 64;
  x.font = `500 28px ${CUERPO}`;
  d.filas.forEach((f, n) => {
    const ls = renglones(x, f.desc, cols[0].w - 40);
    const alto = Math.max(64, 26 + ls.length * 36);
    if (n % 2) { x.fillStyle = FILA; x.fillRect(M, y, W, alto); }
    x.fillStyle = TEXTO;
    ls.forEach((l, i) => { x.textAlign = 'left'; x.fillText(l, xs[0] + 20, y + 42 + i * 36); });
    celda(f.cant, 1, y + 42); celda(f.precio, 2, y + 42); celda(f.importe, 3, y + 42);
    y += alto;
    x.strokeStyle = '#dbe6f3'; x.lineWidth = 2; x.beginPath(); x.moveTo(M, y); x.lineTo(M + W, y); x.stroke();
  });

  // --- Total y formas de pago
  y += 26;
  const tw = 470;
  x.fillStyle = CELESTE; x.fillRect(ANCHO - M - tw, y, tw, 84);
  x.fillStyle = '#fff'; x.font = `800 32px ${TITULOS}`; x.textAlign = 'left'; x.fillText('TOTAL', ANCHO - M - tw + 24, y + 54);
  x.textAlign = 'right'; x.font = `800 40px ${TITULOS}`; x.fillText(d.total, ANCHO - M - 24, y + 56);

  let py = y + 34;
  x.textAlign = 'left'; x.fillStyle = TEXTO; x.font = `800 28px ${TITULOS}`; x.fillText('Formas de pago', M, py); py += 42;
  x.fillStyle = GRIS; x.font = `500 27px ${CUERPO}`;
  d.pago.forEach((l) => renglones(x, l, ANCHO - M * 2 - tw - 60).forEach((r) => { x.fillText(r, M, py); py += 36; }));
  y = Math.max(py, y + 84) + 50;

  // --- Condiciones
  x.fillStyle = TEXTO; x.font = `800 28px ${TITULOS}`; x.fillText('Condiciones', M, y); y += 42;
  x.fillStyle = GRIS; x.font = `500 27px ${CUERPO}`;
  d.condiciones.forEach((l) => renglones(x, l, ANCHO - M * 2).forEach((r) => { x.fillText(r, M, y); y += 36; }));
  y += 30;

  // --- Pie (al final de la hoja A4 si entra)
  const pieAlto = (d.pie ? 50 : 0) + 110;
  y = Math.max(y, ALTO_A4 - pieAlto);
  x.textAlign = 'center';
  if (d.pie) { x.fillStyle = AZUL; x.font = `700 30px ${CUERPO}`; x.fillText(d.pie, ANCHO / 2, y + 20); y += 50; }
  x.fillStyle = GRIS; x.font = `500 22px ${CUERPO}`; x.fillText('Presupuesto generado con DC', ANCHO / 2, y + 30); y += 70;
  x.fillStyle = CELESTE; x.fillRect(0, y, ANCHO, 26); y += 26;

  const final = document.createElement('canvas');
  final.width = ANCHO; final.height = y;
  final.getContext('2d').drawImage(c, 0, 0);
  return final;
}

// ---------------------------------------------------------------------
export async function vistaPresupuestoDoc(app, id) {
  await cargarNegocio().catch(() => {});
  const [pr, it] = await Promise.all([
    sb.from('presupuestos').select('*').eq('id', id).maybeSingle(),
    sb.from('presupuesto_items').select('*').eq('presupuesto_id', id).eq('eliminado', false).order('creado_en'),
  ]);
  if (pr.error) throw pr.error;
  const p = pr.data;
  if (!p) { app.innerHTML = '<p class="vacio">Presupuesto no encontrado.</p>'; return; }
  const items = it.data || [];
  const [cli, eq] = await Promise.all([
    sb.from('clientes').select('*').eq('id', p.cliente_id).maybeSingle(),
    p.equipo_id ? sb.from('equipos').select('*').eq('id', p.equipo_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const c = cli.data || {};
  const n = negocio();
  const total = totalDe(p, items);

  app.innerHTML = `
    <p class="miga"><a href="#/presupuesto/${esc(p.id)}">← Volver al presupuesto</a></p>
    <h1>Presupuesto para el cliente</h1>
    <form class="tarjeta" onsubmit="return false">
      <label class="fila" style="font-weight:500; cursor:pointer">
        <span>Mostrar el detalle (repuestos y mano de obra)</span>
        <input type="checkbox" id="con-detalle" style="width:22px;height:22px" checked>
      </label>
      <label class="fila" style="font-weight:500; cursor:pointer">
        <span>Mostrar DNI del cliente</span>
        <input type="checkbox" id="con-dni" style="width:22px;height:22px" ${c.dni ? '' : 'disabled'}>
      </label>
    </form>
    <div class="recibo-vista"><img id="img-pres" alt="Vista previa del presupuesto"></div>
    <div class="botones">
      <button class="btn whatsapp" id="btn-comp-img" type="button">${ic('chat', 18)} Compartir imagen</button>
      <button class="btn secundario" id="btn-comp-pdf" type="button">${ic('chat', 18)} Compartir PDF</button>
      <button class="btn secundario" id="btn-desc" type="button">${ic('descargar', 18)} Descargar</button>
    </div>
    <p class="sub" id="pres-ayuda">Al tocar <b>Compartir</b>, elegí <b>WhatsApp</b> y después el contacto del cliente.</p>`;

  const img = app.querySelector('#img-pres');
  const conDetalle = app.querySelector('#con-detalle');
  const conDni = app.querySelector('#con-dni');
  const ayuda = app.querySelector('#pres-ayuda');
  let canvas = null;

  const datos = () => {
    const filas = conDetalle.checked
      ? [
        ...items.map((i) => ({ desc: i.descripcion, cant: String(Number(i.cantidad)), precio: pesos(i.precio_unitario), importe: pesos(i.cantidad * i.precio_unitario) })),
        ...(Number(p.mano_obra) > 0 ? [{ desc: 'Mano de obra', cant: '1', precio: pesos(p.mano_obra), importe: pesos(p.mano_obra) }] : []),
      ]
      : [{ desc: p.trabajo_propuesto || 'Servicio técnico (repuestos y mano de obra incluidos)', cant: '1', precio: pesos(total), importe: pesos(total) }];
    const alias = datosTransferencia().replace(/\*/g, '').split('\n').filter(Boolean);
    return {
      negocio: n,
      numero: numeroTxt(p),
      fecha: fecha(p.fecha),
      vence: fecha(vence(p).toISOString()),
      cliente: nombreCompleto(c),
      dni: conDni.checked ? c.dni : null,
      telCliente: c.telefono ? `Tel. ${c.telefono}` : null,
      dirCliente: c.direccion || null,
      equipo: descEquipo(eq.data) || null,
      trabajo: conDetalle.checked ? p.trabajo_propuesto : null,
      filas: filas.length ? filas : [{ desc: 'Servicio técnico', cant: '1', precio: pesos(total), importe: pesos(total) }],
      total: pesos(total),
      pago: alias.length ? ['Efectivo o transferencia.', ...alias] : ['Efectivo o transferencia.'],
      condiciones: [
        `Presupuesto válido por ${Number(p.validez_dias) || 15} días, hasta el ${fecha(vence(p).toISOString())}. Los precios pueden variar después de esa fecha.`,
        `El trabajo realizado tiene ${n.garantiaDias || 90} días de garantía.`,
        p.notas,
      ].filter(Boolean),
      pie: n.pie_comprobante,
    };
  };

  const redibujar = async () => { canvas = await dibujarPresupuesto(datos()); img.src = canvas.toDataURL('image/png'); };
  conDetalle.addEventListener('change', redibujar);
  conDni.addEventListener('change', redibujar);
  await redibujar();

  const base = `presupuesto-${numeroTxt(p).replace(/\D/g, '') || 'borrador'}-${c.apellido || c.nombre || ''}`.replace(/\s+/g, '-').toLowerCase();
  const archivoImagen = async () => new File([await new Promise((ok) => canvas.toBlob(ok, 'image/png'))], `${base}.png`, { type: 'image/png' });
  const archivoPdf = async () => {
    const { jsPDF } = await import('https://esm.sh/jspdf@2.5.1');
    const ancho = 210, alto = (canvas.height / canvas.width) * ancho;
    const pdf = new jsPDF({ unit: 'mm', format: [ancho, alto], orientation: 'portrait' });
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, ancho, alto);
    return new File([pdf.output('blob')], `${base}.pdf`, { type: 'application/pdf' });
  };
  const bajar = (f) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(f); a.download = f.name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  const compartir = async (hacer, titulo) => {
    let f;
    try { f = await hacer(); } catch {
      ayuda.textContent = 'No se pudo armar el PDF (hace falta señal la primera vez). Probá con "Compartir imagen".'; return;
    }
    if (navigator.canShare?.({ files: [f] })) {
      try { await navigator.share({ files: [f], title: titulo }); } catch { return; }
      if (p.estado === 'borrador') sb.from('presupuestos').update({ estado: 'enviado' }).eq('id', id).then(() => {});
    } else {
      bajar(f);
      ayuda.innerHTML = 'Este navegador no permite compartir directo: el archivo se descargó. Adjuntalo en WhatsApp desde la galería o los archivos.';
    }
  };
  app.querySelector('#btn-comp-img').addEventListener('click', () => compartir(archivoImagen, 'Presupuesto'));
  app.querySelector('#btn-comp-pdf').addEventListener('click', () => compartir(archivoPdf, 'Presupuesto'));
  app.querySelector('#btn-desc').addEventListener('click', async () => {
    try { bajar(await archivoPdf()); } catch { bajar(await archivoImagen()); }
  });
}
