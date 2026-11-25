// Utilidades generales de Denis Center

// Escapa texto para insertarlo en HTML sin riesgos
export function esc(valor) {
  return String(valor ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

const fmtPesos = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
export const pesos = (n) => fmtPesos.format(Number(n) || 0);

const fmtFecha = new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
const fmtFechaHora = new Intl.DateTimeFormat('es-AR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
export const fecha = (v) => (v ? fmtFecha.format(new Date(v.length === 10 ? v + 'T12:00:00' : v)) : '');
export const fechaHora = (v) => (v ? fmtFechaHora.format(new Date(v)) : '');

export const nombreCompleto = (c) => [c.nombre, c.apellido].filter(Boolean).join(' ');

// Convierte un teléfono argentino al formato que pide WhatsApp (549 + área + número)
// Acepta: "3704 123456", "03704 123456", "+54 9 3704 123456", "5493704123456"
// Importante: cargar el número SIN el 15 (código de área + número).
export function telefonoWhatsApp(tel) {
  let d = String(tel ?? '').replace(/\D/g, '');
  if (!d) return null;
  if (d.startsWith('549')) return d;
  if (d.startsWith('54')) return '549' + d.slice(2);
  d = d.replace(/^0+/, '');
  return '549' + d;
}

export function linkWhatsApp(tel, mensaje = '') {
  const num = telefonoWhatsApp(tel);
  if (!num) return null;
  return `https://wa.me/${num}` + (mensaje ? `?text=${encodeURIComponent(mensaje)}` : '');
}

// Lee un formulario como objeto, convirtiendo "" en null
export function datosFormulario(form) {
  const obj = {};
  for (const [k, v] of new FormData(form).entries()) {
    const t = String(v).trim();
    obj[k] = t === '' ? null : t;
  }
  return obj;
}

export function etiquetaCobro(estado) {
  const textos = { pagado: 'Pagado', parcial: 'Pago parcial', debe: 'Debe' };
  return estado ? `<span class="etiqueta ${estado}">${textos[estado]}</span>` : '';
}

export function etiquetaGarantia(t) {
  if (t.estado !== 'realizado') return '';
  return t.en_garantia
    ? `<span class="etiqueta garantia">Garantía hasta ${fecha(t.garantia_hasta)}</span>`
    : `<span class="etiqueta vencida">Garantía vencida</span>`;
}

// Fechas para <input type="datetime-local"> (hora local) <-> ISO para la base
export function aInputFecha(iso) {
  const d = iso ? new Date(iso) : new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
export const deInputFecha = (v) => (v ? new Date(v).toISOString() : null);

export const FORMAS_PAGO = { efectivo: 'Efectivo', transferencia: 'Transferencia', mercado_pago: 'Mercado Pago', otro: 'Otro' };
export const TIPOS_EQUIPO = ['Aire acondicionado', 'Heladera', 'Freezer', 'Lavarropas', 'Microondas', 'Instalación eléctrica', 'Termotanque', 'Ventilador', 'Otro'];

export const descEquipo = (e) => [e?.tipo ?? e?.equipo_tipo, e?.marca ?? e?.equipo_marca, e?.modelo ?? e?.equipo_modelo].filter(Boolean).join(' ');

// Traduce errores comunes de Supabase a mensajes entendibles
export function mensajeError(err) {
  const m = err?.message || String(err);
  if (/Invalid login credentials/i.test(m)) return 'Correo o contraseña incorrectos.';
  if (/clientes_dni_unico|duplicate key/i.test(m)) return 'Ya existe un cliente con ese DNI.';
  if (/Failed to fetch|NetworkError/i.test(m)) return 'No hay conexión con el servidor.';
  if (/row-level security/i.test(m)) return 'Tu usuario no tiene permiso (¿está activado?).';
  return m;
}
