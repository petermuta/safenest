import { NextResponse } from 'next/server';

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export const ok = (data: unknown, status = 200) => NextResponse.json(data, { status });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function uuid(value: unknown, what = 'id'): string {
  if (typeof value !== 'string' || !UUID.test(value)) throw new ApiError(400, `Invalid ${what}`);
  return value;
}

export async function body<T = Record<string, unknown>>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new ApiError(400, 'Request body must be JSON');
  }
}

/**
 * Wraps a route handler: turns ApiErrors and the database's own rule messages
 * (RAISE EXCEPTION → SQLSTATE P0001) into clean JSON errors, hides everything else.
 */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (e: any) {
      if (e instanceof ApiError) return NextResponse.json({ error: e.message }, { status: e.status });
      if (e?.code === 'P0001') return NextResponse.json({ error: e.message }, { status: 400 });
      if (e?.code === '23505') return NextResponse.json({ error: 'That already exists' }, { status: 409 });
      if (e?.code === '23514' || e?.code === '22P02') return NextResponse.json({ error: 'Some details are not valid' }, { status: 400 });
      console.error('API error', e);
      // A short reference (database error code or error type, never data or secrets)
      // so problems can be diagnosed from a screenshot.
      const ref = [e?.code, e?.name !== 'Error' ? e?.name : null].filter(Boolean).join('/') || 'unknown';
      const hint = /does not exist/i.test(String(e?.message)) ? ' [tables missing]'
        : /not configured|connection|ECONN|ENOTFOUND|password authentication/i.test(String(e?.message)) ? ' [database connection]'
        : '';
      return NextResponse.json({ error: `Something went wrong (ref ${ref}${hint}). Please try again.` }, { status: 500 });
    }
  };
}
