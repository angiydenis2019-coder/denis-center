-- =====================================================================
--  DC — Avisos (notificaciones) al celular
--  Pegar completo en: Supabase > SQL Editor > New query > Run
--  Se puede ejecutar más de una vez sin problema.
-- =====================================================================
begin;

-- Configuración privada: solo la lee la función "avisos" (nadie desde la app)
create table if not exists public.config_privada (
  clave text primary key,
  valor text not null
);
alter table public.config_privada enable row level security;
revoke all on public.config_privada from anon, authenticated;

-- Celulares donde cada usuario activó los avisos
create table if not exists public.suscripciones_push (
  id          uuid primary key default gen_random_uuid(),
  usuario_id  uuid not null references public.perfiles(id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  dispositivo text,
  creado_en   timestamptz not null default now()
);
alter table public.suscripciones_push enable row level security;
revoke all on public.suscripciones_push from anon, authenticated;
grant select, delete on public.suscripciones_push to authenticated;
drop policy if exists suscripciones_ver on public.suscripciones_push;
drop policy if exists suscripciones_borrar on public.suscripciones_push;
create policy suscripciones_ver on public.suscripciones_push for select to authenticated using (usuario_id = auth.uid());
create policy suscripciones_borrar on public.suscripciones_push for delete to authenticated using (usuario_id = auth.uid());

create or replace function public.guardar_suscripcion(p_endpoint text, p_p256dh text, p_auth text, p_dispositivo text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Falta iniciar sesión'; end if;
  insert into public.suscripciones_push (usuario_id, endpoint, p256dh, auth, dispositivo)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, left(p_dispositivo, 300))
  on conflict (endpoint) do update
    set usuario_id = excluded.usuario_id, p256dh = excluded.p256dh, auth = excluded.auth,
        dispositivo = excluded.dispositivo, creado_en = now();
end $$;
revoke execute on function public.guardar_suscripcion(text, text, text, text) from public, anon;
grant execute on function public.guardar_suscripcion(text, text, text, text) to authenticated;

-- Para avisar una sola vez por solicitud
alter table public.invitaciones add column if not exists avisada_en timestamptz;

commit;
