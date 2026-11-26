// Traer clientes desde el celular: agenda de contactos, portapapeles y "Compartir" desde WhatsApp

// Deja el teléfono en formato local: código de área + número (ej: 3704123456)
export function normalizarTelefono(texto) {
  let d = String(texto ?? '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('54')) d = d.slice(2);
  if (d.startsWith('9') && d.length === 11) d = d.slice(1);
  if (d.startsWith('0')) d = d.slice(1);
  return d;
}

// "Juan Carlos Pérez" -> { nombre: "Juan Carlos", apellido: "Pérez" }
export function separarNombre(completo) {
  const partes = String(completo ?? '').trim().split(/\s+/).filter(Boolean);
  if (partes.length <= 1) return { nombre: partes[0] || '', apellido: '' };
  return { nombre: partes.slice(0, -1).join(' '), apellido: partes[partes.length - 1] };
}

// --- Agenda del celular (Chrome en Android) ---
export const agendaDisponible = 'contacts' in navigator && 'ContactsManager' in window;

export async function elegirDeAgenda() {
  const [c] = await navigator.contacts.select(['name', 'tel'], { multiple: false });
  if (!c) return null;
  return { ...separarNombre(c.name?.[0]), telefono: normalizarTelefono(c.tel?.[0]) };
}

// --- Portapapeles ---
export async function leerPortapapeles() {
  const texto = await navigator.clipboard.readText();
  return datosDeTexto(texto);
}

// --- Texto o tarjeta de contacto (vCard) compartidos desde WhatsApp ---
export function datosDeVcard(vcf) {
  const linea = (re) => (vcf.match(re) || [])[1]?.trim() || '';
  const fn = linea(/^FN[^:]*:(.+)$/mi);
  const n = linea(/^N[^:]*:(.+)$/mi); // Apellido;Nombre;...
  let nombre = '', apellido = '';
  if (n && n.includes(';')) {
    const [ap, no] = n.split(';');
    nombre = (no || '').trim(); apellido = (ap || '').trim();
  }
  if (!nombre) ({ nombre, apellido } = separarNombre(fn));
  const tel = linea(/^TEL[^:]*:(.+)$/mi) || (vcf.match(/waid=(\d+)/i) || [])[1] || '';
  return { nombre, apellido, telefono: normalizarTelefono(tel) };
}

export function datosDeTexto(texto) {
  const t = String(texto ?? '');
  if (/BEGIN:VCARD/i.test(t)) return datosDeVcard(t);
  const numero = (t.match(/(\+?\d[\d\s\-().]{7,}\d)/) || [])[1] || '';
  const resto = t.replace(numero, '').replace(/[^\p{L}\s']/gu, ' ').trim();
  const nombreProbable = resto.split(/\s+/).length <= 4 ? resto : '';
  return { ...separarNombre(nombreProbable), telefono: normalizarTelefono(numero) };
}

// Lo que llegó por "Compartir" (lo guarda el service worker)
export async function leerCompartido() {
  try {
    const cache = await caches.open('dc-compartido');
    const resp = await cache.match('./compartido');
    if (!resp) return null;
    await cache.delete('./compartido');
    const d = await resp.json();
    if (d.vcard) return datosDeVcard(d.vcard);
    return datosDeTexto([d.title, d.text, d.url].filter(Boolean).join(' '));
  } catch { return null; }
}
