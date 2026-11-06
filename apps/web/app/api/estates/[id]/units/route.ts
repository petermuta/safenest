import { asUser } from '@/lib/server/db';
import { ApiError, body, handle, ok, uuid } from '@/lib/server/http';
import { requireUser } from '@/lib/server/session';

// POST { labels: string[] } → adds units, skipping ones that already exist (manager only)
export const POST = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const userId = await requireUser(req);
  const id = uuid((await params).id);
  const { labels } = await body<{ labels?: string[] }>(req);
  const clean = [...new Set((labels ?? []).map((l) => String(l).trim()).filter(Boolean))];
  if (!clean.length) throw new ApiError(400, 'No units to add');
  if (clean.length > 500) throw new ApiError(400, 'Add at most 500 units at a time');
  return ok(await asUser(userId, async (tx) => {
    await tx.assert('is_estate_manager', id, 'Only the estate manager can add units');
    return tx.all(
      `insert into units (estate_id, label) select $1, unnest($2::text[])
       on conflict (estate_id, label) do nothing returning *`,
      [id, clean],
    );
  }), 201);
});
