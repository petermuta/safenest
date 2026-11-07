import 'server-only';
import { jwtVerify, SignJWT } from 'jose';
import { cookies } from 'next/headers';
import { ApiError } from './http';

export const SESSION_COOKIE = 'sn_session';
const SESSION_DAYS = 30;
// Bumped from 'session' when the PIN step was added: every older session stops working,
// so nobody keeps a police/manager/admin session that never passed the PIN check.
export const SESSION_AUDIENCE = 'session-v2';

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new ApiError(500, 'Server is missing SESSION_SECRET (32+ characters)');
  return new TextEncoder().encode(s);
}

export async function signSession(userId: string) {
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .setAudience(SESSION_AUDIENCE)
    .sign(secret());
}

/** 10-minute token proving the SMS code was correct, while the user enters their PIN. */
export async function signPinPending(userId: string) {
  return new SignJWT({}).setProtectedHeader({ alg: 'HS256' }).setSubject(userId)
    .setExpirationTime('10m').setAudience('pin-pending').sign(secret());
}

export async function verifyPinPending(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, secret(), { audience: 'pin-pending' });
    return payload.sub ?? null;
  } catch {
    return null;
  }
}

/** Short-lived token that lets one evidence file open in a browser/media player. */
export async function signEvidenceLink(userId: string, evidenceId: string) {
  return new SignJWT({ eid: evidenceId })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setExpirationTime('10m')
    .setAudience('evidence')
    .sign(secret());
}

export async function verifyEvidenceLink(token: string, evidenceId: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, secret(), { audience: 'evidence' });
    return payload.eid === evidenceId ? (payload.sub ?? null) : null;
  } catch {
    return null;
  }
}

async function verify(token: string | undefined | null): Promise<string | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { audience: SESSION_AUDIENCE });
    return payload.sub ?? null;
  } catch {
    return null;
  }
}

/** Mobile sends "Authorization: Bearer <token>"; the web dashboard uses an httpOnly cookie. */
export async function currentUserId(req?: Request): Promise<string | null> {
  const auth = req?.headers.get('authorization');
  if (auth?.startsWith('Bearer ')) return verify(auth.slice(7));
  return verify((await cookies()).get(SESSION_COOKIE)?.value);
}

export async function requireUser(req?: Request): Promise<string> {
  const id = await currentUserId(req);
  if (!id) throw new ApiError(401, 'Please sign in');
  return id;
}

export const sessionCookie = (token: string) => ({
  name: SESSION_COOKIE,
  value: token,
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: SESSION_DAYS * 86400,
});
