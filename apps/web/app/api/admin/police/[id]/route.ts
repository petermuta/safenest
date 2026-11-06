import { asUser } from '@/lib/server/db';
import { body, handle, ok, uuid } from '@/lib/server/http';
import { requireUser } from '@/lib/server/session';
import { requireAdmin } from '@/lib/server/admin';

// PATCH { active } — turn a station on or off (super admin)
export const PATCH = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const userId = await requireUser(req);
  const id = uuid((await params).id);
  const { active } = await body<{ active?: boolean }>(req);
  return ok(await asUser(userId, async (tx) => {
    await requireAdmin(tx);
    return tx.one(`update police_stations set active = $2 where id = $1 returning *`, [id, !!active]);
  }));
});
