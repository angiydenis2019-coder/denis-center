import { sb } from '../supabase.js';
import { esc, pesos, mensajeError } from '../util.js';
import { normalizar } from '../buscar.js';

// Cache de la lista de precios (se usa al cargar repuestos y servicios)
let cache = null;
export async function cargarPrecios(forzar = false) {
  if (cache && !forzar) return cache;
  const { data, error } = await sb.from('precios').select('id, tipo, descripcion, precio')
    .eq('eliminado', false).order('descripcion');
  cache = error ? [] : data;
  return cache;
}
export const invalidarPrecios = () => { cache = null; };

// <datalist> con los repuestos de la lista (para autocompletar)
export function datalistRepuestos(id, precios) {
  return `<datalist id="${id}">${precios.filter((p) => p.tipo === 'repuesto')
    .map((p) => `<option value="${esc(p.descripcion)}">${pesos(p.precio)}</option>`).join('')}</datalist>`;
}
// Busca el precio de un repuesto por su descripción exacta
export const precioDe = (precios, descripcion) =>
  precios.find((p) => p.tipo === 'repuesto' && normalizar(p.descripcion) === normalizar(descripcion))?.precio;

// ---------------------------------------------------------------------
// PANTALLA: Lista de precios
// ---------------------------------------------------------------------
export async function vistaPrecios(app) {
  const precios = await cargarPrecios(true);
  const { error: errTabla } = await sb.from('precios').select('id', { head: true, count: 'exact' });

  app.innerHTML = `
    <p class="miga"><a href="#/ajustes">← Ajustes</a></p>
    <h1>Lista de precios</h1>
    ${errTabla ? '<div class="tarjeta banner aviso-sql">⚠️ Falta ejecutar <b>sql/03_herramientas.sql</b> en Supabase.</div>' : ''}
    <p class="sub">Guardá tus repuestos y trabajos más comunes. Al cargar un trabajo, los elegís de la lista y el precio se completa solo.</p>

    <form id="f-precio" class="tarjeta mini-precio">
      <select name="tipo" aria-label="Tipo">
        <option value="repuesto">Repuesto</option>
        <option value="servicio">Servicio / mano de obra</option>
      </select>
      <input name="descripcion" placeholder="Ej: Capacitor 35uF / Carga de gas R410" required>
      <input name="precio" type="number" min="0" step="any" placeholder="Precio $" required>
      <button class="btn" type="submit">Agregar</button>
      <p class="msg sub" hidden></p>
    </form>

    <input class="buscador" id="buscar-precio" type="search" placeholder="🔍 Buscar en la lista" autocomplete="off">
    <h2>Servicios</h2><div id="l-servicio"></div>
    <h2>Repuestos</h2><div id="l-repuesto"></div>
  `;

  const pintar = () => {
    const q = normalizar(app.querySelector('#buscar-precio').value).trim();
    for (const tipo of ['servicio', 'repuesto']) {
      const lista = precios.filter((p) => p.tipo === tipo && (!q || normalizar(p.descripcion).includes(q)));
      app.querySelector('#l-' + tipo).innerHTML = lista.length ? `<div class="tarjeta">${lista.map((p) => `
        <div class="fila linea precio-fila" data-id="${esc(p.id)}">
          <span class="precio-desc">${esc(p.descripcion)}</span>
          <span class="fila">
            <input class="precio-valor" type="number" min="0" step="any" value="${Number(p.precio)}" aria-label="Precio">
            <button class="btn-quitar" data-quitar title="Quitar">✕</button>
          </span>
        </div>`).join('')}</div>` : '<p class="vacio">Nada cargado.</p>';
    }
    app.querySelectorAll('.precio-fila').forEach((fila) => {
      const id = fila.dataset.id;
      fila.querySelector('.precio-valor').addEventListener('change', async (e) => {
        const precio = Number(e.target.value) || 0;
        const { error } = await sb.from('precios').update({ precio }).eq('id', id);
        if (error) return alert(mensajeError(error));
        precios.find((p) => p.id === id).precio = precio;
        invalidarPrecios();
        e.target.classList.add('guardado'); setTimeout(() => e.target.classList.remove('guardado'), 900);
      });
      fila.querySelector('[data-quitar]').addEventListener('click', async () => {
        if (!confirm('¿Quitar de la lista?')) return;
        const { error } = await sb.from('precios').update({ eliminado: true }).eq('id', id);
        if (error) return alert(mensajeError(error));
        precios.splice(precios.findIndex((p) => p.id === id), 1);
        invalidarPrecios(); pintar();
      });
    });
  };
  app.querySelector('#buscar-precio').addEventListener('input', pintar);

  const form = app.querySelector('#f-precio');
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const nuevo = { id: crypto.randomUUID(), tipo: form.tipo.value, descripcion: form.descripcion.value.trim(), precio: Number(form.precio.value) || 0 };
    const msg = form.querySelector('.msg');
    const { error } = await sb.from('precios').insert(nuevo);
    msg.hidden = false;
    if (error) { msg.textContent = mensajeError(error); msg.classList.add('error'); return; }
    msg.classList.remove('error'); msg.textContent = '✔ Agregado';
    precios.push(nuevo); precios.sort((a, b) => a.descripcion.localeCompare(b.descripcion));
    invalidarPrecios();
    form.descripcion.value = ''; form.precio.value = ''; form.descripcion.focus();
    pintar();
  });

  pintar();
}
