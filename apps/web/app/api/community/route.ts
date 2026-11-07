import { CATEGORIES, HIDE_AFTER_REPORTS, notifyNeighbours, RADIUS_KM, requireMember } from '@/lib/server/community';
import { asUser } from '@/lib/server/db';
import { ApiError, handle, ok } from '@/lib/server/http';
import { requireUser } from '@/lib/server/session';
import { putEvidence } from '@/lib/server/storage';

const point = (lat: unknown, lng: unknown) => {
  const a = Number(lat), b = Number(lng);
  return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a) <= 90 && Math.abs(b) <= 180 ? { lat: a, lng: b } : null;
};

// GET ?lat=&lng= → community alerts within 1 km of you (or of your estate) from the last 3 days.
// Police never see this feed; an alert reaches them only when a resident taps "Send to police".
export const GET = handle(async (req: Request) => {
  const userId = await requireUser(req);
  const q = new URL(req.url).searchParams;
  const here = point(q.get('lat'), q.get('lng'));
  return ok(await asUser(userId, async (tx) => {
    await requireMember(tx);
    const origin = here ?? (await tx.one(
      `select e.lat, e.lng from memberships m join estates e on e.id = m.estate_id
        where m.user_id = auth.uid() and m.active and e.lat is not null order by m.created_at limit 1`,
    ));
    if (!origin) return { origin: null, alerts: [] };
    const alerts = await tx.all(
      // Privacy: neighbours get an approximate spot (~150 m grid) so a post never reveals
      // the poster's home, and no names, so the poster can't be targeted. The exact point is
      // kept and goes to police only if someone taps "Send to police".
      `select c.id, c.category, c.message, c.status, c.created_at,
              (round(c.lat::numeric * 750) / 750)::float as lat, (round(c.lng::numeric * 750) / 750)::float as lng,
              c.photo_path is not null as has_photo, c.sos_alert_id is not null as sent_to_police,
              c.user_id = auth.uid() as mine,
              'A neighbour' as author,
              e.name as estate_name,
              greatest(0.1, round(public.distance_km($1, $2, c.lat, c.lng)::numeric, 1))::float as distance_km,
              (select count(*)::int from community_reactions r where r.alert_id = c.id and r.kind = 'see_it_too') as see_it_too,
              (select count(*)::int from community_reactions r where r.alert_id = c.id and r.kind = 'all_clear') as all_clear,
              (select kind from community_reactions r where r.alert_id = c.id and r.user_id = auth.uid()) as my_reaction,
              exists (select 1 from community_reports r where r.alert_id = c.id and r.user_id = auth.uid()) as i_reported,
              (select count(*)::int from community_reports r where r.alert_id = c.id) as reports,
              public.can_moderate_community(c.id) as can_moderate
         from community_alerts c
         left join estates e on e.id = c.estate_id
        where c.created_at > now() - interval '3 days'
          and public.distance_km($1, $2, c.lat, c.lng) <= $3
          and (public.can_moderate_community(c.id)
               or (c.status <> 'removed'
                   and (select count(*) from community_reports r where r.alert_id = c.id) < $4))
        order by c.created_at desc
        limit 100`,
      [origin.lat, origin.lng, RADIUS_KM, HIDE_AFTER_REPORTS],
    );
    return { origin, radius_km: RADIUS_KM, alerts };
  }));
});

// POST multipart { category, message, lat, lng, photo? } → posts to neighbours within 1 km
export const POST = handle(async (req: Request) => {
  const userId = await requireUser(req);
  const form = await req.formData().catch(() => null);
  if (!form) throw new ApiError(400, 'Send the alert as a form');
  const category = String(form.get('category') ?? '');
  const message = String(form.get('message') ?? '').trim();
  const where = point(form.get('lat'), form.get('lng'));
  const photo = form.get('photo');
  if (!CATEGORIES[category]) throw new ApiError(400, 'Choose what kind of alert this is');
  if (message.length < 3 || message.length > 500) throw new ApiError(400, 'Describe what is happening (3–500 characters)');
  if (!where) throw new ApiError(400, 'Location is missing');
  if (photo instanceof Blob && photo.size > 5 * 1024 * 1024) throw new ApiError(413, 'Photo too large');

  const alert = await asUser(userId, async (tx) => {
    await requireMember(tx);
    const recent = await tx.one(
      `select count(*)::int as n from community_alerts where user_id = auth.uid() and created_at > now() - interval '1 hour'`,
    );
    if ((recent?.n ?? 0) >= 5) throw new ApiError(429, 'You have posted a lot in the last hour. Please wait before posting again.');
    return tx.one(
      `insert into community_alerts (user_id, estate_id, category, message, lat, lng)
       values (auth.uid(),
               (select estate_id from memberships where user_id = auth.uid() and active order by (role = 'resident') desc, created_at limit 1),
               $1, $2, $3, $4)
       returning id`,
      [category, message, where.lat, where.lng],
    );
  });

  if (photo instanceof Blob && photo.size > 0) {
    const key = `community/${alert!.id}/photo-${Date.now()}.jpg`;
    await putEvidence(key, await photo.arrayBuffer(), photo.type || 'image/jpeg');
    await asUser(userId, (tx) => tx.all(`update community_alerts set photo_path = $2 where id = $1 and user_id = auth.uid()`, [alert!.id, key]));
  }
  const notified = await notifyNeighbours(alert!.id);
  return ok({ id: alert!.id, notified }, 201);
});
