import 'server-only';
import type { Tx } from './db';
import { ApiError } from './http';

export interface Officer {
  id: string;
  station_id: string;
  full_name: string;
  role: 'officer' | 'dispatcher' | 'commander';
  on_duty: boolean;
  phone: string;
  badge_no: string | null;
  station: { id: string; name: string; level: 'post' | 'regional' | 'headquarters'; parent_id: string | null; lat: number; lng: number };
}

/** The signed-in police officer, or 403. */
export async function requireOfficer(tx: Tx): Promise<Officer> {
  const o = await tx.one<Officer>(
    `select o.id, o.station_id, o.full_name, o.role, o.on_duty, o.phone, o.badge_no,
            jsonb_build_object('id', s.id, 'name', s.name, 'level', s.level, 'parent_id', s.parent_id, 'lat', s.lat, 'lng', s.lng) as station
       from police_officers o join police_stations s on s.id = o.station_id
      where o.user_id = auth.uid() and o.active`,
  );
  if (!o) throw new ApiError(403, 'This page is for registered police officers');
  return o;
}

export async function requireAlertAccess(tx: Tx, alertId: string) {
  const row = await tx.one(`select public.can_police_view_alert($1) as ok`, [alertId]);
  if (!row?.ok) throw new ApiError(404, 'Alert not found');
}

export const log = (tx: Tx, action: string, alertId: string | null, subject: string | null, detail?: unknown) =>
  tx.all(`select public.police_log($1, $2, $3, $4::jsonb)`, [action, alertId, subject, detail ? JSON.stringify(detail) : null]);
