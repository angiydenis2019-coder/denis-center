-- =====================================================================
--  DC — "¿Olvidaste tu contraseña?": el técnico pide una contraseña nueva
--  desde la pantalla de ingreso y el superadministrador le da una provisoria.
--  Se puede ejecutar más de una vez sin problema.
-- =====================================================================
create table if not exists public.pedidos_clave (
  id          uuid primary key default gen_random_uuid(),
  usuario_id  uuid not null references public.perfiles(id) on delete cascade,
  estado      text not null default 'pendiente' check (estado in ('pendiente', 'resuelto', 'descartado')),
  creado_en   timestamptz not null default now(),
  resuelto_en timestamptz,
  avisado_en  timestamptz,
  dispositivo text
);
create index if not exists pedidos_clave_pendientes on public.pedidos_clave (estado, creado_en);
alter table public.pedidos_clave enable row level security;
revoke all on public.pedidos_clave from anon, authenticated;
grant select on public.pedidos_clave to authenticated;
drop policy if exists pedidos_clave_ver on public.pedidos_clave;
create policy pedidos_clave_ver on public.pedidos_clave for select to authenticated using (public.es_superadmin());

-- Pedido desde la pantalla de ingreso (sin sesión). Nunca dice si el correo existe.
create or replace function public.pedir_clave(p_email text, p_dispositivo text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  u uuid;
begin
  select id into u from public.perfiles
   where lower(email) = lower(trim(coalesce(p_email, ''))) and activo and not es_superadmin;
  if u is null then return; end if;
  -- como mucho un pedido pendiente por usuario y 3 por día
  if exists (select 1 from public.pedidos_clave where usuario_id = u and estado = 'pendiente') then return; end if;
  if (select count(*) from public.pedidos_clave where usuario_id = u and creado_en > now() - interval '1 day') >= 3 then return; end if;
  insert into public.pedidos_clave (usuario_id, dispositivo) values (u, left(p_dispositivo, 300));
end $$;
revoke execute on function public.pedir_clave(text, text) from public;
grant execute on function public.pedir_clave(text, text) to anon, authenticated;

-- Lista para el panel del superadministrador
create or replace function public.admin_pedidos_clave()
returns table (id uuid, usuario_id uuid, creado_en timestamptz, email text, nombre text, negocio text, telefono text,
               apellido text, nombre_tecnico text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.es_superadmin() then raise exception 'Solo el superadministrador'; end if;
  return query
  select k.id, k.usuario_id, k.creado_en, p.email, p.nombre, n.nombre, n.telefono, n.admin_apellido, n.admin_nombre
  from public.pedidos_clave k
  join public.perfiles p on p.id = k.usuario_id
  left join public.negocios n on n.id = p.negocio_id
  where k.estado = 'pendiente'
  order by k.creado_en;
end $$;
revoke execute on function public.admin_pedidos_clave() from public, anon;
grant execute on function public.admin_pedidos_clave() to authenticated;

create or replace function public.admin_resolver_pedido_clave(p_id uuid, p_estado text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.es_superadmin() then raise exception 'Solo el superadministrador'; end if;
  if p_estado not in ('resuelto', 'descartado') then raise exception 'Estado no válido'; end if;
  update public.pedidos_clave set estado = p_estado, resuelto_en = now() where id = p_id;
end $$;
revoke execute on function public.admin_resolver_pedido_clave(uuid, text) from public, anon;
grant execute on function public.admin_resolver_pedido_clave(uuid, text) to authenticated;
