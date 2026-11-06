import { requireAdmin } from '@/lib/server/admin';
import { asUser } from '@/lib/server/db';
import { ApiError, body, handle, ok, uuid } from '@/lib/server/http';
import { requireUser } from '@/lib/server/session';

const LEVELS = ['post', 'regional', 'headquarters'];
const PARENT_OF: Record<string, string | null> = { post: 'regional', regional: 'headquarters', headquarters: null };

// GET → all police units with their parent (super admin)
export const GET = handle(async (req: Request) => {
  const userId = await requireUser(req);
  return ok(await asUser(userId, async (tx) => {
    await requireAdmin(tx);
    return tx.all(
      `select s.*, p.name as parent_name,
              (select count(*)::int from police_officers o where o.station_id = s.id and o.active) as officers
         from police_stations s left join police_stations p on p.id = s.parent_id
        order by case s.level when 'headquarters' then 0 when 'regional' then 1 else 2 end, s.district nulls last, s.name`,
    );
  }));
});

// POST { name, level, parent_id?, district?, phone, lat, lng } (super admin)
// A post reports to a regional HQ; a regional HQ reports to headquarters.
export const POST = handle(async (req: Request) => {
  const userId = await requireUser(req);
  const b = await body<{ name?: string; level?: string; parent_id?: string | null; district?: string; phone?: string; lat?: number; lng?: number }>(req);
  const level = b.level ?? 'post';
  if (!LEVELS.includes(level)) throw new ApiError(400, 'Level must be post, regional or headquarters');
  const phone = String(b.phone ?? '').replace(/[^\d+]/g, '');
  if (!b.name?.trim()) throw new ApiError(400, 'Name is required');
  if (!/^\+256\d{9}$/.test(phone)) throw new ApiError(400, 'Phone must be +256 followed by 9 digits');
  const lat = Number(b.lat), lng = Number(b.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new ApiError(400, 'Latitude and longitude are required');
  const parent = b.parent_id ? uuid(b.parent_id, 'parent unit') : null;

  return ok(await asUser(userId, async (tx) => {
    await requireAdmin(tx);
    if (parent) {
      const p = await tx.one(`select level from police_stations where id = $1`, [parent]);
      if (!p || p.level !== PARENT_OF[level]) {
        throw new ApiError(400, level === 'post' ? 'A post must report to a regional HQ' : 'A regional HQ must report to headquarters');
      }
    }
    return tx.one(
      `insert into police_stations (name, level, parent_id, district, phone, lat, lng) values ($1, $2, $3, $4, $5, $6, $7) returning *`,
      [b.name!.trim(), level, level === 'headquarters' ? null : parent, b.district?.trim() || null, phone, lat, lng],
    );
  }), 201);
});
