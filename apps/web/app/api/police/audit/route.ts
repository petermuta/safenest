import { asUser } from '@/lib/server/db';
import { handle, ok } from '@/lib/server/http';
import { requireOfficer } from '@/lib/server/police';
import { requireUser } from '@/lib/server/session';

// GET → { entries, unusual }. Officers see their own actions; dispatchers their post;
// commanders their unit and every unit under it. "unusual" lists officers in that scope
// with a high number of NIN searches, NIN reveals or blocked searches in the last 24 hours.
export const GET = handle(async (req: Request) => {
  const userId = await requireUser(req);
  const alertAt = Number(process.env.NIN_SEARCH_ALERT_AT ?? 10);
  return ok(await asUser(userId, async (tx) => {
    const me = await requireOfficer(tx);
    const scope = `with recursive units(id) as (
         select $1::uuid union all select s.id from police_stations s join units on s.parent_id = units.id)`;
    const where = `case when $2 = 'officer' then l.officer_id = $3
                        when $2 = 'dispatcher' then l.station_id = $1
                        else l.station_id in (select id from units) end`;
    const entries = await tx.all(
      `${scope}
       select l.id, l.created_at, l.action, l.alert_id, l.detail,
              o.full_name as officer, st.name as unit, sp.full_name as subject
         from police_audit_log l
         left join police_officers o on o.id = l.officer_id
         left join police_stations st on st.id = l.station_id
         left join profiles sp on sp.id = l.subject_user_id
        where ${where}
        order by l.created_at desc
        limit 200`,
      [me.station_id, me.role, me.id],
    );
    const unusual = me.role === 'officer' ? [] : await tx.all(
      `${scope}
       select o.full_name as officer, st.name as unit,
              count(*) filter (where l.action = 'nin_search')::int as searches,
              count(*) filter (where l.action = 'reveal_nin')::int as reveals,
              count(*) filter (where l.action = 'nin_search_blocked')::int as blocked
         from police_audit_log l
         join police_officers o on o.id = l.officer_id
         left join police_stations st on st.id = l.station_id
        where ${where} and l.created_at > now() - interval '24 hours'
          and l.action in ('nin_search', 'reveal_nin', 'nin_search_blocked')
        group by o.full_name, st.name
       having count(*) filter (where l.action in ('nin_search', 'reveal_nin')) >= $4
           or count(*) filter (where l.action = 'nin_search_blocked') > 0
        order by 3 desc`,
      [me.station_id, me.role, me.id, alertAt],
    );
    return { entries, unusual };
  }));
});
