import 'server-only';
import { asSystem, type Tx } from './db';
import { ApiError } from './http';

export const RADIUS_KM = 1;
export const HIDE_AFTER_REPORTS = 3;
export const CATEGORIES: Record<string, string> = {
  suspicious_person: 'Suspicious person',
  suspicious_vehicle: 'Suspicious vehicle',
  break_in: 'Break-in',
  fire: 'Fire',
  accident: 'Accident',
  noise: 'Disturbance',
  other: 'Other',
};

/** Only people registered to an estate take part in the community feed. */
export async function requireMember(tx: Tx) {
  const row = await tx.one(`select public.has_any_membership() as ok`);
  if (!row?.ok) throw new ApiError(403, 'Community alerts are for registered residents');
}

/** Can the caller see this alert? (members only; removed or heavily reported posts are hidden except to moderators) */
export async function requireVisible(tx: Tx, id: string) {
  const row = await tx.one(
    `select c.status, (select count(*)::int from community_reports r where r.alert_id = c.id) as reports,
            public.can_moderate_community(c.id) as moderator, public.has_any_membership() as member
       from community_alerts c where c.id = $1`,
    [id],
  );
  if (!row || !row.member) throw new ApiError(404, 'Alert not found');
  if (!row.moderator && (row.status === 'removed' || row.reports >= HIDE_AFTER_REPORTS)) throw new ApiError(404, 'Alert not found');
  return row;
}

/** Push to people whose estate is within the radius (best effort, never blocks posting). */
export async function notifyNeighbours(alertId: string) {
  try {
    const rows = await asSystem((tx) =>
      tx.all(
        `select distinct p.expo_push_token as token, c.category, c.message
           from community_alerts c
           join estates e on e.lat is not null and public.distance_km(c.lat, c.lng, e.lat, e.lng) <= $2
           join memberships m on m.estate_id = e.id and m.active
           join profiles p on p.id = m.user_id
          where c.id = $1 and p.expo_push_token is not null and p.id <> c.user_id`,
        [alertId, RADIUS_KM],
      ),
    );
    if (!rows.length) return 0;
    const messages = rows.map((r) => ({
      to: r.token,
      title: `⚠️ ${CATEGORIES[r.category] ?? 'Alert'} nearby`,
      body: String(r.message).slice(0, 140),
      data: { type: 'community', alert_id: alertId },
    }));
    for (let i = 0; i < messages.length; i += 100) {
      await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(messages.slice(i, i + 100)),
      });
    }
    return rows.length;
  } catch (e) {
    console.error('Community push failed', e);
    return 0;
  }
}
