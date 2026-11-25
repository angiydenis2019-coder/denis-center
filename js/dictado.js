// Dictado por voz: agrega un botón de micrófono a los campos de texto de la app.
// Usa el reconocimiento de voz del navegador (Chrome en Android lo trae; necesita señal).
import { ic } from './iconos.js';

const Reconocedor = window.SpeechRecognition || window.webkitSpeechRecognition;
export const dictadoDisponible = !!Reconocedor;

// Campos donde NO tiene sentido (o no entra) el micrófono
const EXCLUIR = '.r-cant, .r-precio, .precio-valor, [data-sin-dictado]';
const TIPOS = new Set(['text', 'search', 'tel', 'number', '']);

export function dictadoActivo() {
  try { return localStorage.getItem('dc_dictado') !== 'no'; } catch { return true; }
}
export function activarDictado(si) {
  try { localStorage.setItem('dc_dictado', si ? 'si' : 'no'); } catch { /* */ }
  document.documentElement.classList.toggle('sin-dictado', !si);
}

let activo = null; // { rec, campo, boton }

export function iniciarDictado(raiz) {
  if (!dictadoDisponible) return;
  document.documentElement.classList.toggle('sin-dictado', !dictadoActivo());
  const procesar = () => raiz.querySelectorAll('input, textarea').forEach(agregarBoton);
  new MutationObserver(procesar).observe(raiz, { childList: true, subtree: true });
  procesar();
}

function agregarBoton(campo) {
  if (campo.dataset.dictado || campo.matches(EXCLUIR)) return;
  if (campo.tagName === 'INPUT' && !TIPOS.has((campo.getAttribute('type') || '').toLowerCase())) return;
  campo.dataset.dictado = '1';

  const envoltura = document.createElement('span');
  envoltura.className = 'con-dictado' + (campo.tagName === 'TEXTAREA' ? ' es-area' : '');
  const estilo = getComputedStyle(campo);
  envoltura.style.marginTop = estilo.marginTop;
  envoltura.style.marginBottom = estilo.marginBottom;
  campo.style.marginTop = '0';
  campo.style.marginBottom = '0';
  campo.parentNode.insertBefore(envoltura, campo);
  envoltura.appendChild(campo);

  const boton = document.createElement('button');
  boton.type = 'button';
  boton.className = 'btn-microfono';
  boton.setAttribute('aria-label', 'Dictar con la voz');
  boton.title = 'Dictar con la voz';
  boton.innerHTML = ic('microfono', 18);
  boton.addEventListener('click', () => alternar(campo, boton));
  envoltura.appendChild(boton);
}

function alternar(campo, boton) {
  if (activo) {
    const eraEste = activo.campo === campo;
    activo.rec.stop();
    if (eraEste) return;
  }
  if (!navigator.onLine) {
    avisar('El dictado necesita señal. Sin señal podés usar el micrófono del teclado del celular.');
    return;
  }
  const rec = new Reconocedor();
  rec.lang = 'es-AR';
  rec.interimResults = true;
  rec.continuous = campo.tagName === 'TEXTAREA';
  rec.maxAlternatives = 1;

  const inicial = campo.value;
  const esNumero = campo.type === 'number' || campo.type === 'tel';
  let final = '';

  rec.onresult = (e) => {
    let parcial = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      if (e.results[i].isFinal) final += e.results[i][0].transcript; else parcial += e.results[i][0].transcript;
    }
    const dicho = (final + parcial).trim();
    campo.value = esNumero ? aNumero(dicho, campo.type) : unir(inicial, formatear(dicho, campo));
    campo.dispatchEvent(new Event('input', { bubbles: true }));
  };
  rec.onerror = (e) => {
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') avisar('Para dictar, permití el uso del micrófono cuando el celular lo pregunte.');
    else if (e.error === 'network') avisar('El dictado necesita señal. Sin señal podés usar el micrófono del teclado del celular.');
    else if (e.error === 'no-speech') avisar('No te escuché. Tocá el micrófono y hablá cerca del celular.');
  };
  rec.onend = () => {
    boton.classList.remove('escuchando');
    if (activo?.rec === rec) activo = null;
    campo.dispatchEvent(new Event('change', { bubbles: true }));
  };

  activo = { rec, campo, boton };
  boton.classList.add('escuchando');
  campo.focus({ preventScroll: true });
  try { rec.start(); } catch { boton.classList.remove('escuchando'); activo = null; }
}

// Agrega lo dictado a lo que ya había escrito
function unir(previo, nuevo) {
  if (!previo.trim()) return nuevo;
  return previo.replace(/\s*$/, '') + ' ' + nuevo;
}

// Mayúsculas: nombres y apellidos en cada palabra; el resto, solo la primera letra
function formatear(texto, campo) {
  if (!texto) return texto;
  if (campo.getAttribute('autocapitalize') === 'words') {
    return texto.replace(/(^|\s)(\p{L})/gu, (m, esp, letra) => esp + letra.toUpperCase());
  }
  return campo.value.trim() && campo.tagName !== 'TEXTAREA' ? texto : texto.charAt(0).toUpperCase() + texto.slice(1);
}

// "18 mil" -> 18000, "25.000" -> 25000, "tres siete cero cuatro" -> 3704 (teléfonos)
const PALABRAS = { cero: 0, uno: 1, un: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10 };
function aNumero(texto, tipo) {
  let t = texto.toLowerCase().replace(/\$/g, '').replace(/pesos?/g, '');
  t = t.replace(/\b(cero|uno|un|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)\b/g, (w) => PALABRAS[w]);
  if (tipo === 'tel') return t.replace(/\D/g, '');
  t = t.replace(/(\d)\.(\d{3})/g, '$1$2').replace(/,/g, '.');
  const m = t.match(/(\d+(?:\.\d+)?)\s*(mil|millones|millón)?/);
  if (!m) return '';
  let n = parseFloat(m[1]);
  if (m[2] === 'mil') n *= 1000;
  if (m[2] && m[2].startsWith('mill')) n *= 1000000;
  return String(n);
}

let temporizador = null;
function avisar(texto) {
  let caja = document.getElementById('aviso-dictado');
  if (!caja) {
    caja = document.createElement('div');
    caja.id = 'aviso-dictado';
    caja.className = 'toast';
    caja.setAttribute('role', 'status');
    document.body.appendChild(caja);
  }
  caja.textContent = texto;
  caja.hidden = false;
  clearTimeout(temporizador);
  temporizador = setTimeout(() => { caja.hidden = true; }, 4500);
}
