import { asUser } from '@/lib/server/db';
import { handle, ok } from '@/lib/server/http';
import { requireOfficer } from '@/lib/server/police';
import { requireUser } from '@/lib/server/session';

// GET → officers at my unit with their duty status and current open case (for dispatchers)
export const GET = handle(async (req: Request) => {
  const userId = await requireUser(req);
  return ok(await asUser(userId, async (tx) => {
    const me = await requireOfficer(tx);
    return tx.all(
      `select o.id, o.full_name, o.badge_no, o.role, o.on_duty, o.phone,
              (select count(*)::int from sos_alerts a where a.assigned_officer_id = o.id and a.police_status not in ('closed')) as open_cases
         from police_officers o
        where o.station_id = $1 and o.active
        order by o.on_duty desc, o.full_name`,
      [me.station_id],
    );
  }));
});
