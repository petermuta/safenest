import { asUser } from '@/lib/server/db';
import { ApiError, handle, uuid } from '@/lib/server/http';
import { log } from '@/lib/server/police';
import { currentUserId } from '@/lib/server/session';
import { getEvidence } from '@/lib/server/storage';

// GET ?alert=<id> → a resident's selfie. Allowed for: the resident themself; police who
// can see one of that resident's SOS alerts (logged); police who searched that resident
// by NIN in the last hour (logged); the super admin.
export const GET = handle(async (req: Request, { params }: { params: Promise<{ userId: string }> }) => {
  const viewer = await currentUserId(req);
  if (!viewer) throw new ApiError(401, 'Please sign in');
  const subject = uuid((await params).userId, 'user');
  const alertParam = new URL(req.url).searchParams.get('alert');
  const alertId = alertParam ? uuid(alertParam, 'alert') : null;

  const path = await asUser(viewer, async (tx) => {
    const row = await tx.one(`select selfie_path from resident_identity where user_id = $1`, [subject]);
    if (!row?.selfie_path) throw new ApiError(404, 'No photo on file');
    if (viewer === subject) return row.selfie_path as string;

    const access = await tx.one(
      `select public.is_super_admin() as admin,
              ($2::uuid is not null and exists (select 1 from sos_alerts a where a.id = $2 and a.user_id = $1)
                 and public.can_police_view_alert($2)) as via_alert,
              exists (select 1 from police_audit_log l where l.user_id = auth.uid() and l.subject_user_id = $1
                        and l.action = 'nin_search' and l.created_at > now() - interval '1 hour') as via_search`,
      [subject, alertId],
    );
    if (!access?.admin && !access?.via_alert && !access?.via_search) throw new ApiError(403, 'You do not have access to this photo');
    if (access.via_alert || access.via_search) await log(tx, 'view_selfie', alertId, subject);
    return row.selfie_path as string;
  });

  const file = await getEvidence(path);
  if (!file) throw new ApiError(404, 'Photo not found');
  return new Response(file.data, { headers: { 'Content-Type': file.contentType, 'Cache-Control': 'private, no-store' } });
});
