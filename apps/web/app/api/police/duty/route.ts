import { asUser } from '@/lib/server/db';
import { body, handle, ok } from '@/lib/server/http';
import { log, requireOfficer } from '@/lib/server/police';
import { requireUser } from '@/lib/server/session';

// POST { on_duty } — an officer signs on or off duty (only on-duty officers can be dispatched)
export const POST = handle(async (req: Request) => {
  const userId = await requireUser(req);
  const { on_duty } = await body<{ on_duty?: boolean }>(req);
  return ok(await asUser(userId, async (tx) => {
    const me = await requireOfficer(tx);
    await tx.all(`update police_officers set on_duty = $2 where id = $1`, [me.id, !!on_duty]);
    await log(tx, on_duty ? 'duty_on' : 'duty_off', null, null);
    return { on_duty: !!on_duty };
  }));
});
