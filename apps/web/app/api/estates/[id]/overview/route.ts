import { asUser } from '@/lib/server/db';
import { handle, ok, uuid } from '@/lib/server/http';
import { requireUser } from '@/lib/server/session';

// GET → dashboard counts for one estate (staff only)
export const GET = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const userId = await requireUser(req);
  const id = uuid((await params).id);
  const since = new URL(req.url).searchParams.get('since') ?? new Date(new Date().setHours(0, 0, 0, 0)).toISOString();
  return ok(await asUser(userId, async (tx) => {
    await tx.assert('is_estate_staff', id);
    return tx.one(
      `select
         (select count(*)::int from units where estate_id = $1) as units,
         (select count(*)::int from memberships where estate_id = $1 and role = 'resident' and active) as residents,
         (select count(*)::int from memberships where estate_id = $1 and role = 'guard' and active) as guards,
         (select count(*)::int from visitor_logs where estate_id = $1 and entry_at >= $2::timestamptz) as "visitorsToday",
         (select count(*)::int from visitor_logs where estate_id = $1 and exit_at is null and entry_at > now() - interval '24 hours') as "insideNow",
         (select count(*)::int from sos_alerts where estate_id = $1 and status in ('active', 'acknowledged')) as "openSos",
         (select count(*)::int from invitations where estate_id = $1 and accepted_at is null) as "pendingInvites"`,
      [id, since],
    );
  }));
});
