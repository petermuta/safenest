import { HIDE_AFTER_REPORTS, requireVisible } from '@/lib/server/community';
import { asUser } from '@/lib/server/db';
import { ApiError, body, handle, ok, uuid } from '@/lib/server/http';
import { requireUser } from '@/lib/server/session';

// POST { reason? } — flags a post as false or abusive. After 3 reports it's hidden until a manager reviews it.
export const POST = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const userId = await requireUser(req);
  const id = uuid((await params).id);
  const { reason } = await body<{ reason?: string }>(req);
  return ok(await asUser(userId, async (tx) => {
    await requireVisible(tx, id);
    const own = await tx.one(`select user_id = auth.uid() as mine from community_alerts where id = $1`, [id]);
    if (own?.mine) throw new ApiError(400, "You can't report your own post");
    await tx.all(
      `insert into community_reports (alert_id, user_id, reason) values ($1, auth.uid(), $2) on conflict do nothing`,
      [id, String(reason ?? '').slice(0, 300) || null],
    );
    const n = (await tx.one(`select count(*)::int as n from community_reports where alert_id = $1`, [id]))!.n;
    return { reports: n, hidden: n >= HIDE_AFTER_REPORTS };
  }));
});
