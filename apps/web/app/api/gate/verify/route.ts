import { asUser } from '@/lib/server/db';
import { ApiError, body, handle, ok, uuid } from '@/lib/server/http';
import { requireUser } from '@/lib/server/session';

// POST { estate_id, input } — input is the 6-digit code or the QR token. Guards only.
export const POST = handle(async (req: Request) => {
  const userId = await requireUser(req);
  const b = await body<{ estate_id?: string; input?: string }>(req);
  const input = String(b.input ?? '').trim();
  if (!input || input.length > 64) throw new ApiError(400, 'Scan a pass or type its code');
  return ok(await asUser(userId, async (tx) =>
    (await tx.one(`select verify_guest_pass($1, $2) as r`, [uuid(b.estate_id, 'estate'), input]))!.r,
  ));
});
