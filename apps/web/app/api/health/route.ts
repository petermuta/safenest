import { asSystem } from '@/lib/server/db';
import { handle, ok } from '@/lib/server/http';

// GET → confirms the database is reachable and migrated
export const GET = handle(async () => {
  const row = await asSystem((tx) => tx.one(`select count(*)::int as estates from estates`));
  return ok({ ok: true, estates: row?.estates ?? 0, sessionSecretSet: (process.env.SESSION_SECRET ?? '').length >= 32 });
});
