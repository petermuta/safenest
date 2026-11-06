import { asUser } from '@/lib/server/db';
import { ApiError, handle, ok, uuid } from '@/lib/server/http';
import { requireUser } from '@/lib/server/session';

// DELETE → cancels an invitation that hasn't been used yet (manager only)
export const DELETE = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const userId = await requireUser(req);
  const id = uuid((await params).id);
  await asUser(userId, async (tx) => {
    const inv = await tx.one(`select estate_id from invitations where id = $1`, [id]);
    if (!inv) throw new ApiError(404, 'Invitation not found');
    await tx.assert('is_estate_manager', inv.estate_id, 'Only the estate manager can cancel invitations');
    await tx.all(`delete from invitations where id = $1`, [id]);
  });
  return ok({ ok: true });
});
