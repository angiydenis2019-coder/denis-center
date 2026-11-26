-- =====================================================================
--  DENIS CENTER / DC — Versión multi-negocio
--  * Cada técnico tiene su NEGOCIO con sus datos totalmente separados.
--  * El primer administrador (vos) pasa a ser SUPERADMINISTRADOR.
--  * Tus datos actuales quedan dentro de tu negocio, sin perder nada.
--  Pegar completo en: Supabase > SQL Editor > New query > Run
--  ANTES: descargá la copia de seguridad en Excel (Ajustes > Copia de seguridad).
--  Se puede ejecutar más de una vez sin problema.
-- =====================================================================
begin;

-- ---------------------------------------------------------------------
-- 1. NEGOCIOS (uno por técnico): datos que antes estaban en "negocio"
-- ---------------------------------------------------------------------
create table if not exists public.negocios (
  id                  uuid primary key default gen_random_uuid(),
  nombre              text not null default 'Mi negocio',
  tecnico             text not null default '',
  telefono            text,
  direccion           text,
  pie_comprobante     text not null default 'Gracias por su confianza.',
  meses_mantenimiento int  not null default 12 check (meses_mantenimiento between 0 and 60),
  alias               text,
  cbu                 text,
  titular             text,
  banco               text,
  logo_url            text,
  activo              boolean not null default true,   -- false = cuenta suspendida
  notas_admin         text,                            -- solo para el superadministrador
  creado_en           timestamptz not null default now(),
  actualizado_en      timestamptz not null default now()
);
drop trigger if exists t_negocios on public.negocios;
create trigger t_negocios before update on public.negocios
  for each row execute function public.tocar_actualizado();

-- ---------------------------------------------------------------------
-- 2. PERFILES: a qué negocio pertenece cada usuario
-- ---------------------------------------------------------------------
alter table public.perfiles add column if not exists negocio_id uuid references public.negocios(id);
alter table public.perfiles add column if not exists es_superadmin boolean not null default false;
alter table public.perfiles add column if not exists debe_cambiar_clave boolean not null default false;

-- ---------------------------------------------------------------------
-- 3. MUDAR tus datos actuales a TU negocio (solo la primera vez)
-- ---------------------------------------------------------------------
do $$
declare
  nid uuid;
  j   jsonb := '{}'::jsonb;
  sup uuid;
begin
  if exists (select 1 from public.perfiles where negocio_id is not null) then
    return; -- ya estaba migrado
  end if;
  if not exists (select 1 from public.perfiles) then
    return; -- base nueva sin usuarios: el primero que se registre crea su negocio
  end if;
  if to_regclass('public.negocio') is not null then
    select to_jsonb(n) into j from public.negocio n where id = 1;
    j := coalesce(j, '{}'::jsonb);
  end if;
  insert into public.negocios (nombre, tecnico, telefono, direccion, pie_comprobante,
                               meses_mantenimiento, alias, cbu, titular, banco, logo_url)
  values (coalesce(j->>'nombre', 'Denis Center'), coalesce(j->>'tecnico', ''), j->>'telefono', j->>'direccion',
          coalesce(j->>'pie_comprobante', 'Gracias por su confianza.'),
          coalesce((j->>'meses_mantenimiento')::int, 12), j->>'alias', j->>'cbu', j->>'titular', j->>'banco',
          'iconos/logo.png')  -- tu logo de siempre (lo podés cambiar en Ajustes)
  returning id into nid;

  select id into sup from public.perfiles where rol = 'admin' and activo order by creado_en limit 1;
  update public.perfiles set es_superadmin = true where id = sup;
  update public.perfiles set negocio_id = nid;
end $$;

-- ---------------------------------------------------------------------
-- 4. FUNCIONES de permisos
-- ---------------------------------------------------------------------
-- Negocio del usuario conectado (aunque esté suspendido)
create or replace function public.mi_negocio_id()
returns uuid language sql stable security definer set search_path = public as $$
  select negocio_id from public.perfiles where id = auth.uid();
$$;
-- Negocio del usuario conectado SOLO si usuario y negocio están activos
create or replace function public.mi_negocio()
returns uuid language sql stable security definer set search_path = public as $$
  select p.negocio_id from public.perfiles p join public.negocios n on n.id = p.negocio_id
  where p.id = auth.uid() and p.activo and n.activo;
$$;
create or replace function public.es_miembro()
returns boolean language sql stable security definer set search_path = public as $$
  select public.mi_negocio() is not null;
$$;
create or replace function public.es_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.perfiles
                 where id = auth.uid() and activo and rol = 'admin' and negocio_id = public.mi_negocio());
$$;
create or replace function public.es_superadmin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.perfiles where id = auth.uid() and activo and es_superadmin);
$$;

-- ---------------------------------------------------------------------
-- 5. negocio_id en TODAS las tablas de datos + separación por negocio
-- ---------------------------------------------------------------------
do $$
declare
  t   text;
  sup uuid := (select negocio_id from public.perfiles where es_superadmin order by creado_en limit 1);
begin
  foreach t in array array['clientes','equipos','trabajos','repuestos','pagos','fotos','precios','presupuestos','presupuesto_items'] loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('alter table public.%I add column if not exists negocio_id uuid references public.negocios(id)', t);
    execute format('update public.%I set negocio_id = %L where negocio_id is null', t, sup);
    execute format('alter table public.%I alter column negocio_id set default public.mi_negocio()', t);
    execute format('alter table public.%I alter column negocio_id set not null', t);
    execute format('create index if not exists %I on public.%I (negocio_id)', t || '_negocio', t);
    execute format('drop policy if exists %1$s_ver on public.%1$s', t);
    execute format('drop policy if exists %1$s_crear on public.%1$s', t);
    execute format('drop policy if exists %1$s_editar on public.%1$s', t);
    execute format('create policy %1$s_ver on public.%1$s for select to authenticated using (negocio_id = public.mi_negocio())', t);
    execute format('create policy %1$s_crear on public.%1$s for insert to authenticated with check (negocio_id = public.mi_negocio())', t);
    execute format('create policy %1$s_editar on public.%1$s for update to authenticated using (negocio_id = public.mi_negocio()) with check (negocio_id = public.mi_negocio())', t);
  end loop;
end $$;

-- El DNI no se repite DENTRO de cada negocio (dos técnicos pueden tener al mismo cliente)
drop index if exists public.clientes_dni_unico;
create unique index if not exists clientes_dni_unico on public.clientes (negocio_id, dni)
  where dni is not null and dni <> '' and not eliminado;

-- Número de presupuesto correlativo POR NEGOCIO (cada técnico empieza en 1)
do $$
begin
  if to_regclass('public.presupuestos') is not null then
    begin
      alter table public.presupuestos alter column numero drop identity if exists;
    exception when others then null;
    end;
  end if;
end $$;
create or replace function public.presupuesto_numero()
returns trigger language plpgsql as $$
begin
  if new.numero is null then
    select coalesce(max(numero), 0) + 1 into new.numero from public.presupuestos where negocio_id = new.negocio_id;
  end if;
  return new;
end $$;
do $$
begin
  if to_regclass('public.presupuestos') is not null then
    drop trigger if exists t_presupuesto_numero on public.presupuestos;
    create trigger t_presupuesto_numero before insert on public.presupuestos
      for each row execute function public.presupuesto_numero();
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 6. NEGOCIOS y PERFILES: quién ve y cambia qué
-- ---------------------------------------------------------------------
alter table public.negocios enable row level security;
drop policy if exists negocios_ver on public.negocios;
drop policy if exists negocios_editar on public.negocios;
create policy negocios_ver on public.negocios for select to authenticated
  using (id = public.mi_negocio_id() or public.es_superadmin());
create policy negocios_editar on public.negocios for update to authenticated
  using (id = public.mi_negocio() and public.es_admin()) with check (id = public.mi_negocio());
-- Cada técnico solo puede cambiar los datos de su negocio, no "activo" ni las notas del administrador
revoke insert, update, delete on public.negocios from anon, authenticated;
grant update (nombre, tecnico, telefono, direccion, pie_comprobante, meses_mantenimiento,
              alias, cbu, titular, banco, logo_url) on public.negocios to authenticated;

drop policy if exists perfiles_ver on public.perfiles;
drop policy if exists perfiles_admin_edita on public.perfiles;
create policy perfiles_ver on public.perfiles for select to authenticated
  using (id = auth.uid() or (public.es_admin() and negocio_id = public.mi_negocio()));
create policy perfiles_admin_edita on public.perfiles for update to authenticated
  using (public.es_admin() and negocio_id = public.mi_negocio())
  with check (negocio_id = public.mi_negocio());
-- Nadie puede darse permisos de superadministrador ni cambiarse de negocio desde la app
revoke update on public.perfiles from anon, authenticated;
grant update (nombre, rol, activo) on public.perfiles to authenticated;

-- La tabla vieja "negocio" ya no se usa: queda solo para el superadministrador
do $$
begin
  if to_regclass('public.negocio') is not null then
    drop policy if exists negocio_ver on public.negocio;
    drop policy if exists negocio_editar on public.negocio;
    create policy negocio_ver on public.negocio for select to authenticated using (public.es_superadmin());
  end if;
end $$;

-- Siempre tiene que quedar un superadministrador activo
create or replace function public.proteger_ultimo_admin()
returns trigger language plpgsql as $$
begin
  if exists (select 1 from public.perfiles)
     and not exists (select 1 from public.perfiles where es_superadmin and activo) then
    raise exception 'Tiene que quedar al menos un superadministrador activo';
  end if;
  return null;
end $$;
drop trigger if exists t_proteger_admin on public.perfiles;  -- reemplazado por este
drop trigger if exists t_proteger_superadmin on public.perfiles;
create trigger t_proteger_superadmin after update or delete on public.perfiles
  for each statement execute function public.proteger_ultimo_admin();

-- Usuarios nuevos: los crea el superadministrador con su negocio (ver función admin-usuarios)
create or replace function public.crear_perfil_nuevo_usuario()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  es_primero boolean;
  nid uuid := nullif(new.raw_user_meta_data->>'negocio_id', '')::uuid;
  nuevo_tecnico boolean := nid is not null;
begin
  select not exists (select 1 from public.perfiles) into es_primero;
  if es_primero and nid is null then
    insert into public.negocios default values returning id into nid;
  end if;
  if nid is null then -- ayudante creado a mano: se suma al negocio del superadministrador, inactivo
    select negocio_id into nid from public.perfiles where es_superadmin order by creado_en limit 1;
  end if;
  insert into public.perfiles (id, nombre, email, rol, activo, negocio_id, es_superadmin, debe_cambiar_clave)
  values (new.id,
          coalesce(new.raw_user_meta_data->>'nombre', split_part(new.email, '@', 1)),
          new.email,
          case when es_primero or nuevo_tecnico then 'admin' else 'ayudante' end,
          es_primero or nuevo_tecnico,
          nid,
          es_primero,
          nuevo_tecnico);
  return new;
end $$;

-- El usuario marca que ya eligió su contraseña propia
create or replace function public.marcar_clave_cambiada()
returns void language sql security definer set search_path = public as $$
  update public.perfiles set debe_cambiar_clave = false where id = auth.uid();
$$;
revoke execute on function public.marcar_clave_cambiada() from public, anon;
grant execute on function public.marcar_clave_cambiada() to authenticated;

-- ---------------------------------------------------------------------
-- 7. PANEL DEL SUPERADMINISTRADOR (solo cantidades, no ve los datos)
-- ---------------------------------------------------------------------
create or replace function public.admin_negocios()
returns table (
  id uuid, nombre text, tecnico text, telefono text, activo boolean, creado_en timestamptz,
  usuario_id uuid, email text, ultimo_ingreso timestamptz, debe_cambiar_clave boolean,
  clientes bigint, trabajos bigint, presupuestos bigint, fotos bigint, es_mio boolean
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
         n.id = public.mi_negocio_id()
  from public.negocios n
  left join lateral (
    select pp.id, pp.email, pp.debe_cambiar_clave from public.perfiles pp
    where pp.negocio_id = n.id and pp.rol = 'admin' order by pp.creado_en limit 1
  ) p on true
  left join auth.users u on u.id = p.id
  order by n.creado_en;
end $$;
revoke execute on function public.admin_negocios() from public, anon;
grant execute on function public.admin_negocios() to authenticated;

create or replace function public.admin_set_activo(p_negocio uuid, p_activo boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.es_superadmin() then raise exception 'Solo el superadministrador'; end if;
  if p_negocio = public.mi_negocio_id() and not p_activo then
    raise exception 'No podés suspender tu propio negocio';
  end if;
  update public.negocios set activo = p_activo where id = p_negocio;
end $$;
revoke execute on function public.admin_set_activo(uuid, boolean) from public, anon;
grant execute on function public.admin_set_activo(uuid, boolean) to authenticated;

create or replace function public.admin_set_notas(p_negocio uuid, p_notas text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.es_superadmin() then raise exception 'Solo el superadministrador'; end if;
  update public.negocios set notas_admin = p_notas where id = p_negocio;
end $$;
revoke execute on function public.admin_set_notas(uuid, text) from public, anon;
grant execute on function public.admin_set_notas(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- 8. FOTOS separadas por negocio y LOGOS de cada negocio
-- ---------------------------------------------------------------------
drop policy if exists fotos_archivo_ver on storage.objects;
drop policy if exists fotos_archivo_subir on storage.objects;
create policy fotos_archivo_ver on storage.objects for select to authenticated
  using (bucket_id = 'fotos' and (
    (storage.foldername(name))[1] = public.mi_negocio()::text
    or exists (select 1 from public.fotos f where f.ruta = storage.objects.name and f.negocio_id = public.mi_negocio())));
create policy fotos_archivo_subir on storage.objects for insert to authenticated
  with check (bucket_id = 'fotos' and (storage.foldername(name))[1] = public.mi_negocio()::text);

insert into storage.buckets (id, name, public) values ('logos', 'logos', true)
on conflict (id) do update set public = true;
drop policy if exists logos_ver on storage.objects;
drop policy if exists logos_subir on storage.objects;
drop policy if exists logos_cambiar on storage.objects;
create policy logos_ver on storage.objects for select to authenticated
  using (bucket_id = 'logos');
create policy logos_subir on storage.objects for insert to authenticated
  with check (bucket_id = 'logos' and (storage.foldername(name))[1] = public.mi_negocio()::text and public.es_admin());
create policy logos_cambiar on storage.objects for update to authenticated
  using (bucket_id = 'logos' and (storage.foldername(name))[1] = public.mi_negocio()::text and public.es_admin());

commit;
