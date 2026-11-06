import { normalizeUgPhone } from '@safenest/shared';
import { asUser } from '@/lib/server/db';
import { ApiError, body, handle, ok, uuid } from '@/lib/server/http';
import { requireUser } from '@/lib/server/session';

type Ctx = { params: Promise<{ id: string }> };

// GET → { estate, units, members?, invites? } (members/invites for the manager only)
export const GET = handle(async (req: Request, { params }: Ctx) => {
  const userId = await requireUser(req);
  const id = uuid((await params).id);
  return ok(await asUser(userId, async (tx) => {
    await tx.assert('is_estate_member', id);
    const estate = await tx.one(`select * from estates where id = $1`, [id]);
    const units = await tx.all(`select * from units where estate_id = $1 order by label`, [id]);
    const manager = (await tx.one(`select public.is_estate_manager($1) as m`, [id]))?.m;
    if (!manager) return { estate, units };
    const members = await tx.all(
      `select m.id, m.role, m.unit_id,
              jsonb_build_object('full_name', p.full_name, 'phone', p.phone) as profile,
              case when ri.nin_last4 is null then null else '••••••••••' || ri.nin_last4 end as nin_masked,
              coalesce(ri.selfie_path is not null, false) as has_selfie
         from memberships m join profiles p on p.id = m.user_id
         left join resident_identity ri on ri.user_id = m.user_id
        where m.estate_id = $1 and m.active order by m.created_at`,
      [id],
    );
    const invites = await tx.all(
      `select * from invitations where estate_id = $1 and accepted_at is null order by created_at desc`,
      [id],
    );
    return { estate, units, members, invites };
  }));
});

// PATCH { name?, gate_phone?, district?, address?, lat?, lng? } — manager only
export const PATCH = handle(async (req: Request, { params }: Ctx) => {
  const userId = await requireUser(req);
  const id = uuid((await params).id);
  const b = await body<{ name?: string; gate_phone?: string | null; district?: string | null; address?: string | null; lat?: number | null; lng?: number | null }>(req);
  let gate: string | null | undefined = undefined;
  if ('gate_phone' in b) {
    gate = b.gate_phone?.trim() ? normalizeUgPhone(b.gate_phone) : null;
    if (b.gate_phone?.trim() && !gate) throw new ApiError(400, 'Gate phone must be a Ugandan mobile number');
  }
  if ('name' in b && !b.name?.trim()) throw new ApiError(400, 'Estate name is required');
  return ok(await asUser(userId, async (tx) => {
    await tx.assert('is_estate_manager', id, 'Only the estate manager can change this');
    return tx.one(
      `update estates set
         name = coalesce($2, name),
         gate_phone = case when $3 then $4 else gate_phone end,
         district = case when $5 then $6 else district end,
         address = case when $7 then $8 else address end,
         lat = case when $9 then $10 else lat end,
         lng = case when $11 then $12 else lng end
       where id = $1 returning *`,
      [id, b.name?.trim() || null, gate !== undefined, gate ?? null,
       'district' in b, b.district || null, 'address' in b, b.address || null,
       'lat' in b, b.lat ?? null, 'lng' in b, b.lng ?? null],
    );
  }));
});
