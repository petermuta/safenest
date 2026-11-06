import 'server-only';
import type { Tx } from './db';
import { ApiError } from './http';

export async function requireAdmin(tx: Tx) {
  const row = await tx.one(`select public.is_super_admin() as a`);
  if (!row?.a) throw new ApiError(403, 'Only the SafeNest super admin can do this');
}
