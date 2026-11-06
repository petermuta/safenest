import { asUser } from '@/lib/server/db';
import { ApiError, handle, ok, uuid } from '@/lib/server/http';
import { requireUser } from '@/lib/server/session';

// DELETE → removes a resident or guard from the estate (manager only; managers can't be removed here)
export const DELETE = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const userId = await requireUser(req);
  const id = uuid((await params).id);
  await asUser(userId, async (tx) => {
    const m = await tx.one(`select estate_id, role from memberships where id = $1`, [id]);
    if (!m) throw new ApiError(404, 'Member not found');
    await tx.assert('is_estate_manager', m.estate_id, 'Only the estate manager can remove people');
    if (m.role === 'manager') throw new ApiError(400, 'Managers can only be changed by the SafeNest admin');
    await tx.all(`delete from memberships where id = $1`, [id]);
  });
  return ok({ ok: true });
});
