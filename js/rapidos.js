// Botones rápidos: "Voy en camino" (WhatsApp con tiempo estimado) y "Cómo llegar" (Google Maps)
import { ic } from './iconos.js';
import { negocio } from './negocio.js';
import { esc, linkWhatsApp } from './util.js';

const TIEMPOS = ['10 minutos', '20 minutos', '30 minutos', '45 minutos', '1 hora'];

// La dirección puede ser texto ("San Martín 450, Laguna Blanca") o un link de ubicación pegado de WhatsApp/Maps
export function linkMaps(direccion) {
  const d = String(direccion ?? '').trim();
  if (!d) return null;
  if (/^https?:\/\//i.test(d)) return d;
  const enlace = d.match(/https?:\/\/\S+/);
  if (enlace) return enlace[0];
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(d)}`;
}

// HTML de los botones; llamar después a activarRapidos(contenedor)
export function botonesRapidos({ nombre, telefono, direccion }) {
  const mapa = linkMaps(direccion);
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
