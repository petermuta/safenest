import { normalizeUgPhone } from '@safenest/shared';
import { requireAdmin } from '@/lib/server/admin';
import { asUser } from '@/lib/server/db';
import { ApiError, body, handle, ok, uuid } from '@/lib/server/http';
import { requireUser } from '@/lib/server/session';

// GET → all police officers (super admin)
export const GET = handle(async (req: Request) => {
  const userId = await requireUser(req);
  return ok(await asUser(userId, async (tx) => {
    await requireAdmin(tx);
    return tx.all(
      `select o.*, s.name as station_name, s.level as station_level, o.user_id is not null as signed_in
         from police_officers o join police_stations s on s.id = o.station_id
        order by s.name, o.role, o.full_name`,
    );
  }));
});

// POST { station_id, phone, full_name, badge_no?, role } — registers an officer. They sign in with
// this phone number; that's their individual login. (super admin)
export const POST = handle(async (req: Request) => {
  const userId = await requireUser(req);
  const b = await body<{ station_id?: string; phone?: string; full_name?: string; badge_no?: string; role?: string }>(req);
  const phone = normalizeUgPhone(b.phone ?? '');
  if (!phone) throw new ApiError(400, 'Enter a valid Ugandan mobile number');
  if (!b.full_name?.trim()) throw new ApiError(400, "Enter the officer's name");
  const role = b.role ?? 'officer';
  if (!['officer', 'dispatcher', 'commander'].includes(role)) throw new ApiError(400, 'Unknown role');
  const station = uuid(b.station_id, 'unit');
  return ok(await asUser(userId, async (tx) => {
    await requireAdmin(tx);
    const s = await tx.one(`select level from police_stations where id = $1`, [station]);
    if (!s) throw new ApiError(404, 'Unit not found');
    if (s.level !== 'post' && role !== 'commander') throw new ApiError(400, 'Regional HQ and headquarters staff must be commanders');
    if (s.level === 'post' && role === 'commander') throw new ApiError(400, 'At a post, use officer or dispatcher');
    return tx.one(
      `insert into police_officers (station_id, user_id, phone, full_name, badge_no, role, created_by)
       values ($1, (select id from profiles where phone = $2), $2, $3, $4, $5, auth.uid()) returning *`,
      [station, phone, b.full_name!.trim(), b.badge_no?.trim() || null, role],
    );
  }), 201);
});
