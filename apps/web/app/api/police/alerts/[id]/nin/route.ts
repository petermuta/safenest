import { asUser } from '@/lib/server/db';
import { ApiError, handle, ok, uuid } from '@/lib/server/http';
import { decryptNin } from '@/lib/server/identity';
import { log, requireAlertAccess, requireOfficer } from '@/lib/server/police';
import { requireUser } from '@/lib/server/session';

// POST → reveals the full NIN of the person who raised this SOS (police only, logged)
export const POST = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const userId = await requireUser(req);
  const id = uuid((await params).id);
  return ok(await asUser(userId, async (tx) => {
    await requireOfficer(tx);
    await requireAlertAccess(tx, id);
    const row = await tx.one(
      `select a.user_id, ri.nin_ciphertext from sos_alerts a left join resident_identity ri on ri.user_id = a.user_id where a.id = $1`,
      [id],
    );
    if (!row?.nin_ciphertext) throw new ApiError(404, 'This resident has not registered a NIN');
    await log(tx, 'reveal_nin', id, row.user_id);
    return { nin: decryptNin(row.nin_ciphertext) };
  }));
});
