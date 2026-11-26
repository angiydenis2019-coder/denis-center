// Botones rápidos: "Voy en camino" (WhatsApp con tiempo estimado) y "Cómo llegar" (Google Maps)
import { ic } from './iconos.js';
import { negocio } from './negocio.js';
import { esc, linkWhatsApp } from './util.js';

const TIEMPOS = ['10 minutos', '20 minutos', '30 minutos', '45 minutos', '1 hora'];

// Coordenadas "-25.1234, -58.2345"
const COORDS = /(-?\d{1,2}\.\d{3,})\s*,\s*(-?\d{1,3}\.\d{3,})/;

// Busca una ubicación en un texto: link de Google Maps (o cualquier link) o coordenadas
export function extraerUbicacion(texto) {
  const t = String(texto ?? '').trim();
  if (!t) return null;
  const enlace = t.match(/https?:\/\/\S+/);
  if (enlace) return enlace[0].replace(/[).,;]+$/, '');
  const c = t.match(COORDS);
  if (c) return `https://www.google.com/maps?q=${c[1]},${c[2]}`;
  return null;
}

// Link para "Cómo llegar": primero la ubicación guardada; si no, la dirección escrita
export function linkMaps(direccion, ubicacion) {
  const u = String(ubicacion ?? '').trim();
  if (u) {
    const q = u.match(/[?&]q=(-?[\d.]+),(-?[\d.]+)/) || u.match(COORDS);
    if (q) return `https://www.google.com/maps/dir/?api=1&destination=${q[1]},${q[2]}`;
    if (/^https?:\/\//i.test(u)) return u;
  }
  const d = String(direccion ?? '').trim();
  if (!d) return null;
  const enlace = extraerUbicacion(d);
  if (enlace) return linkMaps('', enlace);
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(d)}`;
}

// Ubicación GPS actual del celular -> link de Google Maps
export function ubicacionActual() {
  return new Promise((ok, mal) => {
    if (!navigator.geolocation) { mal(new Error('Este celular no permite obtener la ubicación.')); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => ok(`https://www.google.com/maps?q=${p.coords.latitude.toFixed(6)},${p.coords.longitude.toFixed(6)}`),
      (e) => mal(new Error(e.code === 1 ? 'Permití el acceso a la ubicación para guardarla.' : 'No se pudo obtener la ubicación. Probá al aire libre o con el GPS activado.')),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
  });
}

// HTML de los botones; llamar después a activarRapidos(contenedor)
export function botonesRapidos({ nombre, telefono, direccion, ubicacion }) {
  const mapa = linkMaps(direccion, ubicacion);
  if (!telefono && !mapa) return '';
  const n = negocio();
  return `
    <div class="rapidos">
      <div class="botones" style="margin-bottom:0">
        ${telefono ? `<button class="btn secundario" type="button" data-voy aria-expanded="false">${ic('camino', 18)} Voy en camino</button>` : ''}
        ${mapa ? `<a class="btn secundario" href="${esc(mapa)}" target="_blank" rel="noopener">${ic('mapa', 18)} Cómo llegar</a>` : ''}
      </div>
      ${telefono ? `<div class="tiempos" data-tiempos hidden>
        <span class="sub">Llego en aprox.:</span>
        ${TIEMPOS.map((t) => `<a class="btn-mini" target="_blank" rel="noopener" href="${esc(linkWhatsApp(telefono,
          `Hola ${nombre || ''}, soy ${n.tecnico} de ${n.nombre}. Ya estoy en camino, llego en aproximadamente ${t}. ¡Hasta ahora!`.replace('Hola ,', 'Hola,')))}">${t}</a>`).join('')}
      </div>` : ''}
    </div>`;
}

export function activarRapidos(contenedor) {
  const boton = contenedor?.querySelector('[data-voy]');
  const tiempos = contenedor?.querySelector('[data-tiempos]');
  boton?.addEventListener('click', () => {
    tiempos.hidden = !tiempos.hidden;
    boton.setAttribute('aria-expanded', String(!tiempos.hidden));
  });
}
