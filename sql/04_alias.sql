-- =====================================================================
--  DENIS CENTER 1.0 — Datos para transferencias (alias, CBU/CVU, titular)
--  Pegar completo en: Supabase > SQL Editor > New query > Run
--  (Se puede ejecutar más de una vez sin problema)
-- =====================================================================
alter table public.negocio add column if not exists alias   text;
alter table public.negocio add column if not exists cbu     text;
alter table public.negocio add column if not exists titular text;
alter table public.negocio add column if not exists banco   text;
