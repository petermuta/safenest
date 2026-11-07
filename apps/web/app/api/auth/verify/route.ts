import { normalizeUgPhone } from '@safenest/shared';
import { ApiError, body, handle, ok } from '@/lib/server/http';
import { verifyCode } from '@/lib/server/otp';
import { pinRequired } from '@/lib/server/pin';
import { sessionCookie, signPinPending, signSession } from '@/lib/server/session';

// POST { phone, code }
//  → { token } + session cookie for residents and guards
//  → { pin: 'setup' | 'enter', pending } for police, managers and the super admin,
//    who finish signing in at /api/auth/pin
export const POST = handle(async (req: Request) => {
  const { phone: raw, code } = await body<{ phone?: string; code?: string }>(req);
  const phone = normalizeUgPhone(raw ?? '');
  if (!phone || !/^\d{6}$/.test(code ?? '')) throw new ApiError(400, 'Enter the 6-digit code');
  const userId = await verifyCode(phone, code!);

  const pin = await pinRequired(userId);
  if (pin !== 'none') return ok({ pin, pending: await signPinPending(userId) });

  const token = await signSession(userId);
  const res = ok({ token });
  res.cookies.set(sessionCookie(token));
  return res;
});
