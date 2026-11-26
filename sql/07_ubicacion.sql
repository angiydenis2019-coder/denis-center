-- =====================================================================
--  DENIS CENTER 1.0 — Ubicación del cliente en el mapa
--  Guarda el link de Google Maps (o coordenadas GPS) del domicilio.
--  Pegar completo en: Supabase > SQL Editor > New query > Run
-- =====================================================================
alter table public.clientes add column if not exists ubicacion text;
