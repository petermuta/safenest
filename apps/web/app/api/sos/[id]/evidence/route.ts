import { asUser } from '@/lib/server/db';
import { ApiError, handle, ok, uuid } from '@/lib/server/http';
import { requireUser } from '@/lib/server/session';
import { putEvidence } from '@/lib/server/storage';

// Netlify functions accept request bodies up to about 6 MB.
const MAX_BYTES = 5.5 * 1024 * 1024;
const TYPES: Record<string, Record<string, string>> = {
  photo: { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/heic': 'heic' },
  video: { 'video/mp4': 'mp4', 'video/quicktime': 'mov' },
  audio: { 'audio/m4a': 'm4a', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/aac': 'aac' },
};

// POST multipart { kind: photo|video|audio, file } — only the person who raised the alert, within 6 hours
export const POST = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const userId = await requireUser(req);
  const alertId = uuid((await params).id);
  const form = await req.formData().catch(() => null);
  const kind = String(form?.get('kind') ?? '');
  const file = form?.get('file');
  if (!TYPES[kind]) throw new ApiError(400, 'kind must be photo, video or audio');
  if (!(file instanceof Blob) || file.size === 0) throw new ApiError(400, 'No file received');
  if (file.size > MAX_BYTES) throw new ApiError(413, 'File too large — keep videos under 15 seconds');
  const ext = TYPES[kind][file.type] ?? (kind === 'photo' ? 'jpg' : kind === 'video' ? 'mp4' : 'm4a');
  const contentType = TYPES[kind][file.type] ? file.type : kind === 'photo' ? 'image/jpeg' : kind === 'video' ? 'video/mp4' : 'audio/m4a';
  const key = `${alertId}/${kind}-${Date.now()}.${ext}`;

  await asUser(userId, (tx) => tx.assert('can_upload_evidence', key, 'You can only add evidence to your own alert'));
  await putEvidence(key, await file.arrayBuffer(), contentType);
  const row = await asUser(userId, async (tx) => {
    await tx.assert('can_upload_evidence', key, 'You can only add evidence to your own alert');
    return tx.one(`insert into sos_evidence (alert_id, kind, storage_path) values ($1, $2, $3) returning *`, [alertId, kind, key]);
  });
  return ok(row, 201);
});
