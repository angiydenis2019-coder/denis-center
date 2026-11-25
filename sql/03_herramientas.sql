-- =====================================================================
--  DENIS CENTER 1.0 — Etapa 5: Lista de precios y recordatorios de mantenimiento
--  Pegar completo en: Supabase > SQL Editor > New query > Run
--  (Se puede ejecutar más de una vez sin problema)
-- =====================================================================

-- 1. LISTA DE PRECIOS (repuestos y servicios frecuentes)
create table if not exists public.precios (
  id             uuid primary key default gen_random_uuid(),
  tipo           text not null default 'repuesto' check (tipo in ('repuesto','servicio')),
  descripcion    text not null,
  precio         numeric(12,2) not null default 0 check (precio >= 0),
  eliminado      boolean not null default false,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create index if not exists precios_tipo on public.precios (tipo, lower(descripcion));

drop trigger if exists t_precios on public.precios;
create trigger t_precios before update on public.precios
  for each row execute function public.tocar_actualizado();

alter table public.precios enable row level security;
drop policy if exists precios_ver on public.precios;
drop policy if exists precios_crear on public.precios;
drop policy if exists precios_editar on public.precios;
create policy precios_ver    on public.precios for select to authenticated using (public.es_miembro());
create policy precios_crear  on public.precios for insert to authenticated with check (public.es_miembro());
create policy precios_editar on public.precios for update to authenticated using (public.es_miembro()) with check (public.es_miembro());

-- 2. RECORDATORIOS DE MANTENIMIENTO
-- Cada cuántos meses sugerir un service (0 = desactivado)
alter table public.negocio add column if not exists meses_mantenimiento int not null default 12
  check (meses_mantenimiento between 0 and 60);
-- Hasta qué fecha no recordar un equipo (posponer / no recordar más)
alter table public.equipos add column if not exists recordatorio_hasta date;
