import { asSystem, asUser } from '@/lib/server/db';
import { body, handle, ok, uuid } from '@/lib/server/http';
import { requireUser } from '@/lib/server/session';
import { sendSms } from '@/lib/server/sms';

// POST { officer_id } — the post's dispatcher assigns an on-duty officer.
// The officer gets a push (if they use the app) or an SMS with the case link.
export const POST = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const userId = await requireUser(req);
  const id = uuid((await params).id);
  const { officer_id } = await body<{ officer_id?: string }>(req);
  const officerId = uuid(officer_id, 'officer');
  await asUser(userId, (tx) => tx.all(`select police_assign($1, $2)`, [id, officerId]));

  // Notify the officer — best effort; the assignment is saved either way.
  try {
    const info = await asSystem((tx) =>
      tx.one(
        `select o.phone, p.expo_push_token, e.name as estate, u.label as unit, a.lat, a.lng
           from police_officers o left join profiles p on p.id = o.user_id,
                sos_alerts a join estates e on e.id = a.estate_id left join units u on u.id = a.unit_id
          where o.id = $1 and a.id = $2`,
        [officerId, id],
      ),
    );
    const site = process.env.URL ?? '';
    const text = `SafeNest SOS assigned to you: ${info.estate}${info.unit ? `, Unit ${info.unit}` : ''}. ` +
      `Map: https://maps.google.com/?q=${info.lat},${info.lng}` + (site ? ` Case: ${site}/police/alerts/${id}` : '');
    if (info.expo_push_token) {
      await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: info.expo_push_token, title: '🚨 SOS assigned to you', body: text, priority: 'high', channelId: 'sos', data: { type: 'police_sos', alert_id: id } }),
      });
    } else if (process.env.AT_API_KEY) {
      await sendSms([info.phone], text);
    }
  } catch (e) {
    console.error('Officer notification failed', e);
  }
  return ok({ ok: true });
});
