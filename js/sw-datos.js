// =====================================================================
//  Denis Center — Modo sin señal (se carga dentro del service worker)
//  * Copia local ("espejo") de las tablas en IndexedDB
//  * Lecturas sin señal: se responden desde el espejo (mini PostgREST)
//  * Escrituras sin señal: se guardan en una cola y se aplican al espejo
//  * Al volver la señal: se envía la cola en orden y se actualiza el espejo
// =====================================================================
/* eslint-env serviceworker */

const DB_NOMBRE = 'denis-center-offline';
const TABLAS = ['clientes', 'equipos', 'trabajos', 'repuestos', 'pagos', 'fotos', 'precios', 'negocio', 'negocios', 'perfiles', 'presupuestos', 'presupuesto_items'];
const ZONA = 'America/Argentina/Buenos_Aires';
const GARANTIA_DIAS = 90;

// ---------------------------------------------------------------------
// IndexedDB mínimo
// ---------------------------------------------------------------------
let _db = null;
function abrirDB() {
  if (_db) return Promise.resolve(_db);
  return new Promise((ok, mal) => {
    const req = indexedDB.open(DB_NOMBRE, 3);
    req.onupgradeneeded = () => {
      const db = req.result;
      const crear = (nombre, opciones) => { if (!db.objectStoreNames.contains(nombre)) db.createObjectStore(nombre, opciones); };
      TABLAS.forEach((t) => crear(t, { keyPath: 'id' }));
      crear('cola', { keyPath: 'n', autoIncrement: true });
      crear('meta', { keyPath: 'k' });
    };
    req.onsuccess = () => { _db = req.result; ok(_db); };
    req.onerror = () => mal(req.error);
  });
}
async function tx(store, modo, fn) {
  const db = await abrirDB();
  return new Promise((ok, mal) => {
    const t = db.transaction(store, modo);
    const s = t.objectStore(store);
    let res;
    Promise.resolve(fn(s)).then((r) => { res = r; });
    t.oncomplete = () => ok(res);
    t.onerror = () => mal(t.error);
    t.onabort = () => mal(t.error);
  });
}
const req2p = (r) => new Promise((ok, mal) => { r.onsuccess = () => ok(r.result); r.onerror = () => mal(r.error); });
const todos = (store) => tx(store, 'readonly', (s) => req2p(s.getAll()));
const contar = (store) => tx(store, 'readonly', (s) => req2p(s.count()));
const leerMeta = (k) => tx('meta', 'readonly', (s) => req2p(s.get(k))).then((r) => r?.v);
const guardarMeta = (k, v) => tx('meta', 'readwrite', (s) => s.put({ k, v }));
function guardarFilas(tabla, filas) {
  return tx(tabla, 'readwrite', async (s) => {
    for (const f of filas) {
      const limpia = {};
      for (const [k, v] of Object.entries(f)) if (v === null || typeof v !== 'object') limpia[k] = v; // sin embebidos
      const previa = await req2p(s.get(limpia.id));
      s.put({ ...(previa || {}), ...limpia });
    }
  });
}

// ---------------------------------------------------------------------
// Utilidades de comparación (como PostgREST)
// ---------------------------------------------------------------------
const esFecha = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v);
function comparar(a, b) {
  if (a === null || a === undefined) return b === null || b === undefined ? 0 : -1;
  if (b === null || b === undefined) return 1;
  if (typeof a === 'number' || typeof b === 'number') return Number(a) - Number(b);
  if (esFecha(a) && esFecha(b)) return new Date(a) - new Date(b);
  return String(a).localeCompare(String(b), 'es', { sensitivity: 'base' });
}
function cumple(valor, expr) {
  let negar = false;
  if (expr.startsWith('not.')) { negar = true; expr = expr.slice(4); }
  const i = expr.indexOf('.');
  const op = expr.slice(0, i), arg = expr.slice(i + 1);
  let r;
  switch (op) {
    case 'eq':
      r = arg === 'true' || arg === 'false' ? valor === (arg === 'true') : String(valor) === arg; break;
    case 'neq': r = String(valor) !== arg; break;
    case 'gt': r = valor != null && comparar(valor, arg) > 0; break;
    case 'gte': r = valor != null && comparar(valor, arg) >= 0; break;
    case 'lt': r = valor != null && comparar(valor, arg) < 0; break;
    case 'lte': r = valor != null && comparar(valor, arg) <= 0; break;
    case 'is': r = arg === 'null' ? valor == null : arg === 'true' ? valor === true : valor === false; break;
    case 'in': r = arg.replace(/^\(|\)$/g, '').split(',').map((x) => x.replace(/^"|"$/g, '')).includes(String(valor)); break;
    default: r = true;
  }
  return negar ? !r : r;
}
const RESERVADOS = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns']);
function filtrarFilas(filas, params) {
  for (const [col, expr] of params) {
    if (RESERVADOS.has(col)) continue;
    filas = filas.filter((f) => cumple(f[col], expr));
  }
  return filas;
}
function ordenar(filas, orden) {
  if (!orden) return filas;
  const claves = orden.split(',').map((p) => {
    const [col, ...mods] = p.split('.');
    return { col, desc: mods.includes('desc'), nullsFirst: mods.includes('nullsfirst') ? true : mods.includes('nullslast') ? false : null };
  });
  return [...filas].sort((x, y) => {
    for (const { col, desc, nullsFirst } of claves) {
      const a = x[col], b = y[col];
      const an = a == null, bn = b == null;
      if (an || bn) {
        if (an && bn) continue;
        const nf = nullsFirst ?? desc; // PostgREST: nulls last en asc, first en desc
        return an ? (nf ? -1 : 1) : (nf ? 1 : -1);
      }
      const c = comparar(a, b);
      if (c) return desc ? -c : c;
    }
    return 0;
  });
}

// ---------------------------------------------------------------------
// Vista trabajos_resumen calculada desde el espejo
// ---------------------------------------------------------------------
function fechaLocal(iso) { return new Date(iso).toLocaleDateString('en-CA', { timeZone: ZONA }); }
function sumarDiasFecha(fechaStr, dias) {
  const [a, m, d] = fechaStr.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10);
}
async function trabajosResumen() {
  const [trabajos, clientes, equipos, repuestos, pagos] = await Promise.all(
    ['trabajos', 'clientes', 'equipos', 'repuestos', 'pagos'].map(todos));
  const cli = Object.fromEntries(clientes.map((c) => [c.id, c]));
  const eq = Object.fromEntries(equipos.map((e) => [e.id, e]));
  const sumaRep = {}, sumaPag = {};
  repuestos.filter((r) => !r.eliminado).forEach((r) => { sumaRep[r.trabajo_id] = (sumaRep[r.trabajo_id] || 0) + Number(r.cantidad) * Number(r.precio_unitario); });
  pagos.filter((p) => !p.eliminado).forEach((p) => { sumaPag[p.trabajo_id] = (sumaPag[p.trabajo_id] || 0) + Number(p.monto); });
  const hoy = fechaLocal(new Date().toISOString());

  return trabajos.filter((t) => !t.eliminado && cli[t.cliente_id] && !cli[t.cliente_id].eliminado).map((t) => {
    const c = cli[t.cliente_id], e = eq[t.equipo_id] || {};
    const totalRep = Math.round((sumaRep[t.id] || 0) * 100) / 100;
    const total = Number(t.mano_obra || 0) + totalRep;
    const pagado = sumaPag[t.id] || 0;
    const saldo = total - pagado;
    const realizado = t.estado === 'realizado' && t.fecha_realizado;
    const garantia = realizado ? sumarDiasFecha(fechaLocal(t.fecha_realizado), GARANTIA_DIAS) : null;
    return {
      ...t,
      cliente_nombre: c.nombre, cliente_apellido: c.apellido, cliente_telefono: c.telefono,
      equipo_tipo: e.tipo ?? null, equipo_marca: e.marca ?? null, equipo_modelo: e.modelo ?? null,
      total_repuestos: totalRep, total, pagado, saldo,
      estado_cobro: t.estado !== 'realizado' ? null : saldo <= 0 ? 'pagado' : pagado > 0 ? 'parcial' : 'debe',
      garantia_hasta: garantia,
      en_garantia: realizado ? hoy <= garantia : false,
    };
  });
}

// ---------------------------------------------------------------------
// Responder una lectura (GET/HEAD /rest/v1/...) desde el espejo
// ---------------------------------------------------------------------
async function responderDesdeEspejo(request) {
  const url = new URL(request.url);
  const tabla = url.pathname.replace(/^\/rest\/v1\//, '');
  let filas;
  if (tabla === 'trabajos_resumen') filas = await trabajosResumen();
  else if (TABLAS.includes(tabla)) filas = await todos(tabla);
  else return sinDatos();

  const params = [...url.searchParams.entries()];
  filas = ordenar(filtrarFilas(filas, params), url.searchParams.get('order'));
  const total = filas.length;
  const offset = Number(url.searchParams.get('offset') || 0);
  const limite = url.searchParams.get('limit');
  filas = filas.slice(offset, limite ? offset + Number(limite) : undefined);

  // Embebidos: "clientes(...)" en equipos
  const select = url.searchParams.get('select') || '';
  if (/(^|,)\s*clientes\(/.test(select)) {
    const cli = Object.fromEntries((await todos('clientes')).map((c) => [c.id, c]));
    filas = filas.map((f) => ({ ...f, clientes: cli[f.cliente_id] || null }));
  }

  const headers = { 'Content-Type': 'application/json', 'X-Denis-Offline': '1' };
  if (/count=/.test(request.headers.get('Prefer') || '')) {
    headers['Content-Range'] = total ? `${offset}-${offset + filas.length - 1}/${total}` : `*/0`;
  }
  return new Response(request.method === 'HEAD' ? null : JSON.stringify(filas), { status: 200, headers });
}
function sinDatos() {
  return new Response(JSON.stringify({ message: 'Sin conexión: este dato todavía no está guardado en el celular.' }),
    { status: 503, headers: { 'Content-Type': 'application/json' } });
}

// ---------------------------------------------------------------------
// Aplicar una escritura al espejo (para verla aunque no haya señal)
// ---------------------------------------------------------------------
async function aplicarAlEspejo(url, metodo, cuerpo) {
  const u = new URL(url);
  const tabla = u.pathname.replace(/^\/rest\/v1\//, '');
  if (!TABLAS.includes(tabla) || typeof cuerpo !== 'string') return;
  let datos;
  try { datos = JSON.parse(cuerpo); } catch { return; }
  const ahora = new Date().toISOString();
  if (metodo === 'POST') {
    const filas = (Array.isArray(datos) ? datos : [datos]).map((f) => ({
      eliminado: false, creado_en: ahora, ...defectos(tabla, f.tecnico_id), ...f, actualizado_en: ahora,
    }));
    await guardarFilas(tabla, filas);
  } else if (metodo === 'PATCH') {
    const afectadas = filtrarFilas(await todos(tabla), [...u.searchParams.entries()]);
    await guardarFilas(tabla, afectadas.map((f) => ({ ...f, ...datos, actualizado_en: ahora })));
  }
}
function defectos(tabla) {
  if (tabla === 'trabajos') return { estado: 'agendado', mano_obra: 0 };
  if (tabla === 'repuestos') return { cantidad: 1, precio_unitario: 0 };
  if (tabla === 'pagos') return { fecha: new Date().toISOString(), forma_pago: 'efectivo' };
  if (tabla === 'presupuestos') return { fecha: new Date().toISOString(), estado: 'borrador', validez_dias: 15, mano_obra: 0, numero: null };
  if (tabla === 'presupuesto_items') return { cantidad: 1, precio_unitario: 0 };
  return {};
}

// ---------------------------------------------------------------------
// Cola de escrituras pendientes
// ---------------------------------------------------------------------
const CABECERAS = ['content-type', 'prefer', 'accept', 'content-profile', 'accept-profile', 'x-upsert', 'cache-control', 'x-client-info', 'apikey'];

async function encolar(request) {
  const headers = {};
  CABECERAS.forEach((h) => { const v = request.headers.get(h); if (v) headers[h] = v; });
  const esJSON = (headers['content-type'] || '').includes('json');
  const cuerpo = esJSON ? await request.clone().text() : await request.clone().blob();
  await tx('cola', 'readwrite', (s) => s.add({ url: request.url, metodo: request.method, headers, cuerpo, cuando: Date.now() }));
  if (esJSON) await aplicarAlEspejo(request.url, request.method, cuerpo);
  await avisarEstado();
}
const hayCola = async () => (await contar('cola')) > 0;

function respuestaFalsa(request) {
  const url = new URL(request.url);
  if (url.pathname.startsWith('/storage/v1/object/')) {
    const ruta = url.pathname.replace(/^\/storage\/v1\/object\//, '');
    return new Response(JSON.stringify({ Key: ruta, Id: 'pendiente' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  return new Response(null, { status: request.method === 'POST' ? 201 : 204, headers: { 'X-Denis-Offline': '1' } });
}

// ---------------------------------------------------------------------
// Sincronizar: enviar cola y actualizar espejo (lo pide la página con un token vigente)
// ---------------------------------------------------------------------
let sincronizando = false;

async function sincronizar({ token, apikey, base }) {
  if (sincronizando) return;
  sincronizando = true;
  await avisarEstado();
  let enviados = 0;
  try {
    enviados = await enviarCola(token, apikey);
    await actualizarEspejo(token, apikey, base);
  } catch (e) {
    console.warn('[sync]', e);
  } finally {
    sincronizando = false;
    await avisarEstado({ enviados });
  }
}

async function enviarCola(token, apikey) {
  let enviados = 0;
  const items = await todos('cola');
  for (const it of items) {
    let resp;
    try {
      resp = await fetch(it.url, {
        method: it.metodo,
        headers: { ...it.headers, apikey: it.headers.apikey || apikey, Authorization: `Bearer ${token}` },
        body: it.cuerpo,
      });
    } catch {
      break; // sin señal otra vez: se reintenta después
    }
    if (resp.ok || resp.status === 409) {
      // 409 = ya existía (se había subido antes) -> listo
    } else if (resp.status === 400 && it.url.includes('/storage/') && /duplicate|exists/i.test(await resp.clone().text())) {
      // foto ya subida
    } else if (resp.status >= 500 || resp.status === 401) {
      break; // problema del servidor o token vencido: reintentar luego
    } else {
      const detalle = await resp.text().catch(() => '');
      const fallidos = (await leerMeta('fallidos')) || [];
      fallidos.push({ url: it.url, metodo: it.metodo, estado: resp.status, detalle: detalle.slice(0, 300), cuando: Date.now() });
      await guardarMeta('fallidos', fallidos.slice(-20));
    }
    await tx('cola', 'readwrite', (s) => s.delete(it.n));
    enviados++;
    await avisarEstado();
  }
  return enviados;
}

async function actualizarEspejo(token, apikey, base) {
  const headers = { apikey, Authorization: `Bearer ${token}` };
  for (const tabla of TABLAS) {
    const desde = await leerMeta('ultimo_' + tabla);
    let ultimo = desde;
    for (let offset = 0; ; offset += 1000) {
      const q = new URL(`${base}/rest/v1/${tabla}`);
      q.searchParams.set('select', '*');
      if (desde) q.searchParams.set('actualizado_en', 'gt.' + desde);
      q.searchParams.set('order', 'actualizado_en.asc');
      q.searchParams.set('limit', '1000');
      q.searchParams.set('offset', String(offset));
      const resp = await fetch(q, { headers });
      if (!resp.ok) break; // tabla inexistente (SQL sin correr) o sin permiso
      const filas = await resp.json();
      if (filas.length) {
        await guardarFilas(tabla, filas);
        ultimo = filas[filas.length - 1].actualizado_en;
      }
      if (filas.length < 1000) break;
    }
    if (ultimo && ultimo !== desde) await guardarMeta('ultimo_' + tabla, ultimo);
  }
  await guardarMeta('espejo_actualizado', new Date().toISOString());
}

// Al recibir datos frescos del servidor, también se guardan en el espejo
async function guardarRespuestaEnEspejo(request, respuesta) {
  const url = new URL(request.url);
  const tabla = url.pathname.replace(/^\/rest\/v1\//, '');
  if (!TABLAS.includes(tabla) || request.method !== 'GET') return;
  try {
    const datos = await respuesta.clone().json();
    const filas = (Array.isArray(datos) ? datos : [datos]).filter((f) => f && f.id !== undefined);
    if (filas.length) await guardarFilas(tabla, filas);
  } catch { /* respuesta no JSON */ }
}

async function borrarDatos() {
  for (const t of [...TABLAS, 'meta']) await tx(t, 'readwrite', (s) => s.clear());
  await avisarEstado();
}

async function avisarEstado(extra = {}) {
  const pendientes = await contar('cola').catch(() => 0);
  const fallidos = ((await leerMeta('fallidos').catch(() => null)) || []).length;
  const actualizado = await leerMeta('espejo_actualizado').catch(() => null);
  const clientes = await self.clients.matchAll({ includeUncontrolled: true });
  clientes.forEach((c) => c.postMessage({ pendientes, fallidos, sincronizando, actualizado, enviados: 0, ...extra, tipo: 'estado' }));
}
