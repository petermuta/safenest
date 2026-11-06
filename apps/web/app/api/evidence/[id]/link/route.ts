import { asUser } from '@/lib/server/db';
import { ApiError, handle, ok, uuid } from '@/lib/server/http';
import { requireUser, signEvidenceLink } from '@/lib/server/session';

// POST → { url } that opens this file for 10 minutes (for the app's media player / browser)
export const POST = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const userId = await requireUser(req);
  const id = uuid((await params).id);
  await asUser(userId, async (tx) => {
    const row = await tx.one(`select storage_path from sos_evidence where id = $1`, [id]);
    if (!row) throw new ApiError(404, 'Not found');
    await tx.assert('can_view_evidence', row.storage_path);
  });
  return ok({ url: `/api/evidence/${id}?t=${await signEvidenceLink(userId, id)}` });
});
