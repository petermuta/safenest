import { asUser } from '@/lib/server/db';
import { ApiError, handle, uuid } from '@/lib/server/http';
import { currentUserId, verifyEvidenceLink } from '@/lib/server/session';
import { getEvidence } from '@/lib/server/storage';

// GET → the evidence file. Signed-in dashboard (cookie), app (Bearer), or a 10-minute link (?t=).
export const GET = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const id = uuid((await params).id);
  const t = new URL(req.url).searchParams.get('t');
  const userId = t ? await verifyEvidenceLink(t, id) : await currentUserId(req);
  if (!userId) throw new ApiError(401, 'Please sign in');

  const path = await asUser(userId, async (tx) => {
    const row = await tx.one(`select storage_path from sos_evidence where id = $1`, [id]);
    if (!row) throw new ApiError(404, 'Not found');
    await tx.assert('can_view_evidence', row.storage_path);
    return row.storage_path as string;
  });

  const file = await getEvidence(path);
  if (!file) throw new ApiError(404, 'File not found');
  return new Response(file.data, {
    headers: {
      'Content-Type': file.contentType,
      'Cache-Control': 'private, no-store',
      'Content-Disposition': `inline; filename="${path.split('/').pop()}"`,
    },
  });
});
