import { asUser } from '@/lib/server/db';
import { dispatchSos } from '@/lib/server/dispatch';
import { ApiError, body, handle, ok, uuid } from '@/lib/server/http';
import { requireUser } from '@/lib/server/session';

export const maxDuration = 26;

// POST { lat, lng, accuracy?, estate_id? } → creates the alert and notifies guards, manager and police
export const POST = handle(async (req: Request) => {
  const userId = await requireUser(req);
  const b = await body<{ lat?: number; lng?: number; accuracy?: number | null; estate_id?: string | null }>(req);
  const lat = Number(b.lat), lng = Number(b.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    throw new ApiError(400, 'Location is missing');
  }
  const alertId = await asUser(userId, async (tx) =>
    (await tx.one(`select trigger_sos($1, $2, $3, $4) as id`, [
      lat, lng, b.accuracy ?? null, b.estate_id ? uuid(b.estate_id, 'estate') : null,
    ]))!.id as string,
  );

  // The alert is saved even if notifying fails — staff still see it on the dashboard.
  let dispatch: unknown = null;
  try {
    dispatch = await dispatchSos(alertId);
  } catch (e) {
    console.error('SOS dispatch failed', alertId, e);
  }
  return ok({ alert_id: alertId, dispatch }, 201);
});
