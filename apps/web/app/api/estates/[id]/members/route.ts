import { normalizeUgPhone } from '@safenest/shared';
import { asUser } from '@/lib/server/db';
import { ApiError, body, handle, ok, uuid } from '@/lib/server/http';
import { requireUser } from '@/lib/server/session';

// POST { phone, full_name, role: 'resident'|'guard', unit_id? } → added now, or invited until they sign in
export const POST = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const userId = await requireUser(req);
  const id = uuid((await params).id);
  const b = await body<{ phone?: string; full_name?: string; role?: string; unit_id?: string | null }>(req);
  const phone = normalizeUgPhone(b.phone ?? '');
  if (!phone) throw new ApiError(400, 'Enter a valid Ugandan mobile number');
  if (b.role !== 'resident' && b.role !== 'guard') throw new ApiError(400, 'Role must be resident or guard');
  const unit = b.unit_id ? uuid(b.unit_id, 'unit') : null;
  // invite_member checks that the caller manages this estate and the unit belongs to it
  return ok(await asUser(userId, async (tx) =>
    (await tx.one(`select invite_member($1, $2, $3, $4, $5) as r`, [id, phone, b.full_name ?? '', b.role, unit]))!.r,
  ), 201);
});
