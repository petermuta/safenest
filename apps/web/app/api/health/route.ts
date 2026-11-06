import { asSystem } from '@/lib/server/db';
import { ok } from '@/lib/server/http';

// GET → is the database reachable and migrated? Reports the database error text
// (never credentials) so setup problems can be diagnosed without server access.
export async function GET() {
  const sessionSecretSet = (process.env.SESSION_SECRET ?? '').length >= 32;
  try {
    const row = await asSystem((tx) =>
      tx.one(`select (select count(*)::int from estates) as estates,
                     (to_regclass('auth.otp_codes') is not null) as auth_tables`),
    );
    return ok({ ok: true, estates: row?.estates ?? 0, authTables: row?.auth_tables, sessionSecretSet });
  } catch (e: any) {
    return ok({
      ok: false,
      sessionSecretSet,
      dbError: { code: e?.code ?? null, name: e?.name ?? null, message: String(e?.message ?? e).slice(0, 300) },
    }, 503);
  }
}
