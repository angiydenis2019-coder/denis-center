-- =====================================================================
--  DENIS CENTER 1.0 — Esquema de base de datos para Supabase
--  Pegar completo en: Supabase > SQL Editor > New query > Run
-- =====================================================================
--  Decisiones de diseño:
--  * Todos los id son UUID generados en el celular -> permite cargar
--    datos sin conexión y sincronizar después sin choques de id.
--  * "actualizado_en" y "eliminado" en cada tabla -> base para la
--    sincronización offline (nunca se borra físicamente, se marca).
--  * Garantía fija de 90 días desde la fecha en que se realizó el trabajo.
--  * El saldo pendiente NO se guarda: se calcula (total - pagos).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Función genérica para mantener "actualizado_en"
-- ---------------------------------------------------------------------
create or replace function public.tocar_actualizado()
returns trigger language plpgsql as $$
begin
  new.actualizado_en := now();
  return new;
end $$;

-- ---------------------------------------------------------------------
-- 1. PERFILES (usuarios de la app: vos y, más adelante, ayudantes)
-- ---------------------------------------------------------------------
create table public.perfiles (
  id             uuid primary key references auth.users(id) on delete cascade,
  nombre         text not null default '',
  rol            text not null default 'ayudante' check (rol in ('admin','ayudante')),
  activo         boolean not null default false,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

-- El PRIMER usuario que se registra queda como admin activo.
-- Los siguientes quedan inactivos hasta que el admin los active.
create or replace function public.crear_perfil_nuevo_usuario()
returns trigger language plpgsql security definer set search_path = public as $$
declare es_primero boolean;
begin
  select not exists (select 1 from public.perfiles) into es_primero;
  insert into public.perfiles (id, nombre, rol, activo)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nombre', split_part(new.email, '@', 1)),
    case when es_primero then 'admin' else 'ayudante' end,
    es_primero
  );
  return new;
end $$;

create trigger al_crear_usuario
  after insert on auth.users
  for each row execute function public.crear_perfil_nuevo_usuario();

-- ¿El usuario conectado es miembro activo del negocio?
create or replace function public.es_miembro()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.perfiles where id = auth.uid() and activo);
$$;

create or replace function public.es_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.perfiles where id = auth.uid() and activo and rol = 'admin');
$$;

-- ---------------------------------------------------------------------
-- 2. CLIENTES
-- ---------------------------------------------------------------------
create table public.clientes (
  id             uuid primary key default gen_random_uuid(),
  nombre         text not null,
  apellido       text not null default '',
  dni            text,
  telefono       text,            -- con código de país, ej: 5493704123456
  direccion      text,
  notas          text,
  eliminado      boolean not null default false,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
-- Un DNI no se puede repetir (si se cargó)
create unique index clientes_dni_unico on public.clientes (dni)
  where dni is not null and dni <> '' and not eliminado;
create index clientes_busqueda on public.clientes (lower(apellido), lower(nombre));

-- ---------------------------------------------------------------------
-- 3. EQUIPOS (cada cliente puede tener varios)
-- ---------------------------------------------------------------------
create table public.equipos (
  id             uuid primary key default gen_random_uuid(),
  cliente_id     uuid not null references public.clientes(id),
  tipo           text not null,   -- aire, heladera, lavarropas, instalación eléctrica...
  marca          text,
  modelo         text,
  numero_serie   text,
  ubicacion      text,            -- "aire del living"
  notas          text,
  eliminado      boolean not null default false,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create index equipos_cliente on public.equipos (cliente_id);

-- ---------------------------------------------------------------------
-- 4. TRABAJOS (turno agendado -> realizado / cancelado)
-- ---------------------------------------------------------------------
create table public.trabajos (
  id                uuid primary key default gen_random_uuid(),
  cliente_id        uuid not null references public.clientes(id),
  equipo_id         uuid references public.equipos(id),   -- opcional
  tecnico_id        uuid references public.perfiles(id),  -- quién lo hace
  estado            text not null default 'agendado'
                      check (estado in ('agendado','realizado','cancelado')),
  -- Al agendar
  fecha_turno       timestamptz,
  falla_reportada   text,
  -- Al terminar
  fecha_realizado   timestamptz,
  diagnostico       text,
  trabajo_realizado text,
  mano_obra         numeric(12,2) not null default 0 check (mano_obra >= 0),
  notas             text,
  eliminado         boolean not null default false,
  creado_en         timestamptz not null default now(),
  actualizado_en    timestamptz not null default now(),
  -- Un trabajo realizado tiene que tener fecha de realización
  constraint realizado_con_fecha check (estado <> 'realizado' or fecha_realizado is not null)
);
create index trabajos_cliente on public.trabajos (cliente_id);
create index trabajos_equipo  on public.trabajos (equipo_id);
create index trabajos_turno   on public.trabajos (fecha_turno) where estado = 'agendado';

-- ---------------------------------------------------------------------
-- 5. REPUESTOS usados en un trabajo
-- ---------------------------------------------------------------------
create table public.repuestos (
  id              uuid primary key default gen_random_uuid(),
  trabajo_id      uuid not null references public.trabajos(id),
  descripcion     text not null,
  cantidad        numeric(10,2) not null default 1 check (cantidad > 0),
  precio_unitario numeric(12,2) not null default 0 check (precio_unitario >= 0),
  eliminado       boolean not null default false,
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now()
);
create index repuestos_trabajo on public.repuestos (trabajo_id);

-- ---------------------------------------------------------------------
-- 6. PAGOS (un trabajo puede cobrarse en partes: seña + resto)
-- ---------------------------------------------------------------------
create table public.pagos (
  id             uuid primary key default gen_random_uuid(),
  trabajo_id     uuid not null references public.trabajos(id),
  fecha          timestamptz not null default now(),
  monto          numeric(12,2) not null check (monto > 0),
  forma_pago     text not null default 'efectivo'
                   check (forma_pago in ('efectivo','transferencia','mercado_pago','otro')),
  notas          text,
  eliminado      boolean not null default false,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create index pagos_trabajo on public.pagos (trabajo_id);

-- ---------------------------------------------------------------------
-- 7. FOTOS (los archivos van al bucket "fotos"; acá queda la referencia)
-- ---------------------------------------------------------------------
create table public.fotos (
  id             uuid primary key default gen_random_uuid(),
  trabajo_id     uuid references public.trabajos(id),
  equipo_id      uuid references public.equipos(id),
  ruta           text not null,   -- ruta dentro del bucket
  etiqueta       text not null default 'equipo'
                   check (etiqueta in ('equipo','placa_modelo','pieza_cambiada','antes','despues','otra')),
  descripcion    text,
  eliminado      boolean not null default false,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint foto_con_destino check (trabajo_id is not null or equipo_id is not null)
);
create index fotos_trabajo on public.fotos (trabajo_id);
create index fotos_equipo  on public.fotos (equipo_id);

-- ---------------------------------------------------------------------
-- 8. Triggers de "actualizado_en"
-- ---------------------------------------------------------------------
create trigger t_perfiles  before update on public.perfiles  for each row execute function public.tocar_actualizado();
create trigger t_clientes  before update on public.clientes  for each row execute function public.tocar_actualizado();
create trigger t_equipos   before update on public.equipos   for each row execute function public.tocar_actualizado();
create trigger t_trabajos  before update on public.trabajos  for each row execute function public.tocar_actualizado();
create trigger t_repuestos before update on public.repuestos for each row execute function public.tocar_actualizado();
create trigger t_pagos     before update on public.pagos     for each row execute function public.tocar_actualizado();
create trigger t_fotos     before update on public.fotos     for each row execute function public.tocar_actualizado();

-- ---------------------------------------------------------------------
-- 9. VISTA de resumen: total, pagado, saldo, estado de cobro y garantía
-- ---------------------------------------------------------------------
create or replace view public.trabajos_resumen
with (security_invoker = true) as
select
  t.*,
  c.nombre   as cliente_nombre,
  c.apellido as cliente_apellido,
  c.telefono as cliente_telefono,
  e.tipo     as equipo_tipo,
  e.marca    as equipo_marca,
  e.modelo   as equipo_modelo,
  coalesce(r.total_repuestos, 0)                       as total_repuestos,
  t.mano_obra + coalesce(r.total_repuestos, 0)         as total,
  coalesce(p.total_pagado, 0)                          as pagado,
  t.mano_obra + coalesce(r.total_repuestos, 0) - coalesce(p.total_pagado, 0) as saldo,
  case
    when t.estado <> 'realizado' then null
    when t.mano_obra + coalesce(r.total_repuestos, 0) - coalesce(p.total_pagado, 0) <= 0 then 'pagado'
    when coalesce(p.total_pagado, 0) > 0 then 'parcial'
    else 'debe'
  end                                                  as estado_cobro,
  case when t.estado = 'realizado'
       then ((t.fecha_realizado at time zone 'America/Argentina/Buenos_Aires')::date + 90)
  end                                                  as garantia_hasta,
  (t.estado = 'realizado'
   and (now() at time zone 'America/Argentina/Buenos_Aires')::date
       <= (t.fecha_realizado at time zone 'America/Argentina/Buenos_Aires')::date + 90
  )                                                    as en_garantia
from public.trabajos t
join public.clientes c on c.id = t.cliente_id
left join public.equipos e on e.id = t.equipo_id
left join lateral (
  select sum(cantidad * precio_unitario)::numeric(12,2) as total_repuestos
  from public.repuestos where trabajo_id = t.id and not eliminado
) r on true
left join lateral (
  select sum(monto) as total_pagado
  from public.pagos where trabajo_id = t.id and not eliminado
) p on true
where not t.eliminado;

-- ---------------------------------------------------------------------
-- 10. SEGURIDAD (Row Level Security): solo miembros activos ven datos
-- ---------------------------------------------------------------------
alter table public.perfiles  enable row level security;
alter table public.clientes  enable row level security;
alter table public.equipos   enable row level security;
alter table public.trabajos  enable row level security;
alter table public.repuestos enable row level security;
alter table public.pagos     enable row level security;
alter table public.fotos     enable row level security;

-- Perfiles: cada uno ve el suyo; el admin ve y edita todos
create policy perfiles_ver on public.perfiles for select to authenticated
  using (id = auth.uid() or public.es_admin());
create policy perfiles_admin_edita on public.perfiles for update to authenticated
  using (public.es_admin()) with check (public.es_admin());

-- Datos del negocio: miembros activos leen, crean y modifican
-- (no hay política DELETE: se usa "eliminado = true")
do $$
declare tabla text;
begin
  foreach tabla in array array['clientes','equipos','trabajos','repuestos','pagos','fotos'] loop
    execute format('create policy %1$s_ver      on public.%1$s for select to authenticated using (public.es_miembro())', tabla);
    execute format('create policy %1$s_crear    on public.%1$s for insert to authenticated with check (public.es_miembro())', tabla);
    execute format('create policy %1$s_editar   on public.%1$s for update to authenticated using (public.es_miembro()) with check (public.es_miembro())', tabla);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 11. ALMACENAMIENTO DE FOTOS (bucket privado "fotos")
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('fotos', 'fotos', false)
on conflict (id) do nothing;

create policy fotos_archivo_ver on storage.objects for select to authenticated
  using (bucket_id = 'fotos' and public.es_miembro());
create policy fotos_archivo_subir on storage.objects for insert to authenticated
  with check (bucket_id = 'fotos' and public.es_miembro());
