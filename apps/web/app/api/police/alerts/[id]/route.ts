import { asUser } from '@/lib/server/db';
import { handle, ok, uuid } from '@/lib/server/http';
import { maskNin } from '@/lib/server/identity';
import { log, requireAlertAccess, requireOfficer } from '@/lib/server/police';
import { requireUser } from '@/lib/server/session';

// GET → full case: location, resident identity (masked NIN), evidence, chain of command.
// Every open is written to the audit log.
export const GET = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const userId = await requireUser(req);
  const id = uuid((await params).id);
  return ok(await asUser(userId, async (tx) => {
    const me = await requireOfficer(tx);
    await requireAlertAccess(tx, id);
    const a = await tx.one(
      `select a.*, e.name as estate_name, e.address as estate_address, e.gate_phone, u.label as unit_label,
              jsonb_build_object('id', p.id, 'full_name', p.full_name, 'phone', p.phone,
                                 'nin_last4', ri.nin_last4, 'has_selfie', ri.selfie_path is not null) as resident,
              case when s.id is null then null else jsonb_build_object('id', s.id, 'name', s.name, 'phone', s.phone) end as post,
              case when reg.id is null then null else jsonb_build_object('id', reg.id, 'name', reg.name) end as regional,
              case when o.id is null then null else jsonb_build_object('id', o.id, 'full_name', o.full_name, 'phone', o.phone) end as assigned_officer,
              coalesce((select jsonb_agg(jsonb_build_object('id', ev.id, 'kind', ev.kind, 'created_at', ev.created_at) order by ev.created_at)
                          from sos_evidence ev where ev.alert_id = a.id), '[]') as evidence,
              (select jsonb_build_object('category', c.category, 'message', c.message, 'has_photo', c.photo_path is not null)
                 from community_alerts c where c.sos_alert_id = a.id limit 1) as community
         from sos_alerts a
         join profiles p on p.id = a.user_id
         join estates e on e.id = a.estate_id
         left join units u on u.id = a.unit_id
         left join resident_identity ri on ri.user_id = a.user_id
         left join police_stations s on s.id = a.police_station_id
         left join police_stations reg on reg.id = s.parent_id
         left join police_officers o on o.id = a.assigned_officer_id
        where a.id = $1`,
      [id],
    );
    await log(tx, 'view_alert', id, a.user_id);
    a.resident.nin_masked = maskNin(a.resident.nin_last4);
    delete a.resident.nin_last4;
    return {
      alert: a,
      me: { id: me.id, role: me.role, station_id: me.station_id, level: me.station.level },
      can: {
        assign: me.station_id === a.police_station_id && me.role !== 'officer',
        escalate:
          (a.police_level === 'post' && me.station_id === a.police_station_id && me.role !== 'officer' && !!a.regional) ||
          (a.police_level === 'regional' && me.station_id === a.regional?.id && me.role === 'commander'),
        status: a.assigned_officer_id === me.id || (me.station_id === a.police_station_id && me.role !== 'officer'),
      },
    };
  }));
});
