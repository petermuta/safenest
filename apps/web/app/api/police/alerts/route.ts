import { asUser } from '@/lib/server/db';
import { handle, ok } from '@/lib/server/http';
import { requireOfficer } from '@/lib/server/police';
import { requireUser } from '@/lib/server/session';

// GET → SOS alerts this officer's unit may see: open ones, plus the last 7 days
export const GET = handle(async (req: Request) => {
  const userId = await requireUser(req);
  return ok(await asUser(userId, async (tx) => {
    await requireOfficer(tx);
    return tx.all(
      `select a.id, a.created_at, a.status, a.police_status, a.police_level, a.lat, a.lng, a.source,
              a.assigned_at, a.escalated_regional_at, a.escalated_hq_at,
              p.full_name as resident_name, e.name as estate_name, u.label as unit_label,
              s.name as post_name, o.full_name as assigned_officer
         from sos_alerts a
         left join profiles p on p.id = a.user_id
         join estates e on e.id = a.estate_id
         left join units u on u.id = a.unit_id
         left join police_stations s on s.id = a.police_station_id
         left join police_officers o on o.id = a.assigned_officer_id
        where public.can_police_view_alert(a.id)
          and (a.police_status <> 'closed' or a.created_at > now() - interval '7 days')
        order by (a.police_status = 'closed'), a.created_at desc
        limit 100`,
    );
  }));
});
