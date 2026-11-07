import { CATEGORIES, requireVisible } from '@/lib/server/community';
import { asUser } from '@/lib/server/db';
import { dispatchSos } from '@/lib/server/dispatch';
import { handle, ok, uuid } from '@/lib/server/http';
import { requireUser } from '@/lib/server/session';
import { getEvidence, putEvidence, sha256 } from '@/lib/server/storage';

export const maxDuration = 26;

// POST → turns a community alert into an SOS from the person who taps it. Police get the
// alert's location, description and photo; until now they could not see it at all.
export const POST = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const userId = await requireUser(req);
  const id = uuid((await params).id);

  const { alertId, photo, existing } = await asUser(userId, async (tx) => {
    await requireVisible(tx, id);
    const c = await tx.one(`select * from community_alerts where id = $1 for update`, [id]);
    if (c.sos_alert_id) return { alertId: c.sos_alert_id as string, photo: null, existing: true };
    const sos = (await tx.one(`select trigger_sos($1, $2, null, null) as id`, [c.lat, c.lng]))!.id as string;
    await tx.all(
      `update sos_alerts set source = 'community', note = $2 where id = $1 and user_id = auth.uid()`,
      [sos, `${CATEGORIES[c.category] ?? 'Alert'}: ${c.message}`],
    );
    await tx.all(`update community_alerts set sos_alert_id = $2 where id = $1`, [id, sos]);
    return { alertId: sos, photo: c.photo_path as string | null, existing: false };
  });
  if (existing) return ok({ alert_id: alertId, already_sent: true });

  // Attach the community photo to the SOS as evidence the police can open.
  if (photo) {
    try {
      const file = await getEvidence(photo);
      if (file) {
        const key = `${alertId}/photo-community-${Date.now()}.jpg`;
        await putEvidence(key, file.data, file.contentType);
        await asUser(userId, (tx) =>
          tx.all(`insert into sos_evidence (alert_id, kind, storage_path, sha256) values ($1, 'photo', $2, $3)`,
            [alertId, key, sha256(file.data)]),
        );
      }
    } catch (e) {
      console.error('Could not attach community photo', e);
    }
  }

  let dispatch: unknown = null;
  try {
    dispatch = await dispatchSos(alertId);
  } catch (e) {
    console.error('SOS dispatch failed', alertId, e);
  }
  return ok({ alert_id: alertId, dispatch }, 201);
});
