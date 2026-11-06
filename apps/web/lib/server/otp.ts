import 'server-only';
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { asSystem } from './db';
import { ApiError } from './http';
import { sendSms } from './sms';

const CODE_TTL_MIN = 10;
const MAX_SENDS_PER_10_MIN = 3;
const MAX_ATTEMPTS = 5;

const hash = (phone: string, code: string) =>
  createHmac('sha256', process.env.SESSION_SECRET ?? '').update(`${phone}:${code}`).digest('hex');

/**
 * Test numbers get a fixed code and no SMS — only when ALLOW_TEST_OTP=true.
 * Never enable that on the live site.
 */
function testCode(phone: string): string | null {
  if (process.env.ALLOW_TEST_OTP !== 'true') return null;
  const list = (process.env.TEST_OTP_NUMBERS ?? '').split(',').map((s) => s.trim());
  return list.includes(phone) ? '123456' : null;
}

export async function sendCode(phone: string) {
  const fixed = testCode(phone);
  const code = fixed ?? String(randomInt(0, 1_000_000)).padStart(6, '0');

  await asSystem(async (tx) => {
    const recent = await tx.one<{ n: number }>(
      `select count(*)::int as n from auth.otp_codes where phone = $1 and created_at > now() - interval '10 minutes'`,
      [phone],
    );
    if ((recent?.n ?? 0) >= MAX_SENDS_PER_10_MIN) throw new ApiError(429, 'Too many codes requested. Wait 10 minutes and try again.');
    await tx.all(
      `insert into auth.otp_codes (phone, code_hash, expires_at) values ($1, $2, now() + make_interval(mins => $3))`,
      [phone, hash(phone, code), CODE_TTL_MIN],
    );
  });

  if (fixed) return;
  const [result] = await sendSms([phone], `${code} is your SafeNest code. It expires in ${CODE_TTL_MIN} minutes. Never share it with anyone.`);
  if (!result?.ok) throw new ApiError(502, 'Could not send the code. Please try again.');
}

/** Checks the code and returns the user id, creating the account on first sign-in. */
export async function verifyCode(phone: string, code: string): Promise<string> {
  return asSystem(async (tx) => {
    const row = await tx.one(
      `select id, code_hash, attempts from auth.otp_codes
        where phone = $1 and used_at is null and expires_at > now()
        order by created_at desc limit 1 for update`,
      [phone],
    );
    if (!row) throw new ApiError(400, 'That code has expired. Request a new one.');
    if (row.attempts >= MAX_ATTEMPTS) throw new ApiError(429, 'Too many wrong tries. Request a new code.');

    const expected = Buffer.from(row.code_hash, 'hex');
    const given = Buffer.from(hash(phone, code), 'hex');
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
      await tx.all(`update auth.otp_codes set attempts = attempts + 1 where id = $1`, [row.id]);
      // Commit the attempt count, then report the failure.
      return '';
    }
    await tx.all(`update auth.otp_codes set used_at = now() where id = $1`, [row.id]);

    const user = await tx.one<{ id: string }>(
      `insert into auth.users (phone, last_sign_in_at) values ($1, now())
       on conflict (phone) do update set last_sign_in_at = now()
       returning id`,
      [phone],
    );
    // Super admins come from configuration, so nobody needs database access to set one.
    const admins = (process.env.SUPER_ADMIN_PHONES ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    if (admins.includes(phone)) await tx.all(`update profiles set role = 'super_admin' where id = $1`, [user!.id]);
    return user!.id;
  }).then((id) => {
    if (!id) throw new ApiError(400, 'That code is not right. Check the SMS and try again.');
    return id;
  });
}
