import { asUser } from '@/lib/server/db';
import { ApiError, body, handle, ok } from '@/lib/server/http';
import { requireUser } from '@/lib/server/session';

// GET → estates the caller manages or guards (super admin: all) as [{ role, estate }]
export const GET = handle(async (req: Request) => {
  const userId = await requireUser(req);
  return ok(await asUser(userId, (tx) =>
    tx.all(
      `select case when public.is_super_admin() then 'manager' else m.role::text end as role, to_jsonb(e) as estate
         from estates e
         left join memberships m on m.estate_id = e.id and m.user_id = auth.uid() and m.active
        where public.is_super_admin() or m.role in ('manager', 'guard')
        order by e.name`,
    ),
  ));
});

// POST { name, district?, address?, lat?, lng? } → new estate; caller becomes its manager
export const POST = handle(async (req: Request) => {
  const userId = await requireUser(req);
  const b = await body<{ name?: string; district?: string; address?: string; lat?: number | null; lng?: number | null }>(req);
  if (!b.name?.trim()) throw new ApiError(400, 'Estate name is required');
  return ok(await asUser(userId, (tx) =>
    tx.one(`select * from create_estate($1, $2, $3, $4, $5)`, [
      b.name, b.district || null, b.address || null, b.lat ?? null, b.lng ?? null,
    ]),
  ), 201);
});
