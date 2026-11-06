import { requireVisible } from '@/lib/server/community';
import { asUser } from '@/lib/server/db';
import { ApiError, handle, uuid } from '@/lib/server/http';
import { currentUserId } from '@/lib/server/session';
import { getEvidence } from '@/lib/server/storage';

// GET → a community alert's photo (residents who can see the alert; moderators)
export const GET = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const userId = await currentUserId(req);
  if (!userId) throw new ApiError(401, 'Please sign in');
  const id = uuid((await params).id);
  const path = await asUser(userId, async (tx) => {
    await requireVisible(tx, id);
    return (await tx.one(`select photo_path from community_alerts where id = $1`, [id]))?.photo_path as string | null;
  });
  if (!path) throw new ApiError(404, 'No photo');
  const file = await getEvidence(path);
  if (!file) throw new ApiError(404, 'No photo');
  return new Response(file.data, { headers: { 'Content-Type': file.contentType, 'Cache-Control': 'private, max-age=300' } });
});
