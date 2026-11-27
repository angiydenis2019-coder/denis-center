-- =====================================================================
--  DC — Garantía por trabajo: cada trabajo tiene su propia cantidad de días
--  (0 = sin garantía). Los trabajos que ya existen quedan con 90 días.
--  Pegar completo en: Supabase > SQL Editor > New query > Run
--  Se puede ejecutar más de una vez sin problema.
-- =====================================================================
begin;

alter table public.trabajos add column if not exists garantia_dias int not null default 90;
do $$ begin
  alter table public.trabajos add constraint trabajos_garantia_dias_ok check (garantia_dias between 0 and 3650);
exception when duplicate_object then null; end $$;

-- La vista de resumen calcula la garantía con los días de cada trabajo
drop view if exists public.trabajos_resumen;
create view public.trabajos_resumen
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
  case when t.estado = 'realizado' and t.garantia_dias > 0
       then ((t.fecha_realizado at time zone 'America/Argentina/Buenos_Aires')::date + t.garantia_dias)
  end                                                  as garantia_hasta,
  (t.estado = 'realizado' and t.garantia_dias > 0
   and (now() at time zone 'America/Argentina/Buenos_Aires')::date
       <= (t.fecha_realizado at time zone 'America/Argentina/Buenos_Aires')::date + t.garantia_dias
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
where not t.eliminado and not c.eliminado;

grant select on public.trabajos_resumen to authenticated;

commit;
