import { asUser } from '@/lib/server/db';
import { handle, ok } from '@/lib/server/http';
import { currentUserId, SESSION_COOKIE } from '@/lib/server/session';

// POST → clears the cookie and this device's push token
export const POST = handle(async (req: Request) => {
  const userId = await currentUserId(req);
  if (userId && req.headers.get('authorization')) {
    await asUser(userId, (tx) => tx.all(`update profiles set expo_push_token = null where id = auth.uid()`));
  }
  const res = ok({ ok: true });
  res.cookies.delete(SESSION_COOKIE);
  return res;
});
