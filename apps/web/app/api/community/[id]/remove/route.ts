import { asUser } from '@/lib/server/db';
import { ApiError, body, handle, ok, uuid } from '@/lib/server/http';
import { requireUser } from '@/lib/server/session';

// POST { status: 'removed' | 'open' | 'resolved' } — the author can mark their own post resolved;
// managers of nearby estates (and the super admin) can remove or restore posts.
export const POST = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const userId = await requireUser(req);
  const id = uuid((await params).id);
  const { status } = await body<{ status?: string }>(req);
  if (!['removed', 'open', 'resolved'].includes(status ?? '')) throw new ApiError(400, 'Unknown status');
  await asUser(userId, async (tx) => {
    const row = await tx.one(
      `select user_id = auth.uid() as mine, public.can_moderate_community(id) as moderator from community_alerts where id = $1`,
      [id],
    );
    if (!row) throw new ApiError(404, 'Alert not found');
    const allowed = row.moderator || (row.mine && status === 'resolved');
    if (!allowed) throw new ApiError(403, 'Only estate managers can remove posts');
    await tx.all(
      `update community_alerts set status = $2, removed_by = case when $2 = 'removed' then auth.uid() else null end where id = $1`,
      [id, status],
    );
    if (status === 'open' && row.moderator) await tx.all(`delete from community_reports where alert_id = $1`, [id]);
  });
  return ok({ ok: true });
});
