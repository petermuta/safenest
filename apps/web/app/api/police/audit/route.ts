import { asUser } from '@/lib/server/db';
import { handle, ok } from '@/lib/server/http';
import { requireOfficer } from '@/lib/server/police';
import { requireUser } from '@/lib/server/session';

// GET → audit log. Officers see their own actions; dispatchers their post;
// commanders their unit and every unit under it; the super admin sees everything.
export const GET = handle(async (req: Request) => {
  const userId = await requireUser(req);
  return ok(await asUser(userId, async (tx) => {
    const me = await requireOfficer(tx);
    return tx.all(
      `with recursive units(id) as (
         select $1::uuid union all select s.id from police_stations s join units on s.parent_id = units.id)
       select l.id, l.created_at, l.action, l.alert_id, l.detail,
              o.full_name as officer, st.name as unit, sp.full_name as subject
         from police_audit_log l
         left join police_officers o on o.id = l.officer_id
         left join police_stations st on st.id = l.station_id
         left join profiles sp on sp.id = l.subject_user_id
        where case when $2 = 'officer' then l.officer_id = $3
                   when $2 = 'dispatcher' then l.station_id = $1
                   else l.station_id in (select id from units) end
        order by l.created_at desc
        limit 200`,
      [me.station_id, me.role, me.id],
    );
  }));
});
