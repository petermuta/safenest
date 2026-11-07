import 'server-only';
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { asSystem } from './db';
import { ApiError } from './http';

const scryptAsync = promisify(scrypt) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;
const MAX_TRIES = 5;
const LOCK_MINUTES = 30;

// Obvious PINs a thief would try first.
const WEAK = new Set(['0000', '1111', '2222', '3333', '4444', '5555', '6666', '7777', '8888', '9999',
  '1234', '4321', '1212', '2580', '0852', '1122', '1004', '2000', '2026', '123456', '654321', '111111', '000000', '121212']);

export function checkNewPin(pin: string) {
  if (!/^\d{4,6}$/.test(pin)) throw new ApiError(400, 'Choose a PIN of 4 to 6 digits');
  if (WEAK.has(pin) || /^(\d)\1+$/.test(pin)) throw new ApiError(400, 'That PIN is too easy to guess. Choose another.');
}

async function hashPin(pin: string) {
  const salt = randomBytes(16);
  const key = await scryptAsync(pin, salt, 32);
  return `s1.${salt.toString('base64url')}.${key.toString('base64url')}`;
}

async function matches(pin: string, stored: string) {
  const [v, salt, key] = stored.split('.');
  if (v !== 's1') return false;
  const want = Buffer.from(key, 'base64url');
  const got = await scryptAsync(pin, Buffer.from(salt, 'base64url'), want.length);
  return timingSafeEqual(want, got);
}

/** Does this account need a PIN? Super admin, active police officers and estate managers do. */
export async function pinRequired(userId: string): Promise<'none' | 'setup' | 'enter'> {
  return asSystem(async (tx) => {
    const row = await tx.one(
      `select u.pin_hash is not null as has_pin, u.phone,
              (p.role = 'super_admin'
                or exists (select 1 from police_officers o where o.user_id = u.id and o.active)
                or exists (select 1 from memberships m where m.user_id = u.id and m.active and m.role = 'manager')) as needs
         from auth.users u join profiles p on p.id = u.id where u.id = $1`,
      [userId],
    );
    if (!row?.needs) return 'none';
    // Emergency reset (e.g. the super admin forgot their PIN): list the phone in PIN_RESET_PHONES.
    const resets = (process.env.PIN_RESET_PHONES ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    if (row.has_pin && resets.includes(row.phone)) {
      await tx.all(`update auth.users set pin_hash = null, pin_attempts = 0, pin_locked_until = null where id = $1`, [userId]);
      return 'setup';
    }
    return row.has_pin ? 'enter' : 'setup';
  });
}

export async function setPin(userId: string, pin: string) {
  checkNewPin(pin);
  const h = await hashPin(pin);
  await asSystem((tx) =>
    tx.all(`update auth.users set pin_hash = $2, pin_attempts = 0, pin_locked_until = null where id = $1 and pin_hash is null`, [userId, h]),
  );
}

export async function verifyPin(userId: string, pin: string) {
  const row = await asSystem((tx) =>
    tx.one(`select pin_hash, pin_attempts, pin_locked_until > now() as locked,
                   ceil(extract(epoch from (pin_locked_until - now())) / 60)::int as mins
              from auth.users where id = $1 for update`, [userId]),
  );
  if (!row?.pin_hash) throw new ApiError(400, 'Set up your PIN first');
  if (row.locked) throw new ApiError(429, `Too many wrong PINs. Try again in ${row.mins} minute${row.mins === 1 ? '' : 's'}.`);
  if (await matches(String(pin), row.pin_hash)) {
    await asSystem((tx) => tx.all(`update auth.users set pin_attempts = 0, pin_locked_until = null where id = $1`, [userId]));
    return;
  }
  const tries = row.pin_attempts + 1;
  await asSystem((tx) =>
    tx.all(
      `update auth.users set pin_attempts = case when $2::int >= $3::int then 0 else $2::int end,
              pin_locked_until = case when $2::int >= $3::int then now() + make_interval(mins => $4::int) else null end
        where id = $1`,
      [userId, tries, MAX_TRIES, LOCK_MINUTES],
    ),
  );
  const left = MAX_TRIES - tries;
  throw new ApiError(400, left > 0 ? `Wrong PIN. ${left} tr${left === 1 ? 'y' : 'ies'} left.` : `Wrong PIN. Locked for ${LOCK_MINUTES} minutes.`);
}
