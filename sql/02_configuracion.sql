-- =====================================================================
--  DENIS CENTER 1.0 — Etapa 4: Configuración, ayudantes y datos del negocio
--  Pegar completo en: Supabase > SQL Editor > New query > Run
--  (Se puede ejecutar más de una vez sin problema)
-- =====================================================================

-- 1. Guardar el correo en el perfil (para ver quién es quién en Ajustes)
alter table public.perfiles add column if not exists email text;

update public.perfiles p
set email = u.email
from auth.users u
where u.id = p.id and p.email is distinct from u.email;

create or replace function public.crear_perfil_nuevo_usuario()
returns trigger language plpgsql security definer set search_path = public as $$
declare es_primero boolean;
begin
  select not exists (select 1 from public.perfiles) into es_primero;
  insert into public.perfiles (id, nombre, email, rol, activo)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nombre', split_part(new.email, '@', 1)),
    new.email,
    case when es_primero then 'admin' else 'ayudante' end,
    es_primero
  );
  return new;
end $$;

-- 2. Cada usuario puede cambiar SU PROPIO nombre (y nada más)
create or replace function public.cambiar_mi_nombre(nuevo text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if coalesce(trim(nuevo), '') = '' then
    raise exception 'El nombre no puede quedar vacío';
  end if;
  update public.perfiles set nombre = trim(nuevo) where id = auth.uid();
end $$;
revoke execute on function public.cambiar_mi_nombre(text) from public, anon;
grant execute on function public.cambiar_mi_nombre(text) to authenticated;

-- 3. Nunca puede quedar el sistema sin un administrador activo
create or replace function public.proteger_ultimo_admin()
returns trigger language plpgsql as $$
begin
  if not exists (select 1 from public.perfiles where rol = 'admin' and activo) then
    raise exception 'Tiene que quedar al menos un administrador activo';
  end if;
  return null;
end $$;

drop trigger if exists t_proteger_admin on public.perfiles;
create trigger t_proteger_admin
  after update or delete on public.perfiles
  for each statement execute function public.proteger_ultimo_admin();

-- 4. Datos del negocio (una sola fila) para comprobantes y mensajes
create table if not exists public.negocio (
  id              int primary key default 1 check (id = 1),
  nombre          text not null default 'Denis Center',
  tecnico         text not null default 'Denis Ariel Torres',
  telefono        text,
  direccion       text,
  pie_comprobante text not null default 'Gracias por su confianza.',
  actualizado_en  timestamptz not null default now()
);
insert into public.negocio (id) values (1) on conflict (id) do nothing;

drop trigger if exists t_negocio on public.negocio;
create trigger t_negocio before update on public.negocio
  for each row execute function public.tocar_actualizado();

alter table public.negocio enable row level security;
drop policy if exists negocio_ver on public.negocio;
drop policy if exists negocio_editar on public.negocio;
create policy negocio_ver on public.negocio for select to authenticated
  using (public.es_miembro());
create policy negocio_editar on public.negocio for update to authenticated
  using (public.es_admin()) with check (public.es_admin());
