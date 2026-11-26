-- =====================================================================
--  DENIS CENTER 1.0 — Eliminar clientes
--  Los trabajos de un cliente eliminado dejan de aparecer (Inicio, Agenda,
--  "Me deben", resumen). Si lo recuperás desde la Papelera, vuelven.
--  Pegar completo en: Supabase > SQL Editor > New query > Run
-- =====================================================================
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
where not t.eliminado and not c.eliminado;
