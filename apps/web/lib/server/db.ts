import 'server-only';
import { getDatabase } from '@netlify/database';
import { ApiError } from './http';

type Client = { query: (text: string, params?: unknown[]) => Promise<{ rows: any[] }>; release: () => void };
type Pool = { connect: () => Promise<Client> };

let pool: Pool | null = null;

/** Netlify injects the connection; DATABASE_URL overrides it for local runs and tests. */
function getPool(): Pool {
  if (!pool) {
    // DATABASE_URL: local runs/tests. NETLIFY_DB_URL: passed explicitly because some
    // framework functions can't auto-detect the connection ("Environment not configured").
    const url = process.env.DATABASE_URL ?? process.env.NETLIFY_DB_URL;
    const db = url ? getDatabase({ connectionString: url }) : getDatabase();
    pool = db.pool as unknown as Pool;
  }
  return pool;
}

let schemaReady: Promise<void> | null = null;

/**
 * Makes sure the tables exist. Normally Netlify applies netlify/database/migrations on
 * deploy; if it hasn't, the server applies the same (idempotent) SQL once, under an
 * advisory lock so concurrent instances don't race. Cheap check after the first time.
 */
function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      const client = await getPool().connect();
      try {
        const ready = (await client.query(`select to_regclass('public.sos_evidence') is not null as ok`)).rows[0]?.ok;
        if (ready) return;
        const { MIGRATIONS } = await import('./schema.generated');
        await client.query('begin');
        await client.query('select pg_advisory_xact_lock(724501)');
        const again = (await client.query(`select to_regclass('public.sos_evidence') is not null as ok`)).rows[0]?.ok;
        if (!again) {
          for (const m of MIGRATIONS) await client.query(m.sql);
          console.log(`SafeNest: created database tables (${MIGRATIONS.map((m) => m.name).join(', ')})`);
        }
        await client.query('commit');
      } catch (e) {
        await client.query('rollback').catch(() => {});
        schemaReady = null; // try again on the next request
        throw e;
      } finally {
        client.release();
      }
    })();
  }
  return schemaReady;
}

export interface Tx {
  /** Run a query and return all rows. */
  all<T = any>(text: string, params?: unknown[]): Promise<T[]>;
  /** Run a query and return the first row (or null). */
  one<T = any>(text: string, params?: unknown[]): Promise<T | null>;
  /** Throw 403 unless the SQL access function returns true, e.g. assert('is_estate_staff', estateId). */
  assert(fn: AccessFn, arg: string, message?: string): Promise<void>;
}

type AccessFn = 'is_estate_member' | 'is_estate_staff' | 'is_estate_manager' | 'can_view_evidence' | 'can_upload_evidence';

/**
 * Runs `fn` in one transaction as `userId`. The database reads the user through
 * auth.uid(), so every SQL rule (who may verify a pass, raise SOS…) applies.
 */
export async function asUser<T>(userId: string | null, fn: (tx: Tx) => Promise<T>): Promise<T> {
  await ensureSchema();
  const client = await getPool().connect();
  const tx: Tx = {
    all: async (text, params) => (await client.query(text, params)).rows,
    one: async (text, params) => (await client.query(text, params)).rows[0] ?? null,
    assert: async (fnName, arg, message = 'You do not have access to this') => {
      const row = (await client.query(`select public.${fnName}($1) as ok`, [arg])).rows[0];
      if (!row?.ok) throw new ApiError(403, message);
    },
  };
  try {
    await client.query('begin');
    await client.query(`select set_config('app.user_id', $1, true)`, [userId ?? '']);
    const result = await fn(tx);
    await client.query('commit');
    return result;
  } catch (e) {
    await client.query('rollback').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

/** System work with no signed-in user (OTP bookkeeping, SOS dispatch). */
export const asSystem = <T>(fn: (tx: Tx) => Promise<T>) => asUser(null, fn);
