import { requireAdmin } from '@/lib/server/admin';
import { asUser } from '@/lib/server/db';
import { handle, ok } from '@/lib/server/http';
import { RETENTION, runRetention } from '@/lib/server/retention';
import { requireUser } from '@/lib/server/session';

// GET → the retention rules and the last run (super admin)
export const GET = handle(async (req: Request) => {
  const userId = await requireUser(req);
  return ok(await asUser(userId, async (tx) => {
    await requireAdmin(tx);
    const job = await tx.one(`select last_run_at, last_result from safenest_jobs where name = 'retention'`);
    return { rules: RETENTION, last: job };
  }));
});

// POST → run the clean-up now (super admin)
export const POST = handle(async (req: Request) => {
  const userId = await requireUser(req);
  await asUser(userId, requireAdmin);
  return ok({ result: await runRetention(true) });
});
