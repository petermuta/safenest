import { requireAdmin } from '@/lib/server/admin';
import { asUser } from '@/lib/server/db';
import { ApiError, body, handle, ok } from '@/lib/server/http';
import { requireUser } from '@/lib/server/session';

// GET → all police stations (super admin)
export const GET = handle(async (req: Request) => {
  const userId = await requireUser(req);
  return ok(await asUser(userId, async (tx) => {
    await requireAdmin(tx);
    return tx.all(`select * from police_stations order by district, name`);
  }));
});

// POST { name, district?, phone, lat, lng } (super admin)
export const POST = handle(async (req: Request) => {
  const userId = await requireUser(req);
  const b = await body<{ name?: string; district?: string; phone?: string; lat?: number; lng?: number }>(req);
  const phone = String(b.phone ?? '').replace(/[^\d+]/g, '');
  if (!b.name?.trim()) throw new ApiError(400, 'Station name is required');
  if (!/^\+256\d{9}$/.test(phone)) throw new ApiError(400, 'Phone must be +256 followed by 9 digits');
  const lat = Number(b.lat), lng = Number(b.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new ApiError(400, 'Latitude and longitude are required');
  return ok(await asUser(userId, async (tx) => {
    await requireAdmin(tx);
    return tx.one(
      `insert into police_stations (name, district, phone, lat, lng) values ($1, $2, $3, $4, $5) returning *`,
      [b.name!.trim(), b.district?.trim() || null, phone, lat, lng],
    );
  }), 201);
});
