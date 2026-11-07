import { normalizeUgPhone } from '@safenest/shared';
import { ApiError, body, handle, ok } from '@/lib/server/http';
import { clientIp, sendCode } from '@/lib/server/otp';

// POST { phone } → texts a 6-digit code
export const POST = handle(async (req: Request) => {
  const { phone: raw } = await body<{ phone?: string }>(req);
  const phone = normalizeUgPhone(raw ?? '');
  if (!phone) throw new ApiError(400, 'Enter a Ugandan mobile number, e.g. 0772 123 456');
  await sendCode(phone, clientIp(req));
  return ok({ phone });
});
