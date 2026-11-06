import { asUser } from '@/lib/server/db';
import { handle, ok, uuid } from '@/lib/server/http';
import { requireUser } from '@/lib/server/session';

// POST → post escalates to its regional HQ; regional HQ escalates to headquarters
export const POST = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const userId = await requireUser(req);
  const id = uuid((await params).id);
  const level = await asUser(userId, async (tx) => (await tx.one(`select police_escalate($1) as l`, [id]))!.l);
  return ok({ level });
});
