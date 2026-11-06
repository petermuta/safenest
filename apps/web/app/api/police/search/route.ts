import { asUser } from '@/lib/server/db';
import { ApiError, body, handle, ok } from '@/lib/server/http';
import { hashNin, normalizeNin } from '@/lib/server/identity';
import { log, requireOfficer } from '@/lib/server/police';
import { requireUser } from '@/lib/server/session';

// POST { nin, reason } — police look up a SafeNest resident by exact NIN.
// Exact match only (no partial or name search). Every search is logged with its reason.
export const POST = handle(async (req: Request) => {
  const userId = await requireUser(req);
  const b = await body<{ nin?: string; reason?: string }>(req);
  const nin = normalizeNin(String(b.nin ?? ''));
  if (!nin) throw new ApiError(400, 'Enter the full 14-character NIN');
  const reason = String(b.reason ?? '').trim();
  if (reason.length < 5) throw new ApiError(400, 'Give a reason for this search — it is recorded in the audit log');

  return ok(await asUser(userId, async (tx) => {
    await requireOfficer(tx);
    const person = await tx.one(
      `select p.id, p.full_name, p.phone, ri.selfie_path is not null as has_selfie, ri.consent_at
         from resident_identity ri join profiles p on p.id = ri.user_id where ri.nin_hash = $1`,
      [hashNin(nin)],
    );
    await log(tx, 'nin_search', null, person?.id ?? null, { found: !!person, reason, nin_last4: nin.slice(-4) });
    if (!person) return { found: false };
    const homes = await tx.all(
      `select e.name as estate, e.address, e.district, u.label as unit, m.role
         from memberships m join estates e on e.id = m.estate_id left join units u on u.id = m.unit_id
        where m.user_id = $1 and m.active`,
      [person.id],
    );
    const alerts = await tx.all(
      `select id, created_at, status, police_status, public.can_police_view_alert(id) as can_open
         from sos_alerts where user_id = $1 order by created_at desc limit 10`,
      [person.id],
    );
    return { found: true, person, homes, alerts };
  }));
});
