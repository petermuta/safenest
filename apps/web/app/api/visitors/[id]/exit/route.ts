import { asUser } from '@/lib/server/db';
import { handle, ok, uuid } from '@/lib/server/http';
import { requireUser } from '@/lib/server/session';

// POST → checks a visitor out (guards)
export const POST = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const userId = await requireUser(req);
  const id = uuid((await params).id);
  await asUser(userId, (tx) => tx.all(`select mark_exit($1)`, [id]));
  return ok({ ok: true });
});
