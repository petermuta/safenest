import { asUser } from '@/lib/server/db';
import { ApiError, body, handle, ok, uuid } from '@/lib/server/http';
import { requireUser } from '@/lib/server/session';

// POST { status: en_route | on_scene | closed } — the assigned officer (or dispatcher) reports progress
export const POST = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const userId = await requireUser(req);
  const id = uuid((await params).id);
  const { status } = await body<{ status?: string }>(req);
  if (!['en_route', 'on_scene', 'closed'].includes(status ?? '')) throw new ApiError(400, 'Unknown status');
  await asUser(userId, (tx) => tx.all(`select police_set_status($1, $2)`, [id, status]));
  return ok({ ok: true });
});
