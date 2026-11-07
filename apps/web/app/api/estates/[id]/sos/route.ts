import { asUser } from '@/lib/server/db';
import { handle, ok, uuid } from '@/lib/server/http';
import { requireUser } from '@/lib/server/session';

// GET → recent SOS alerts for the estate with who raised them, evidence and notifications (staff only)
export const GET = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const userId = await requireUser(req);
  const id = uuid((await params).id);
  return ok(await asUser(userId, async (tx) => {
    await tx.assert('is_estate_staff', id);
    return tx.all(
      `select a.*,
              jsonb_build_object('full_name', p.full_name, 'phone', p.phone) as resident,
              case when u.id is null then null else jsonb_build_object('label', u.label) end as unit,
              case when s.id is null then null else jsonb_build_object('name', s.name, 'phone', s.phone) end as station,
              coalesce((select jsonb_agg(e order by e.created_at) from sos_evidence e where e.alert_id = a.id), '[]') as evidence,
              coalesce((select jsonb_agg(jsonb_build_object('recipient_type', n.recipient_type, 'channel', n.channel, 'status', n.status))
                          from notification_log n where n.alert_id = a.id), '[]') as notifications
         from sos_alerts a
         left join profiles p on p.id = a.user_id
         left join units u on u.id = a.unit_id
         left join police_stations s on s.id = a.police_station_id
        where a.estate_id = $1
        order by a.created_at desc
        limit 50`,
      [id],
    );
  }));
});
