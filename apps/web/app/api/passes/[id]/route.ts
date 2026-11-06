import { asUser } from '@/lib/server/db';
import { ApiError, handle, ok, uuid } from '@/lib/server/http';
import { requireUser } from '@/lib/server/session';

// GET → one pass (its creator, the unit's residents, or estate staff)
export const GET = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const userId = await requireUser(req);
  const id = uuid((await params).id);
  return ok(await asUser(userId, async (tx) => {
    const pass = await tx.one(
      `select * from guest_passes
        where id = $1
          and (created_by = auth.uid() or unit_id in (select public.my_unit_ids()) or public.is_estate_staff(estate_id))`,
      [id],
    );
    if (!pass) throw new ApiError(404, 'Pass not found');
    return pass;
  }));
});
