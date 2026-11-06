import { asUser } from '@/lib/server/db';
import { ApiError, body, handle, ok, uuid } from '@/lib/server/http';
import { requireUser } from '@/lib/server/session';

const STATUSES = ['active', 'acknowledged', 'resolved', 'false_alarm'];

// POST { status } — staff acknowledge/resolve; the resident can cancel as a false alarm
export const POST = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const userId = await requireUser(req);
  const id = uuid((await params).id);
  const { status } = await body<{ status?: string }>(req);
  if (!status || !STATUSES.includes(status)) throw new ApiError(400, 'Unknown status');
  await asUser(userId, (tx) => tx.all(`select update_sos_status($1, $2::sos_status)`, [id, status]));
  return ok({ ok: true });
});
