import 'server-only';
import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from 'node:crypto';
import { ApiError } from './http';

// National ID numbers are sensitive personal data (Uganda Data Protection and Privacy Act).
//  - stored encrypted with AES-256-GCM; the key never touches the database
//  - a keyed hash (HMAC-SHA256) lets police search by exact NIN without decrypting
//  - everyone except police sees only the last 4 characters
// Env: NIN_ENCRYPTION_KEY — 32+ random characters, kept secret, never changed after use.

function keys() {
  const secret = process.env.NIN_ENCRYPTION_KEY;
  if (!secret || secret.length < 32) throw new ApiError(500, 'Server is missing NIN_ENCRYPTION_KEY (32+ characters)');
  const derive = (label: string) => Buffer.from(hkdfSync('sha256', secret, 'safenest-nin', label, 32));
  return { enc: derive('encrypt-v1'), mac: derive('search-v1') };
}

/** Ugandan NINs: 14 letters/digits, e.g. CM12345678ABCD (CM/CF citizens). */
export function normalizeNin(input: string): string | null {
  const nin = input.replace(/[\s-]/g, '').toUpperCase();
  return /^[A-Z]{2}[A-Z0-9]{12}$/.test(nin) ? nin : null;
}

export function encryptNin(nin: string): string {
  const { enc } = keys();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', enc, iv);
  const ct = Buffer.concat([cipher.update(nin, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), ct.toString('base64url')].join('.');
}

export function decryptNin(stored: string): string {
  const { enc } = keys();
  const [v, iv, tag, ct] = stored.split('.');
  if (v !== 'v1') throw new Error('Unknown NIN format');
  const d = createDecipheriv('aes-256-gcm', enc, Buffer.from(iv, 'base64url'));
  d.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([d.update(Buffer.from(ct, 'base64url')), d.final()]).toString('utf8');
}

export const hashNin = (nin: string) => createHmac('sha256', keys().mac).update(nin).digest('hex');

export const maskNin = (last4: string | null | undefined) => (last4 ? `••••••••••${last4}` : null);
