import { asUser } from '@/lib/server/db';
import { ApiError, handle, ok, uuid } from '@/lib/server/http';
import { requireUser } from '@/lib/server/session';

// GET → one alert (the person who raised it, or estate staff)
export const GET = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const userId = await requireUser(req);
  const id = uuid((await params).id);
  return ok(await asUser(userId, async (tx) => {
    const alert = await tx.one(
      `select a.*,
              jsonb_build_object('full_name', p.full_name, 'phone', p.phone) as resident,
              case when u.id is null then null else jsonb_build_object('label', u.label) end as unit,
              jsonb_build_object('name', e.name) as estate,
              coalesce((select jsonb_agg(ev order by ev.created_at) from sos_evidence ev where ev.alert_id = a.id), '[]') as evidence
         from sos_alerts a
         left join profiles p on p.id = a.user_id
         join estates e on e.id = a.estate_id
         left join units u on u.id = a.unit_id
        where a.id = $1 and (a.user_id = auth.uid() or public.is_estate_staff(a.estate_id))`,
      [id],
    );
    if (!alert) throw new ApiError(404, 'Alert not found');
    return alert;
  }));
});
