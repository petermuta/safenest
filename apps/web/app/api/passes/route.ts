import { asUser } from '@/lib/server/db';
import { ApiError, body, handle, ok, uuid } from '@/lib/server/http';
import { requireUser } from '@/lib/server/session';

// GET ?unit_id= → passes for a unit (its residents, or estate staff)
export const GET = handle(async (req: Request) => {
  const userId = await requireUser(req);
  const unit = uuid(new URL(req.url).searchParams.get('unit_id'), 'unit');
  return ok(await asUser(userId, async (tx) => {
    const u = await tx.one(`select estate_id, id in (select public.my_unit_ids()) as mine from units where id = $1`, [unit]);
    if (!u) throw new ApiError(404, 'Unit not found');
    if (!u.mine) await tx.assert('is_estate_staff', u.estate_id);
    return tx.all(`select * from guest_passes where unit_id = $1 order by created_at desc limit 50`, [unit]);
  }));
});

// POST { unit_id, guest_name, valid_until, guest_phone?, vehicle_plate?, valid_from? }
export const POST = handle(async (req: Request) => {
  const userId = await requireUser(req);
  const b = await body<{ unit_id?: string; guest_name?: string; valid_until?: string; guest_phone?: string; vehicle_plate?: string; valid_from?: string }>(req);
  if (!b.guest_name?.trim()) throw new ApiError(400, 'Who is visiting?');
  if (!b.valid_until || isNaN(Date.parse(b.valid_until))) throw new ApiError(400, 'Choose how long the pass is valid');
  // create_guest_pass checks the caller lives in the unit (or manages the estate)
  return ok(await asUser(userId, (tx) =>
    tx.one(`select * from create_guest_pass($1, $2, $3, $4, $5, coalesce($6::timestamptz, now()))`, [
      uuid(b.unit_id, 'unit'), b.guest_name, b.valid_until, b.guest_phone || null, b.vehicle_plate || null, b.valid_from || null,
    ]),
  ), 201);
});
