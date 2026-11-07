import { ApiError, body, handle, ok } from '@/lib/server/http';
import { pinRequired, setPin, verifyPin } from '@/lib/server/pin';
import { sessionCookie, signSession, verifyPinPending } from '@/lib/server/session';

// POST { pending, pin } — second sign-in step. First time: sets the PIN. After that: checks it.
// 5 wrong PINs lock the account for 30 minutes.
export const POST = handle(async (req: Request) => {
  const b = await body<{ pending?: string; pin?: string }>(req);
  const userId = b.pending ? await verifyPinPending(b.pending) : null;
  if (!userId) throw new ApiError(401, 'Your sign-in expired. Request a new code.');
  const pin = String(b.pin ?? '');

  const state = await pinRequired(userId);
  if (state === 'setup') await setPin(userId, pin);
  else if (state === 'enter') await verifyPin(userId, pin);

  const token = await signSession(userId);
  const res = ok({ token });
  res.cookies.set(sessionCookie(token));
  return res;
});
