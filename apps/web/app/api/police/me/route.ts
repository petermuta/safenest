import { asUser } from '@/lib/server/db';
import { handle, ok } from '@/lib/server/http';
import { requireOfficer } from '@/lib/server/police';
import { requireUser } from '@/lib/server/session';

// GET → the signed-in officer and their unit
export const GET = handle(async (req: Request) => {
  const userId = await requireUser(req);
  return ok(await asUser(userId, (tx) => requireOfficer(tx)));
});
