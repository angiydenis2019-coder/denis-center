// Estilos visuales de la app (se guardan en este celular)
export const TEMAS = [
  { id: 'clara', nombre: 'Clara', color: '#ffffff' },
  { id: 'azul', nombre: 'Azul profundo', color: '#0b3d7a' },
  { id: 'oscura', nombre: 'Oscura', color: '#0c1420' },
];

export function temaActual() {
  try { return localStorage.getItem('dc_tema') || 'clara'; } catch { return 'clara'; }
}

export function aplicarTema(id) {
  const t = TEMAS.find((x) => x.id === id) || TEMAS[0];
  document.documentElement.dataset.tema = t.id;
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', t.color);
  try { localStorage.setItem('dc_tema', t.id); } catch { /* sin almacenamiento */ }
  return t;
}

export function siguienteTema() {
  const i = TEMAS.findIndex((x) => x.id === temaActual());
  return aplicarTema(TEMAS[(i + 1) % TEMAS.length].id);
}
