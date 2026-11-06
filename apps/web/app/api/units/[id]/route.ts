import { asUser } from '@/lib/server/db';
import { ApiError, handle, ok, uuid } from '@/lib/server/http';
import { requireUser } from '@/lib/server/session';

// DELETE → removes a unit (manager of its estate)
export const DELETE = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const userId = await requireUser(req);
  const id = uuid((await params).id);
  await asUser(userId, async (tx) => {
    const unit = await tx.one(`select estate_id from units where id = $1`, [id]);
    if (!unit) throw new ApiError(404, 'Unit not found');
    await tx.assert('is_estate_manager', unit.estate_id, 'Only the estate manager can delete units');
    await tx.all(`delete from units where id = $1`, [id]);
  });
  return ok({ ok: true });
});
