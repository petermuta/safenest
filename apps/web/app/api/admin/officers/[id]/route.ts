import { requireAdmin } from '@/lib/server/admin';
import { asUser } from '@/lib/server/db';
import { ApiError, body, handle, ok, uuid } from '@/lib/server/http';
import { requireUser } from '@/lib/server/session';

// PATCH { active?, role? } — deactivate an officer (they lose access immediately) or change role
export const PATCH = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const userId = await requireUser(req);
  const id = uuid((await params).id);
  const b = await body<{ active?: boolean; role?: string }>(req);
  if (b.role && !['officer', 'dispatcher', 'commander'].includes(b.role)) throw new ApiError(400, 'Unknown role');
  return ok(await asUser(userId, async (tx) => {
    await requireAdmin(tx);
    const row = await tx.one(
      `update police_officers set active = coalesce($2, active), role = coalesce($3, role),
              on_duty = case when $2 = false then false else on_duty end
        where id = $1 returning *`,
      [id, 'active' in b ? !!b.active : null, b.role ?? null],
    );
    if (!row) throw new ApiError(404, 'Officer not found');
    return row;
  }));
});
