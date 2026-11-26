-- =====================================================================
--  DC — Aceptación de Términos y Condiciones y Política de Privacidad
--  Guarda QUIÉN aceptó, QUÉ versión y CUÁNDO (constancia de consentimiento).
--  Pegar completo en: Supabase > SQL Editor > New query > Run
--  Se puede ejecutar más de una vez sin problema.
-- =====================================================================
begin;

alter table public.perfiles add column if not exists terminos_version text;
alter table public.perfiles add column if not exists terminos_aceptados_en timestamptz;

-- Registro histórico: no se puede modificar ni borrar desde la app
create table if not exists public.aceptaciones_terminos (
  id           uuid primary key default gen_random_uuid(),
  usuario_id   uuid not null references public.perfiles(id),
  negocio_id   uuid references public.negocios(id),
  email        text,
  version      text not null,
  aceptado_en  timestamptz not null default now(),
  dispositivo  text
);
alter table public.aceptaciones_terminos enable row level security;
revoke all on public.aceptaciones_terminos from anon, authenticated;
grant select on public.aceptaciones_terminos to authenticated;
drop policy if exists aceptaciones_ver on public.aceptaciones_terminos;
create policy aceptaciones_ver on public.aceptaciones_terminos for select to authenticated
  using (usuario_id = auth.uid() or public.es_superadmin());

create or replace function public.aceptar_terminos(p_version text, p_dispositivo text default null)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare
  cuando timestamptz := now();
begin
  if auth.uid() is null then raise exception 'Falta iniciar sesión'; end if;
  if coalesce(trim(p_version), '') = '' then raise exception 'Falta la versión'; end if;
  insert into public.aceptaciones_terminos (usuario_id, negocio_id, email, version, aceptado_en, dispositivo)
  select p.id, p.negocio_id, p.email, p_version, cuando, left(p_dispositivo, 300)
  from public.perfiles p where p.id = auth.uid();
  update public.perfiles set terminos_version = p_version, terminos_aceptados_en = cuando where id = auth.uid();
  return cuando;
end $$;
revoke execute on function public.aceptar_terminos(text, text) from public, anon;
grant execute on function public.aceptar_terminos(text, text) to authenticated;

-- Panel del superadministrador: se agrega la versión aceptada y la fecha
drop function if exists public.admin_negocios();
create or replace function public.admin_negocios()
returns table (
  id uuid, nombre text, tecnico text, telefono text, activo boolean, creado_en timestamptz,
  usuario_id uuid, email text, ultimo_ingreso timestamptz, debe_cambiar_clave boolean,
  clientes bigint, trabajos bigint, presupuestos bigint, fotos bigint, es_mio boolean,
  terminos_version text, terminos_aceptados_en timestamptz
) language plpgsql stable security definer set search_path = public as $$
begin
  if not public.es_superadmin() then
    raise exception 'Solo el superadministrador puede ver esto';
  end if;
  return query
  select n.id, n.nombre, n.tecnico, n.telefono, n.activo, n.creado_en,
         p.id, p.email, u.last_sign_in_at, p.debe_cambiar_clave,
         (select count(*) from public.clientes c where c.negocio_id = n.id and not c.eliminado),
         (select count(*) from public.trabajos t where t.negocio_id = n.id and not t.eliminado),
         (select count(*) from public.presupuestos x where x.negocio_id = n.id and not x.eliminado),
         (select count(*) from public.fotos f where f.negocio_id = n.id and not f.eliminado),
         n.id = public.mi_negocio_id(),
         p.terminos_version, p.terminos_aceptados_en
  from public.negocios n
  left join lateral (
    select pp.id, pp.email, pp.debe_cambiar_clave, pp.terminos_version, pp.terminos_aceptados_en
    from public.perfiles pp
    where pp.negocio_id = n.id and pp.rol = 'admin' order by pp.creado_en limit 1
  ) p on true
  left join auth.users u on u.id = p.id
  order by n.creado_en;
end $$;
revoke execute on function public.admin_negocios() from public, anon;
grant execute on function public.admin_negocios() to authenticated;

commit;
