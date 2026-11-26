-- =====================================================================
--  DC — Datos del técnico para el superadministrador: apellido, nombre y localidad
--  Pegar completo en: Supabase > SQL Editor > New query > Run
--  Se puede ejecutar más de una vez sin problema.
-- =====================================================================
begin;

-- Datos de la ficha del técnico (los carga y los ve solo el superadministrador)
alter table public.negocios add column if not exists admin_apellido text;
alter table public.negocios add column if not exists admin_nombre text;
alter table public.negocios add column if not exists localidad text;

create or replace function public.admin_set_datos(p_negocio uuid, p_apellido text, p_nombre text, p_localidad text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.es_superadmin() then raise exception 'Solo el superadministrador'; end if;
  update public.negocios
     set admin_apellido = nullif(trim(p_apellido), ''),
         admin_nombre   = nullif(trim(p_nombre), ''),
         localidad      = nullif(trim(p_localidad), ''),
         -- la localidad también queda como dirección del negocio si todavía no tiene (la puede cambiar el técnico)
         direccion      = coalesce(nullif(direccion, ''), nullif(trim(p_localidad), ''))
   where id = p_negocio;
end $$;
revoke execute on function public.admin_set_datos(uuid, text, text, text) from public, anon;
grant execute on function public.admin_set_datos(uuid, text, text, text) to authenticated;

drop function if exists public.admin_negocios();
create or replace function public.admin_negocios()
returns table (
  id uuid, nombre text, tecnico text, telefono text, activo boolean, creado_en timestamptz,
  usuario_id uuid, email text, ultimo_ingreso timestamptz, debe_cambiar_clave boolean,
  clientes bigint, trabajos bigint, presupuestos bigint, fotos bigint, es_mio boolean,
  terminos_version text, terminos_aceptados_en timestamptz,
  apellido text, nombre_tecnico text, localidad text
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
         p.terminos_version, p.terminos_aceptados_en,
         n.admin_apellido, n.admin_nombre, n.localidad
  from public.negocios n
  left join lateral (
    select pp.id, pp.email, pp.debe_cambiar_clave, pp.terminos_version, pp.terminos_aceptados_en
    from public.perfiles pp
    where pp.negocio_id = n.id and pp.rol = 'admin' order by pp.creado_en limit 1
  ) p on true
  left join auth.users u on u.id = p.id
  order by (n.id = public.mi_negocio_id()) desc, lower(coalesce(n.admin_apellido, n.tecnico, n.nombre));
end $$;
revoke execute on function public.admin_negocios() from public, anon;
grant execute on function public.admin_negocios() to authenticated;

commit;
