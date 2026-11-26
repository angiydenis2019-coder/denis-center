// Clima actual en Inicio, según dónde está el técnico.
// 1) Ubicación del celular (GPS)  2) si no la da, la localidad de su negocio.
// Datos: Open-Meteo (clima) y BigDataCloud (nombre del lugar). Gratis y sin clave.
// La ubicación no se guarda en la base: solo se usa para pedir el clima.
import { negocio } from './negocio.js';
import { esc } from './util.js';

const CACHE = 'dc_clima';
const VIGENCIA = 20 * 60 * 1000; // 20 minutos

const CODIGOS = [
  [[0], '☀️', 'Despejado', '🌙'], [[1], '🌤️', 'Mayormente despejado', '🌙'], [[2], '⛅', 'Parcialmente nublado', '☁️'],
  [[3], '☁️', 'Nublado'], [[45, 48], '🌫️', 'Niebla'], [[51, 53, 55, 56, 57], '🌦️', 'Llovizna'],
  [[61, 63, 66, 80, 81], '🌧️', 'Lluvia'], [[65, 67, 82], '🌧️', 'Lluvia fuerte'], [[71, 73, 75, 77, 85, 86], '🌨️', 'Nieve'],
  [[95], '⛈️', 'Tormenta'], [[96, 99], '⛈️', 'Tormenta con granizo'],
];
function describir(codigo, esDia) {
  const c = CODIGOS.find(([lista]) => lista.includes(codigo)) || [[], '🌡️', ''];
  return { icono: !esDia && c[3] ? c[3] : c[1], texto: c[2] };
}

function conLimite(promesa, ms) {
  return Promise.race([promesa, new Promise((_, mal) => setTimeout(() => mal(new Error('tiempo')), ms))]);
}

function ubicacionGps() {
  if (!('geolocation' in navigator)) return Promise.reject(new Error('sin gps'));
  return new Promise((ok, mal) => navigator.geolocation.getCurrentPosition(
    (p) => ok({ lat: p.coords.latitude, lon: p.coords.longitude }),
    mal, { enableHighAccuracy: false, timeout: 8000, maximumAge: 30 * 60 * 1000 }));
}

async function nombreDelLugar(lat, lon) {
  try {
    const r = await conLimite(fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=es`), 6000);
    const d = await r.json();
    return d.city || d.locality || d.principalSubdivision || null;
  } catch { return null; }
}

async function ubicacionDelNegocio() {
  const n = negocio();
  const lugar = (n.localidad || n.direccion || '').split(',')[0].trim();
  if (!lugar) throw new Error('sin localidad');
  const r = await conLimite(fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(lugar)}&count=1&language=es&countryCode=AR`), 6000);
  const d = await r.json();
  const x = d.results?.[0];
  if (!x) throw new Error('localidad no encontrada');
  return { lat: x.latitude, lon: x.longitude, lugar: x.name };
}

async function pedirClima({ lat, lon }) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}`
    + '&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,is_day,wind_speed_10m'
    + '&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=1';
  const r = await conLimite(fetch(url), 8000);
  if (!r.ok) throw new Error('clima ' + r.status);
  const d = await r.json();
  return {
    temp: d.current.temperature_2m, sensacion: d.current.apparent_temperature, humedad: d.current.relative_humidity_2m,
    viento: d.current.wind_speed_10m, codigo: d.current.weather_code, esDia: !!d.current.is_day,
    max: d.daily?.temperature_2m_max?.[0], min: d.daily?.temperature_2m_min?.[0],
  };
}

async function obtener() {
  let pos, lugar, porGps = true;
  try {
    pos = await ubicacionGps();
    lugar = await nombreDelLugar(pos.lat, pos.lon);
  } catch {
    porGps = false;
    const u = await ubicacionDelNegocio();
    pos = u; lugar = u.lugar;
  }
  const clima = await pedirClima(pos);
  const dato = { ...clima, lugar: lugar || 'Tu ubicación', porGps, cuando: Date.now() };
  try { localStorage.setItem(CACHE, JSON.stringify(dato)); } catch { /* sin espacio */ }
  return dato;
}

const r0 = (n) => Math.round(Number(n));

function pintar(caja, d, { viejo = false } = {}) {
  const { icono, texto } = describir(d.codigo, d.esDia);
  caja.innerHTML = `
    <button type="button" class="clima" title="Tocá para actualizar">
      <span class="clima-icono" aria-hidden="true">${icono}</span>
      <span class="clima-temp">${r0(d.temp)}°</span>
      <span class="clima-datos">
        <b>${esc(d.lugar)}</b>${d.porGps ? '' : ' <span class="sub">(localidad del negocio)</span>'}
        <span>${esc(texto)} · Sensación ${r0(d.sensacion)}° · Humedad ${r0(d.humedad)}%</span>
        ${d.max != null ? `<span>Máx ${r0(d.max)}° · Mín ${r0(d.min)}°${viejo ? ' · <i>sin actualizar</i>' : ''}</span>` : ''}
      </span>
    </button>`;
  caja.querySelector('.clima').addEventListener('click', () => montarClima(caja, { forzar: true }));
}

export async function montarClima(caja, { forzar = false } = {}) {
  if (!caja) return;
  let guardado = null;
  try { guardado = JSON.parse(localStorage.getItem(CACHE) || 'null'); } catch { /* nada */ }
  if (guardado) pintar(caja, guardado, { viejo: !navigator.onLine });
  else caja.innerHTML = '<div class="clima clima-cargando">🌡️ Buscando el clima…</div>';
  if (!forzar && guardado && Date.now() - guardado.cuando < VIGENCIA) return;
  if (!navigator.onLine) { if (!guardado) caja.innerHTML = ''; return; }
  if (forzar) caja.querySelector('.clima')?.classList.add('clima-cargando');
  try {
    pintar(caja, await obtener());
  } catch {
    if (guardado) pintar(caja, guardado, { viejo: true });
    else caja.innerHTML = `<p class="sub clima-nota">Para ver el clima, permití la ubicación o cargá la localidad de tu negocio en Ajustes.</p>`;
  }
}
