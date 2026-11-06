import { normalizeUgPhone } from '@safenest/shared';
import { ApiError, body, handle, ok } from '@/lib/server/http';
import { verifyCode } from '@/lib/server/otp';
import { sessionCookie, signSession } from '@/lib/server/session';

// POST { phone, code } → { token } and a session cookie (web)
export const POST = handle(async (req: Request) => {
  const { phone: raw, code } = await body<{ phone?: string; code?: string }>(req);
  const phone = normalizeUgPhone(raw ?? '');
  if (!phone || !/^\d{6}$/.test(code ?? '')) throw new ApiError(400, 'Enter the 6-digit code');
  const userId = await verifyCode(phone, code!);
  const token = await signSession(userId);
  const res = ok({ token });
  res.cookies.set(sessionCookie(token));
  return res;
});
