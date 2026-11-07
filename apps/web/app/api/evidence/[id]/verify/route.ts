import { asUser } from '@/lib/server/db';
import { ApiError, handle, ok, uuid } from '@/lib/server/http';
import { requireUser } from '@/lib/server/session';
import { getEvidence, sha256 } from '@/lib/server/storage';

// POST → recomputes the file's SHA-256 and compares it with the fingerprint taken at upload.
export const POST = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const userId = await requireUser(req);
  const id = uuid((await params).id);
  const row = await asUser(userId, async (tx) => {
    const r = await tx.one(`select storage_path, sha256, created_at from sos_evidence where id = $1`, [id]);
    if (!r) throw new ApiError(404, 'Not found');
    await tx.assert('can_view_evidence', r.storage_path);
    return r;
  });
  if (!row.sha256) return ok({ status: 'no_fingerprint', message: 'Uploaded before fingerprints were recorded' });
  const file = await getEvidence(row.storage_path);
  if (!file) return ok({ status: 'missing' });
  const now = sha256(file.data);
  return ok({ status: now === row.sha256 ? 'intact' : 'changed', recorded: row.sha256, computed: now, uploaded_at: row.created_at });
});
