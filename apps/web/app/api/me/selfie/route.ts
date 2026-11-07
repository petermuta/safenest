import { asUser } from '@/lib/server/db';
import { ApiError, handle, ok } from '@/lib/server/http';
import { requireUser } from '@/lib/server/session';
import { deleteEvidence, putEvidence } from '@/lib/server/storage';

const MAX_BYTES = 5 * 1024 * 1024;

// POST multipart { photo } — the live selfie taken with the front camera during onboarding.
export const POST = handle(async (req: Request) => {
  const userId = await requireUser(req);
  const form = await req.formData().catch(() => null);
  const file = form?.get('photo');
  if (!(file instanceof Blob) || file.size === 0) throw new ApiError(400, 'No photo received');
  if (file.size > MAX_BYTES) throw new ApiError(413, 'Photo too large');
  if (!['image/jpeg', 'image/png', 'image/heic', ''].includes(file.type)) throw new ApiError(400, 'Photo must be JPEG or PNG');

  const key = `identity/${userId}/selfie-${Date.now()}.jpg`;
  await putEvidence(key, await file.arrayBuffer(), file.type || 'image/jpeg');
  const previous = await asUser(userId, async (tx) => {
    const old = await tx.one(`select selfie_path from resident_identity where user_id = auth.uid()`);
    await tx.all(
      `insert into resident_identity (user_id, selfie_path, selfie_at, updated_at) values (auth.uid(), $1, now(), now())
       on conflict (user_id) do update set selfie_path = excluded.selfie_path, selfie_at = now(), updated_at = now()`,
      [key],
    );
    return old?.selfie_path as string | undefined;
  });
  if (previous) await deleteEvidence([previous]); // don't keep old photos of people
  return ok({ ok: true }, 201);
});
