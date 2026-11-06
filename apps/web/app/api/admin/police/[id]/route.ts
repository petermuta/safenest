import { requireAdmin } from '@/lib/server/admin';
import { asUser } from '@/lib/server/db';
import { ApiError, body, handle, ok, uuid } from '@/lib/server/http';
import { requireUser } from '@/lib/server/session';

const PARENT_OF: Record<string, string | null> = { post: 'regional', regional: 'headquarters', headquarters: null };

// PATCH { active?, parent_id? } — turn a unit on/off or change who it reports to (super admin)
export const PATCH = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const userId = await requireUser(req);
  const id = uuid((await params).id);
  const b = await body<{ active?: boolean; parent_id?: string | null }>(req);
  return ok(await asUser(userId, async (tx) => {
    await requireAdmin(tx);
    const unit = await tx.one(`select * from police_stations where id = $1`, [id]);
    if (!unit) throw new ApiError(404, 'Unit not found');
    if ('parent_id' in b) {
      const parent = b.parent_id ? uuid(b.parent_id, 'parent unit') : null;
      if (parent) {
        const p = await tx.one(`select level from police_stations where id = $1`, [parent]);
        if (!p || p.level !== PARENT_OF[unit.level]) throw new ApiError(400, 'That unit cannot be the parent at this level');
      }
      await tx.all(`update police_stations set parent_id = $2 where id = $1`, [id, parent]);
    }
    if ('active' in b) await tx.all(`update police_stations set active = $2 where id = $1`, [id, !!b.active]);
    return tx.one(`select * from police_stations where id = $1`, [id]);
  }));
});
