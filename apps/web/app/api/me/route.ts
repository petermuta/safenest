import { asUser } from '@/lib/server/db';
import { ApiError, body, handle, ok } from '@/lib/server/http';
import { requireUser } from '@/lib/server/session';

// GET → { profile, memberships: [{ id, role, estate, unit }] }
export const GET = handle(async (req: Request) => {
  const userId = await requireUser(req);
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
    return { profile, memberships };
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
