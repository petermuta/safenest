import { asUser } from '@/lib/server/db';
import { ApiError, body, handle, ok } from '@/lib/server/http';
import { encryptNin, hashNin, maskNin, normalizeNin } from '@/lib/server/identity';
import { requireUser } from '@/lib/server/session';

// POST { full_name, nin, consent: true } — resident onboarding step 1.
// The NIN is encrypted before storage; only its last 4 characters are kept readable.
export const POST = handle(async (req: Request) => {
  const userId = await requireUser(req);
  const b = await body<{ full_name?: string; nin?: string; consent?: boolean; adult?: boolean }>(req);
  if (b.consent !== true) throw new ApiError(400, 'Please agree to share your NIN with SafeNest and the police');
  if (b.adult !== true) throw new ApiError(400, 'SafeNest accounts are for people aged 18 or older');
  const name = String(b.full_name ?? '').trim();
  if (name.length < 3) throw new ApiError(400, 'Enter your full name as it appears on your National ID');
  const nin = normalizeNin(String(b.nin ?? ''));
  if (!nin) throw new ApiError(400, 'Enter your 14-character NIN, e.g. CM12345678ABCD');

  const hash = hashNin(nin);
  return ok(await asUser(userId, async (tx) => {
    const taken = await tx.one(`select 1 from resident_identity where nin_hash = $1 and user_id <> auth.uid()`, [hash]);
    if (taken) throw new ApiError(409, 'This NIN is already registered to another SafeNest account');
    await tx.all(`update profiles set full_name = $1 where id = auth.uid()`, [name]);
    await tx.all(
      `insert into resident_identity (user_id, nin_ciphertext, nin_hash, nin_last4, consent_at, updated_at)
       values (auth.uid(), $1, $2, $3, now(), now())
       on conflict (user_id) do update set nin_ciphertext = excluded.nin_ciphertext, nin_hash = excluded.nin_hash,
         nin_last4 = excluded.nin_last4, consent_at = now(), updated_at = now()`,
      [encryptNin(nin), hash, nin.slice(-4)],
    );
    return { nin_masked: maskNin(nin.slice(-4)) };
  }));
});
