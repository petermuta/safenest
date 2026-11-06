import { requireVisible } from '@/lib/server/community';
import { asUser } from '@/lib/server/db';
import { ApiError, body, handle, ok, uuid } from '@/lib/server/http';
import { requireUser } from '@/lib/server/session';

// POST { kind: 'see_it_too' | 'all_clear' | null } — one reaction per person; null clears it
export const POST = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const userId = await requireUser(req);
  const id = uuid((await params).id);
  const { kind } = await body<{ kind?: string | null }>(req);
  if (kind != null && kind !== 'see_it_too' && kind !== 'all_clear') throw new ApiError(400, 'Unknown reaction');
  await asUser(userId, async (tx) => {
    await requireVisible(tx, id);
    if (kind == null) await tx.all(`delete from community_reactions where alert_id = $1 and user_id = auth.uid()`, [id]);
    else await tx.all(
      `insert into community_reactions (alert_id, user_id, kind) values ($1, auth.uid(), $2)
       on conflict (alert_id, user_id) do update set kind = excluded.kind, created_at = now()`,
      [id, kind],
    );
  });
  return ok({ ok: true });
});
