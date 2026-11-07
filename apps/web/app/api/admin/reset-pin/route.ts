import { normalizeUgPhone } from '@safenest/shared';
import { requireAdmin } from '@/lib/server/admin';
import { asUser } from '@/lib/server/db';
import { ApiError, body, handle, ok } from '@/lib/server/http';
import { requireUser } from '@/lib/server/session';

// POST { phone } — clears someone's PIN so they set a new one at their next sign-in (super admin).
// Only do this after confirming the person's identity another way (in person or by a call you made).
export const POST = handle(async (req: Request) => {
  const userId = await requireUser(req);
  const { phone: raw } = await body<{ phone?: string }>(req);
  const phone = normalizeUgPhone(raw ?? '');
  if (!phone) throw new ApiError(400, 'Enter a valid Ugandan mobile number');
  return ok(await asUser(userId, async (tx) => {
    await requireAdmin(tx);
    const row = await tx.one(
      `update auth.users set pin_hash = null, pin_attempts = 0, pin_locked_until = null where phone = $1 returning id`,
      [phone],
    );
    if (!row) throw new ApiError(404, 'No SafeNest account with that number');
    await tx.all(`select public.police_log('reset_pin', null, $1, null)`, [row.id]);
    return { ok: true };
  }));
});
