// Fotos: comprimir en el celular, subir a Supabase Storage y mostrar en galería
import { sb } from './supabase.js';
import { esc, mensajeError } from './util.js';

const BUCKET = 'fotos';
const LADO_MAX = 1600;   // px del lado más largo
const CALIDAD = 0.75;    // calidad JPEG (0 a 1)

export const ETIQUETAS_FOTO = {
  equipo: 'Equipo',
  placa_modelo: 'Placa / modelo',
  pieza_cambiada: 'Pieza cambiada',
  antes: 'Antes',
  despues: 'Después',
  otra: 'Otra',
};

// Reduce la foto a ~1600 px y la pasa a JPEG (una foto de 4 MB queda en ~200-400 KB)
export async function comprimir(archivo) {
  const bmp = await createImageBitmap(archivo); // respeta la orientación de la cámara
  const escala = Math.min(1, LADO_MAX / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * escala);
  canvas.height = Math.round(bmp.height * escala);
  canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close?.();
  return new Promise((ok, mal) =>
    canvas.toBlob((b) => (b ? ok(b) : mal(new Error('No se pudo procesar la imagen'))), 'image/jpeg', CALIDAD));
}

async function subir({ trabajoId, equipoId, etiqueta, archivo }) {
  const blob = await comprimir(archivo);
  const id = crypto.randomUUID();
  const ruta = `${equipoId || 'sin-equipo'}/${trabajoId || 'equipo'}/${id}.jpg`;
  const { error: e1 } = await sb.storage.from(BUCKET).upload(ruta, blob, { contentType: 'image/jpeg', upsert: false });
  if (e1) throw e1;
  const { error: e2 } = await sb.from('fotos').insert({
    id, trabajo_id: trabajoId || null, equipo_id: equipoId || null, ruta, etiqueta,
  });
  if (e2) throw e2;
}

async function listar({ trabajoId, equipoId }) {
  let q = sb.from('fotos').select('id, ruta, etiqueta, trabajo_id, creado_en').eq('eliminado', false)
    .order('creado_en', { ascending: true });
  q = trabajoId ? q.eq('trabajo_id', trabajoId) : q.eq('equipo_id', equipoId);
  const { data, error } = await q;
  if (error) throw error;
  if (!data.length) return [];
  const { data: urls, error: e2 } = await sb.storage.from(BUCKET).createSignedUrls(data.map((f) => f.ruta), 3600);
  if (e2) throw e2;
  return data.map((f, i) => ({ ...f, url: urls[i]?.signedUrl }));
}

// ---------------------------------------------------------------------
// Sección de fotos reutilizable: <div id="fotos"></div> + montarFotos(...)
//   En un trabajo: { trabajoId, equipoId }  -> fotos de ese trabajo
//   En un equipo:  { equipoId }              -> todas las fotos del equipo
// ---------------------------------------------------------------------
export async function montarFotos(contenedor, { trabajoId = null, equipoId = null }) {
  contenedor.innerHTML = `
    <div class="fotos-acciones">
      <select class="foto-etiqueta" aria-label="Tipo de foto">
        ${Object.entries(ETIQUETAS_FOTO).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}
      </select>
      <label class="btn">📷 Cámara<input type="file" accept="image/*" capture="environment" hidden></label>
      <label class="btn secundario">🖼️ Galería<input type="file" accept="image/*" multiple hidden></label>
    </div>
    <p class="foto-estado sub" hidden></p>
    <div class="galeria"><p class="vacio">Cargando fotos…</p></div>`;

  const galeria = contenedor.querySelector('.galeria');
  const estado = contenedor.querySelector('.foto-estado');
  const selEtiqueta = contenedor.querySelector('.foto-etiqueta');
  let fotos = [];

  const pintar = async () => {
    try {
      fotos = await listar({ trabajoId, equipoId });
    } catch (err) {
      galeria.innerHTML = `<p class="error">${esc(mensajeError(err))}</p>`;
      return;
    }
    galeria.innerHTML = fotos.length
      ? fotos.map((f, i) => `
          <button class="miniatura" data-i="${i}" type="button">
            <img src="${esc(f.url)}" alt="${esc(ETIQUETAS_FOTO[f.etiqueta] || '')}" loading="lazy">
            <span>${esc(ETIQUETAS_FOTO[f.etiqueta] || f.etiqueta)}</span>
          </button>`).join('')
      : '<p class="vacio">Sin fotos todavía.</p>';
    galeria.querySelectorAll('.miniatura').forEach((b) =>
      b.addEventListener('click', () => abrirVisor(fotos, Number(b.dataset.i), pintar)));
  };

  contenedor.querySelectorAll('input[type=file]').forEach((input) => input.addEventListener('change', async () => {
    const archivos = [...input.files];
    input.value = '';
    if (!archivos.length) return;
    estado.hidden = false;
    estado.classList.remove('error');
    let fallidas = 0;
    for (let i = 0; i < archivos.length; i++) {
      estado.textContent = `Subiendo foto ${i + 1} de ${archivos.length}…`;
      try {
        await subir({ trabajoId, equipoId, etiqueta: selEtiqueta.value, archivo: archivos[i] });
      } catch (err) {
        console.error(err);
        fallidas++;
        estado.classList.add('error');
        estado.textContent = 'Error al subir: ' + mensajeError(err);
      }
    }
    if (!fallidas) estado.hidden = true;
    await pintar();
  }));

  await pintar();
}

// Visor a pantalla completa con flechas, cerrar y quitar
function abrirVisor(fotos, inicio, alCambiar) {
  let i = inicio;
  const capa = document.createElement('div');
  capa.className = 'visor';
  document.body.appendChild(capa);
  document.body.style.overflow = 'hidden';

  const cerrar = () => { capa.remove(); document.body.style.overflow = ''; document.removeEventListener('keydown', teclas); };
  const teclas = (e) => {
    if (e.key === 'Escape') cerrar();
    if (e.key === 'ArrowRight') mover(1);
    if (e.key === 'ArrowLeft') mover(-1);
  };
  const mover = (d) => { i = (i + d + fotos.length) % fotos.length; pintar(); };

  function pintar() {
    const f = fotos[i];
    capa.innerHTML = `
      <div class="visor-barra">
        <span>${esc(ETIQUETAS_FOTO[f.etiqueta] || f.etiqueta)} · ${i + 1}/${fotos.length}</span>
        <span>
          <button type="button" data-accion="quitar">🗑️ Quitar</button>
          <button type="button" data-accion="cerrar">✕</button>
        </span>
      </div>
      <img src="${esc(f.url)}" alt="">
      ${fotos.length > 1 ? '<button type="button" class="visor-flecha izq" data-accion="ant">‹</button><button type="button" class="visor-flecha der" data-accion="sig">›</button>' : ''}`;
  }

  capa.addEventListener('click', async (e) => {
    const accion = e.target.closest('[data-accion]')?.dataset.accion;
    if (accion === 'cerrar' || e.target === capa) cerrar();
    if (accion === 'ant') mover(-1);
    if (accion === 'sig') mover(1);
    if (accion === 'quitar' && confirm('¿Quitar esta foto?')) {
      const { error } = await sb.from('fotos').update({ eliminado: true }).eq('id', fotos[i].id);
      if (error) { alert(mensajeError(error)); return; }
      cerrar();
      alCambiar();
    }
  });
  document.addEventListener('keydown', teclas);

  // Deslizar con el dedo para pasar de foto
  let x0 = null;
  capa.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; }, { passive: true });
  capa.addEventListener('touchend', (e) => {
    if (x0 === null || fotos.length < 2) return;
    const dx = e.changedTouches[0].clientX - x0;
    if (Math.abs(dx) > 50) mover(dx < 0 ? 1 : -1);
    x0 = null;
  });

  pintar();
}
