// Boleta / comprobante de pago: imagen con el logo, el concepto y el TOTAL
// (mano de obra y repuestos incluidos, sin detalle). Se comparte por WhatsApp o se descarga.
import { sb } from '../supabase.js';
import { ic } from '../iconos.js';
import { negocio, cargarNegocio } from '../negocio.js';
import { esc, pesos, fecha, nombreCompleto, descEquipo, FORMAS_PAGO } from '../util.js';

const ANCHO = 1080;
const AZUL = '#0b3d7a', TEXTO = '#12233d', GRIS = '#5a6b82', VERDE = '#1e7a45', NARANJA = '#a8470b';
const TITULOS = "'Montserrat', 'Inter', system-ui, sans-serif";
const CUERPO = "'Inter', system-ui, sans-serif";

export const numeroRecibo = (t) => {
  const d = new Date(t.fecha_realizado);
  const p = (n) => String(n).padStart(2, '0');
  return `R-${String(d.getFullYear()).slice(2)}${p(d.getMonth() + 1)}${p(d.getDate())}-${t.id.slice(0, 4).toUpperCase()}`;
};

// Logo del técnico (el que subió en Ajustes). Sin logo, se escribe el nombre del negocio.
const logos = new Map();
export function cargarLogo(url) {
  if (!url) return Promise.resolve(null);
  if (logos.has(url)) return Promise.resolve(logos.get(url));
  return new Promise((ok) => {
    const img = new Image();
    img.crossOrigin = 'anonymous'; // para poder compartir la imagen generada
    img.onload = () => { logos.set(url, img); ok(img); };
    img.onerror = () => ok(null);
    img.src = url;
  });
}

// Corta un texto en renglones que entren en "ancho"
export function renglones(ctx, texto, ancho) {
  const palabras = String(texto || '').split(/\s+/).filter(Boolean);
  const lineas = [];
  let actual = '';
  for (const p of palabras) {
    const prueba = actual ? actual + ' ' + p : p;
    if (ctx.measureText(prueba).width > ancho && actual) { lineas.push(actual); actual = p; } else actual = prueba;
  }
  if (actual) lineas.push(actual);
  return lineas;
}

export async function dibujarRecibo(d) {
  await document.fonts?.ready;
  const img = await cargarLogo(d.negocio.logo_url);
  const c = document.createElement('canvas');
  c.width = ANCHO; c.height = 2400;
  const x = c.getContext('2d');
  const M = 80; // margen
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, c.width, c.height);
  x.fillStyle = AZUL; x.fillRect(0, 0, ANCHO, 14);
  let y = 60;

  // Logo
  if (img) {
    const esc = Math.min(440 / img.width, 300 / img.height);
    const w = Math.round(img.width * esc), h = Math.round(img.height * esc);
    x.drawImage(img, (ANCHO - w) / 2, y, w, h); y += h + 30;
  } else {
    x.fillStyle = AZUL; x.font = `italic 800 64px ${TITULOS}`; x.textAlign = 'center';
    x.fillText(d.negocio.nombre, ANCHO / 2, y + 60); y += 110;
  }

  // Título
  x.textAlign = 'center';
  x.fillStyle = AZUL; x.font = `800 50px ${TITULOS}`;
  x.fillText('COMPROBANTE DE PAGO', ANCHO / 2, y + 40); y += 76;
  x.fillStyle = GRIS; x.font = `500 30px ${CUERPO}`;
  x.fillText(`N° ${d.numero}   ·   Fecha: ${d.fecha}`, ANCHO / 2, y + 20); y += 60;

  // Línea
  const linea = () => { x.strokeStyle = '#dbe3ee'; x.lineWidth = 2; x.beginPath(); x.moveTo(M, y); x.lineTo(ANCHO - M, y); x.stroke(); };
  linea(); y += 50;

  // Datos del cliente
  x.textAlign = 'left';
  const dato = (etq, valor) => {
    if (!valor) return;
    x.fillStyle = GRIS; x.font = `600 28px ${CUERPO}`; x.fillText(etq, M, y);
    x.fillStyle = TEXTO; x.font = `500 34px ${CUERPO}`;
    const ls = renglones(x, valor, ANCHO - M * 2 - 220);
    ls.forEach((l, i) => x.fillText(l, M + 220, y + i * 44));
    y += 44 * ls.length + 18;
  };
  dato('Cliente', d.cliente);
  dato('DNI', d.dni);
  dato('Equipo', d.equipo);
  dato('Concepto', d.concepto);
  y += 10;

  // Total
  x.fillStyle = '#eef4fc';
  const altoTotal = 210;
  x.beginPath(); x.roundRect(M, y, ANCHO - M * 2, altoTotal, 24); x.fill();
  x.textAlign = 'center';
  x.fillStyle = GRIS; x.font = `600 28px ${CUERPO}`;
  x.fillText('TOTAL  ·  mano de obra y repuestos incluidos', ANCHO / 2, y + 58);
  x.fillStyle = AZUL; x.font = `800 92px ${TITULOS}`;
  x.fillText(d.total, ANCHO / 2, y + 162);
  x.textAlign = 'left';
  y += altoTotal + 50;

  // Pagado / saldo
  if (d.pagadoTodo) {
    x.save();
    x.translate(ANCHO / 2, y + 56); x.rotate(-0.06);
    x.strokeStyle = VERDE; x.lineWidth = 6; x.beginPath(); x.roundRect(-190, -52, 380, 104, 18); x.stroke();
    x.fillStyle = VERDE; x.font = `800 64px ${TITULOS}`; x.textAlign = 'center'; x.fillText('PAGADO', 0, 22);
    x.restore(); y += 170;
  } else {
    x.fillStyle = TEXTO; x.font = `600 32px ${CUERPO}`;
    x.fillText(`Pagado: ${d.pagado}`, M, y + 10);
    x.fillStyle = NARANJA; x.textAlign = 'right';
    x.fillText(`Saldo pendiente: ${d.saldo}`, ANCHO - M, y + 10);
    x.textAlign = 'left'; y += 64;
  }
  if (d.formas) { x.fillStyle = GRIS; x.font = `500 28px ${CUERPO}`; x.fillText(`Forma de pago: ${d.formas}`, M, y); y += 50; }
  if (d.garantia) {
    x.fillStyle = TEXTO; x.font = `600 30px ${CUERPO}`;
    x.fillText(`Garantía: ${d.garantia}`, M, y); y += 60;
  }

  // Pie
  y += 10; linea(); y += 56;
  x.textAlign = 'center';
  if (d.pie) { x.fillStyle = AZUL; x.font = `700 32px ${CUERPO}`; renglones(x, d.pie, ANCHO - M * 2).forEach((l) => { x.fillText(l, ANCHO / 2, y); y += 44; }); }
  x.fillStyle = GRIS; x.font = `500 27px ${CUERPO}`;
  renglones(x, d.contacto, ANCHO - M * 2).forEach((l) => { x.fillText(l, ANCHO / 2, y); y += 38; });
  y += 40;
  x.fillStyle = AZUL; x.fillRect(0, y - 14, ANCHO, 14);

  // Recortar al alto usado
  const final = document.createElement('canvas');
  final.width = ANCHO; final.height = y;
  final.getContext('2d').drawImage(c, 0, 0);
  return final;
}

// ---------------------------------------------------------------------
// PANTALLA #/recibo/<trabajoId>
// ---------------------------------------------------------------------
export async function vistaRecibo(app, id) {
  await cargarNegocio().catch(() => {});
  const [tr, pg] = await Promise.all([
    sb.from('trabajos_resumen').select('*').eq('id', id).maybeSingle(),
    sb.from('pagos').select('forma_pago, monto, fecha').eq('trabajo_id', id).eq('eliminado', false),
  ]);
  if (tr.error) throw tr.error;
  const t = tr.data;
  if (!t || t.estado !== 'realizado') { app.innerHTML = '<p class="vacio">El comprobante se genera para trabajos realizados.</p>'; return; }
  const { data: cli } = await sb.from('clientes').select('dni').eq('id', t.cliente_id).maybeSingle();
  const n = negocio();
  const formas = [...new Set((pg.data || []).map((p) => FORMAS_PAGO[p.forma_pago] || p.forma_pago))].join(' y ');
  const conceptoInicial = t.trabajo_realizado || (t.equipo_tipo ? `Servicio técnico de ${t.equipo_tipo.toLowerCase()}` : 'Servicio técnico');

  app.innerHTML = `
    <p class="miga"><a href="#/trabajo/${esc(t.id)}">← Volver al trabajo</a></p>
    <h1>Comprobante de pago</h1>
    <p class="sub">El cliente ve solo el concepto y el total. El detalle de repuestos y mano de obra queda guardado en la app.</p>
    <form id="f-recibo" class="tarjeta" onsubmit="return false">
      <label for="concepto">Concepto <span class="ayuda">— lo que va a leer el cliente</span></label>
      <input id="concepto" name="concepto" value="${esc(conceptoInicial)}">
      <label class="fila" style="font-weight:500; cursor:pointer">
        <span>Mostrar DNI del cliente</span>
        <input type="checkbox" id="con-dni" style="width:22px;height:22px" ${cli?.dni ? 'checked' : 'disabled'}>
      </label>
    </form>
    <div class="recibo-vista"><img id="img-recibo" alt="Vista previa del comprobante"></div>
    <div class="botones">
      <button class="btn whatsapp" id="btn-compartir" type="button">${ic('chat', 18)} Compartir</button>
      <button class="btn secundario" id="btn-descargar" type="button">${ic('descargar', 18)} Descargar</button>
    </div>
    <p class="sub" id="recibo-ayuda">Al tocar <b>Compartir</b>, elegí <b>WhatsApp</b> y después el contacto del cliente.</p>`;

  const img = app.querySelector('#img-recibo');
  const concepto = app.querySelector('#concepto');
  const conDni = app.querySelector('#con-dni');
  let canvas = null;

  const datos = () => ({
    negocio: n,
    numero: numeroRecibo(t),
    fecha: fecha(t.fecha_realizado),
    cliente: nombreCompleto({ nombre: t.cliente_nombre, apellido: t.cliente_apellido }),
    dni: conDni.checked ? cli?.dni : null,
    equipo: descEquipo(t) || null,
    concepto: concepto.value.trim() || 'Servicio técnico',
    total: pesos(t.total),
    pagado: pesos(t.pagado),
    saldo: pesos(t.saldo),
    pagadoTodo: Number(t.saldo) <= 0,
    formas,
    garantia: t.garantia_hasta ? `${n.garantiaDias || 90} días, hasta el ${fecha(t.garantia_hasta)}` : null,
    pie: n.pie_comprobante,
    contacto: [n.tecnico, n.telefono && `Tel. ${n.telefono}`, n.direccion].filter(Boolean).join('  ·  '),
  });

  let espera = null;
  const redibujar = async () => {
    canvas = await dibujarRecibo(datos());
    img.src = canvas.toDataURL('image/png');
  };
  concepto.addEventListener('input', () => { clearTimeout(espera); espera = setTimeout(redibujar, 300); });
  conDni.addEventListener('change', redibujar);
  await redibujar();

  const archivo = async () => {
    const blob = await new Promise((ok) => canvas.toBlob(ok, 'image/png'));
    const nombre = `comprobante-${t.cliente_nombre}-${numeroRecibo(t)}.png`.replace(/\s+/g, '-');
    return new File([blob], nombre, { type: 'image/png' });
  };
  const descargar = async () => {
    const f = await archivo();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(f); a.download = f.name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  app.querySelector('#btn-descargar').addEventListener('click', descargar);
  app.querySelector('#btn-compartir').addEventListener('click', async () => {
    const f = await archivo();
    if (navigator.canShare?.({ files: [f] })) {
      try { await navigator.share({ files: [f], title: 'Comprobante de pago' }); } catch { /* canceló */ }
    } else {
      await descargar();
      app.querySelector('#recibo-ayuda').innerHTML = 'Este navegador no permite compartir directo: la imagen se descargó. Adjuntala en WhatsApp desde la galería o los archivos.';
    }
  });
}
