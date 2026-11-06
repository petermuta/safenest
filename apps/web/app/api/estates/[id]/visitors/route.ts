import { asUser } from '@/lib/server/db';
import { ApiError, body, handle, ok, uuid } from '@/lib/server/http';
import { requireUser } from '@/lib/server/session';

type Ctx = { params: Promise<{ id: string }> };

// GET ?days=1 → visitor log (staff see the estate; residents see their own unit's visitors)
export const GET = handle(async (req: Request, { params }: Ctx) => {
  const userId = await requireUser(req);
  const id = uuid((await params).id);
  const days = Math.min(Math.max(Number(new URL(req.url).searchParams.get('days') ?? 1) || 1, 1), 90);
  return ok(await asUser(userId, async (tx) => {
    await tx.assert('is_estate_member', id);
    return tx.all(
      `select v.*,
              case when u.id is null then null else jsonb_build_object('label', u.label) end as unit,
              jsonb_build_object('full_name', g.full_name) as guard
         from visitor_logs v
         left join units u on u.id = v.unit_id
         left join profiles g on g.id = v.guard_id
        where v.estate_id = $1
          and v.entry_at > now() - make_interval(days => $2)
          and (public.is_estate_staff($1) or v.unit_id in (select public.my_unit_ids()))
        order by v.entry_at desc
        limit 500`,
      [id, days],
    );
  }));
});

// POST { guest_name, unit_id?, guest_phone?, vehicle_plate?, notes? } → logs a walk-in (guards)
export const POST = handle(async (req: Request, { params }: Ctx) => {
  const userId = await requireUser(req);
  const id = uuid((await params).id);
  const b = await body<{ guest_name?: string; unit_id?: string | null; guest_phone?: string; vehicle_plate?: string; notes?: string }>(req);
  if (!b.guest_name?.trim()) throw new ApiError(400, "Enter the visitor's name");
  return ok(await asUser(userId, (tx) =>
    tx.one(`select * from log_walk_in($1, $2, $3, $4, $5, $6)`, [
      id, b.guest_name, b.unit_id ? uuid(b.unit_id, 'unit') : null, b.guest_phone || null, b.vehicle_plate || null, b.notes || null,
    ]),
  ), 201);
});
