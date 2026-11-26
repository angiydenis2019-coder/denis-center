-- =====================================================================
--  DC — Invitaciones: el técnico completa sus datos desde un link y
--  el superadministrador aprueba o rechaza la solicitud.
--  Pegar completo en: Supabase > SQL Editor > New query > Run
--  Se puede ejecutar más de una vez sin problema.
-- =====================================================================
begin;

create table if not exists public.invitaciones (
  id                    uuid primary key default gen_random_uuid(),
  token                 text not null unique,
  nota                  text,                      -- para quién es (lo escribe el superadministrador)
  estado                text not null default 'pendiente'
                        check (estado in ('pendiente', 'completada', 'aprobada', 'rechazada', 'anulada')),
  creado_en             timestamptz not null default now(),
  vence_en              timestamptz not null default now() + interval '7 days',
  completada_en         timestamptz,
  resuelta_en           timestamptz,
  -- datos que carga el técnico
  apellido              text,
  nombre                text,
  localidad             text,
  negocio               text,
  email                 text,
  telefono              text,
  terminos_version      text,
  dispositivo           text,
  -- cuenta creada al aprobar
  negocio_id            uuid references public.negocios(id)
);
alter table public.invitaciones enable row level security;
revoke all on public.invitaciones from anon, authenticated;
grant select on public.invitaciones to authenticated;
drop policy if exists invitaciones_ver on public.invitaciones;
create policy invitaciones_ver on public.invitaciones for select to authenticated using (public.es_superadmin());

-- El superadministrador genera una invitación (devuelve el código del link)
create or replace function public.admin_crear_invitacion(p_nota text default null)
returns text language plpgsql security definer set search_path = public as $$
declare
  t text := replace(gen_random_uuid()::text, '-', '');  -- 32 caracteres al azar
begin
  if not public.es_superadmin() then raise exception 'Solo el superadministrador'; end if;
  insert into public.invitaciones (token, nota) values (t, nullif(trim(p_nota), ''));
  return t;
end $$;
revoke execute on function public.admin_crear_invitacion(text) from public, anon;
grant execute on function public.admin_crear_invitacion(text) to authenticated;

-- Estado de un link (lo consulta el técnico SIN cuenta). No devuelve datos.
create or replace function public.invitacion_estado(p_token text)
returns text language sql stable security definer set search_path = public as $$
  select coalesce((
    select case
      when estado = 'pendiente' and vence_en > now() then 'valida'
      when estado = 'pendiente' then 'vencida'
      when estado = 'anulada' then 'anulada'
      else 'usada' end
    from public.invitaciones where token = p_token), 'inexistente');
$$;
revoke execute on function public.invitacion_estado(text) from public;
grant execute on function public.invitacion_estado(text) to anon, authenticated;

-- El técnico completa sus datos (una sola vez por link)
create or replace function public.invitacion_completar(
  p_token text, p_apellido text, p_nombre text, p_localidad text, p_negocio text,
  p_email text, p_telefono text, p_terminos_version text, p_dispositivo text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  inv public.invitaciones;
  mail text := lower(trim(coalesce(p_email, '')));
begin
  select * into inv from public.invitaciones where token = p_token for update;
  if not found then raise exception 'El link de invitación no es válido'; end if;
  if inv.estado <> 'pendiente' then raise exception 'Este link ya fue usado'; end if;
  if inv.vence_en <= now() then raise exception 'Este link venció. Pedile uno nuevo a Denis'; end if;
  if length(trim(coalesce(p_apellido, ''))) < 2 or length(trim(coalesce(p_nombre, ''))) < 2 then
    raise exception 'Completá apellido y nombre';
  end if;
  if mail !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'El correo no es válido'; end if;
  if length(regexp_replace(coalesce(p_telefono, ''), '\D', '', 'g')) < 8 then
    raise exception 'Revisá el número de celular';
  end if;
  if coalesce(trim(p_terminos_version), '') = '' then raise exception 'Tenés que aceptar los términos'; end if;
  if exists (select 1 from public.perfiles where lower(email) = mail) then
    raise exception 'Ya existe una cuenta con ese correo. Usá otro o pedile ayuda a Denis';
  end if;
  update public.invitaciones set
    estado = 'completada', completada_en = now(),
    apellido = left(trim(p_apellido), 80), nombre = left(trim(p_nombre), 80),
    localidad = left(nullif(trim(p_localidad), ''), 80), negocio = left(nullif(trim(p_negocio), ''), 80),
    email = mail, telefono = left(trim(p_telefono), 30),
    terminos_version = p_terminos_version, dispositivo = left(p_dispositivo, 300)
  where id = inv.id;
end $$;
revoke execute on function public.invitacion_completar(text, text, text, text, text, text, text, text, text) from public;
grant execute on function public.invitacion_completar(text, text, text, text, text, text, text, text, text) to anon, authenticated;

-- El superadministrador aprueba (después de crear la cuenta), rechaza o anula
create or replace function public.admin_resolver_invitacion(p_id uuid, p_estado text, p_negocio uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  inv public.invitaciones;
  usuario uuid;
begin
  if not public.es_superadmin() then raise exception 'Solo el superadministrador'; end if;
  if p_estado not in ('aprobada', 'rechazada', 'anulada') then raise exception 'Estado no válido'; end if;
  select * into inv from public.invitaciones where id = p_id for update;
  if not found then raise exception 'No existe la invitación'; end if;
  update public.invitaciones set estado = p_estado, resuelta_en = now(), negocio_id = p_negocio where id = p_id;

  -- Al aprobar: los términos que aceptó en el formulario quedan registrados en su cuenta
  if p_estado = 'aprobada' and p_negocio is not null and inv.terminos_version is not null then
    select id into usuario from public.perfiles where negocio_id = p_negocio order by creado_en limit 1;
    if usuario is not null then
      insert into public.aceptaciones_terminos (usuario_id, negocio_id, email, version, aceptado_en, dispositivo)
      values (usuario, p_negocio, inv.email, inv.terminos_version, inv.completada_en,
              'Formulario de invitación · ' || coalesce(inv.dispositivo, ''));
      update public.perfiles set terminos_version = inv.terminos_version, terminos_aceptados_en = inv.completada_en
      where id = usuario;
    end if;
  end if;
end $$;
revoke execute on function public.admin_resolver_invitacion(uuid, text, uuid) from public, anon;
grant execute on function public.admin_resolver_invitacion(uuid, text, uuid) to authenticated;

commit;
