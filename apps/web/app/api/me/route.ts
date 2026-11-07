import { asUser } from '@/lib/server/db';
import { maskNin } from '@/lib/server/identity';
import { ApiError, body, handle, ok } from '@/lib/server/http';
import { requireUser, SESSION_COOKIE } from '@/lib/server/session';
import { maybeRunRetention } from '@/lib/server/retention';
import { deleteEvidence } from '@/lib/server/storage';

// GET → { profile, memberships: [{ id, role, estate, unit }] }
export const GET = handle(async (req: Request) => {
  const userId = await requireUser(req);
  await maybeRunRetention(); // clean up old personal data every few hours
  return ok(await asUser(userId, async (tx) => {
    const profile = await tx.one(`select * from profiles where id = auth.uid()`);
    if (!profile) throw new ApiError(401, 'Please sign in');
    const memberships = await tx.all(
      `select m.id, m.role,
              jsonb_build_object('id', e.id, 'name', e.name, 'lat', e.lat, 'lng', e.lng,
                                 'gate_phone', e.gate_phone, 'subscription_status', e.subscription_status) as estate,
              case when u.id is null then null
                   else jsonb_build_object('id', u.id, 'label', u.label, 'block', u.block) end as unit
         from memberships m
         join estates e on e.id = m.estate_id
         left join units u on u.id = m.unit_id
        where m.user_id = auth.uid() and m.active
        order by m.created_at`,
    );
    const identity = await tx.one(
      `select nin_last4, consent_at, selfie_path is not null as has_selfie from resident_identity where user_id = auth.uid()`,
    );
    const police = await tx.one(
      `select o.id, o.role, o.on_duty, s.name as station_name, s.level as station_level
         from police_officers o join police_stations s on s.id = o.station_id
        where o.user_id = auth.uid() and o.active`,
    );
    return {
      profile,
      memberships,
      identity: {
        has_nin: !!identity?.nin_last4,
        nin_masked: maskNin(identity?.nin_last4),
        has_selfie: !!identity?.has_selfie,
        consented: !!identity?.consent_at,
      },
      police,
    };
  }));
});

// PATCH { full_name?, expo_push_token? }
export const PATCH = handle(async (req: Request) => {
  const userId = await requireUser(req);
  const b = await body<{ full_name?: string | null; expo_push_token?: string | null }>(req);
  return ok(await asUser(userId, (tx) =>
    tx.one(
      `update profiles set
         full_name = case when $1 then nullif(trim($2), '') else full_name end,
         expo_push_token = case when $3 then $4 else expo_push_token end
       where id = auth.uid() returning *`,
      ['full_name' in b, b.full_name ?? '', 'expo_push_token' in b, b.expo_push_token ?? null],
    ),
  ));
});

// DELETE { confirm: 'DELETE' } — a resident deletes their account and personal data:
// NIN, photo, community posts, guest passes, memberships, SOS evidence files.
// SOS records stay (without the person) so police case history and audit remain intact.
// Staff and police must first be removed by their manager or the admin.
export const DELETE = handle(async (req: Request) => {
  const userId = await requireUser(req);
  const { confirm } = await body<{ confirm?: string }>(req);
  if (confirm !== 'DELETE') throw new ApiError(400, 'Confirm by sending confirm: "DELETE"');

  const files = await asUser(userId, async (tx) => {
    const who = await tx.one(
      `select u.phone, p.role = 'super_admin' as admin,
              exists (select 1 from memberships where user_id = u.id and active and role in ('manager', 'guard')) as staff,
              exists (select 1 from police_officers where user_id = u.id and active) as police,
              exists (select 1 from estates where manager_id = u.id) as owns_estate,
              exists (select 1 from sos_alerts where user_id = u.id
                        and (status in ('active', 'acknowledged') or police_status in ('assigned', 'en_route', 'on_scene'))) as open_sos
         from auth.users u join profiles p on p.id = u.id where u.id = auth.uid()`,
    );
    if (!who) throw new ApiError(404, 'Account not found');
    if (who.admin || who.staff || who.police || who.owns_estate) {
      throw new ApiError(400, 'Staff and police accounts must be removed by your estate manager or the SafeNest admin first');
    }
    if (who.open_sos) throw new ApiError(400, 'You have an emergency case that is still open. You can delete your account once it is closed.');

    const keys = (await tx.all(
      `select selfie_path as k from resident_identity where user_id = auth.uid() and selfie_path is not null
       union all select photo_path from community_alerts where user_id = auth.uid() and photo_path is not null
       union all select e.storage_path from sos_evidence e join sos_alerts a on a.id = e.alert_id where a.user_id = auth.uid()`,
    )).map((r) => r.k as string);

    await tx.all(`delete from sos_evidence e using sos_alerts a where a.id = e.alert_id and a.user_id = auth.uid()`);
    await tx.all(`delete from guest_passes where created_by = auth.uid()`);
    await tx.all(`delete from invitations where phone = $1`, [who.phone]);
    await tx.all(`delete from auth.otp_codes where phone = $1`, [who.phone]);
    // Cascades to profile, memberships, identity (NIN + photo), community posts, reactions, reports.
    await tx.all(`delete from auth.users where id = auth.uid()`);
    return keys;
  });

  await deleteEvidence(files);
  const res = ok({ deleted: true });
  res.cookies.delete(SESSION_COOKIE);
  return res;
});
