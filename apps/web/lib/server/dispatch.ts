import 'server-only';
import { asSystem } from './db';
import { sendSms } from './sms';

interface Recipient {
  type: 'guard' | 'manager' | 'police';
  name: string;
  phone: string | null;
  pushToken: string | null;
}

/**
 * Fans an SOS out to the estate's guards and manager (Expo push, SMS fallback)
 * and to the nearest police station (SMS — police don't have the app).
 * Idempotent: only the first call for an alert sends anything.
 */
export async function dispatchSos(alertId: string) {
  const ctx = await asSystem(async (tx) => {
    const claimed = await tx.one(
      `update sos_alerts set dispatched_at = now() where id = $1 and dispatched_at is null returning *`,
      [alertId],
    );
    if (!claimed) return null;
    const estate = await tx.one(`select name from estates where id = $1`, [claimed.estate_id]);
    const unit = claimed.unit_id ? await tx.one(`select label from units where id = $1`, [claimed.unit_id]) : null;
    const resident = await tx.one(`select full_name, phone from profiles where id = $1`, [claimed.user_id]);
    const staff = await tx.all(
      `select m.role, p.full_name, p.phone, p.expo_push_token
         from memberships m join profiles p on p.id = m.user_id
        where m.estate_id = $1 and m.active and m.role in ('guard', 'manager')`,
      [claimed.estate_id],
    );
    const police = await tx.one(`select * from nearest_police_station($1, $2)`, [claimed.lat, claimed.lng]);
    return { alert: claimed, estate, unit, resident, staff, police };
  });
  if (!ctx) return { status: 'already_dispatched' as const };

  const { alert, estate, unit, resident, staff, police } = ctx;
  const recipients: Recipient[] = staff.map((m: any) => ({
    type: m.role, name: m.full_name ?? m.role, phone: m.phone, pushToken: m.expo_push_token,
  }));
  if (police) recipients.push({ type: 'police', name: police.name, phone: police.phone, pushToken: null });

  const unitLabel = unit?.label ? `Unit ${unit.label}` : 'unit not set';
  const who = `${resident?.full_name ?? 'Resident'} ${resident?.phone ?? ''}`.trim();
  const mapLink = `https://maps.google.com/?q=${Number(alert.lat).toFixed(6)},${Number(alert.lng).toFixed(6)}`;
  const acc = alert.accuracy_m ? ` (±${Math.round(alert.accuracy_m)}m)` : '';
  const time = new Date(alert.created_at).toLocaleTimeString('en-GB', { timeZone: 'Africa/Kampala', hour: '2-digit', minute: '2-digit' });
  const site = process.env.URL ?? process.env.PUBLIC_URL; // Netlify sets URL to the site's main address

  const staffSms = `SAFENEST SOS ${time}: ${estate?.name}, ${unitLabel}. ${who}. Location: ${mapLink}${acc}` + (site ? ` Details: ${site}/sos` : '');
  const policeSms = `EMERGENCY via SafeNest ${time}. Resident needs help at ${estate?.name}, ${unitLabel}. Contact: ${who}. Location: ${mapLink}${acc}. Please respond.`;

  const logs: Array<[string, string, string, string, string | null]> = []; // recipient, type, channel, status, detail
  const smsQueue: Recipient[] = [];

  // Push to staff who have the app; anything that fails falls back to SMS.
  const pushable = recipients.filter((r) => r.type !== 'police' && r.pushToken);
  if (pushable.length) {
    try {
      const res = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...(process.env.EXPO_ACCESS_TOKEN ? { Authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}` } : {}),
        },
        body: JSON.stringify(pushable.map((r) => ({
          to: r.pushToken,
          title: `🚨 SOS — ${unitLabel}`,
          body: `${who} needs help at ${estate?.name}. Tap to respond.`,
          data: { type: 'sos', alert_id: alertId },
          priority: 'high',
          sound: 'default',
          channelId: 'sos',
          interruptionLevel: 'critical',
        }))),
      });
      const tickets: Array<{ status: string; message?: string }> = (await res.json())?.data ?? [];
      pushable.forEach((r, i) => {
        const sent = tickets[i]?.status === 'ok';
        logs.push([r.phone ?? r.name, r.type, 'push', sent ? 'sent' : 'failed', tickets[i]?.message ?? null]);
        if (!sent) smsQueue.push(r);
      });
    } catch (e) {
      pushable.forEach((r) => { logs.push([r.phone ?? r.name, r.type, 'push', 'failed', String(e)]); smsQueue.push(r); });
    }
  }
  smsQueue.push(...recipients.filter((r) => r.type !== 'police' && !r.pushToken));

  const send = async (list: Recipient[], message: string) => {
    const phones = [...new Set(list.map((r) => r.phone).filter((p): p is string => !!p))];
    if (!phones.length) return;
    try {
      const results = await sendSms(phones, message);
      for (const r of list) {
        const res = results.find((x) => x.number === r.phone);
        logs.push([r.phone ?? '-', r.type, 'sms', res?.ok ? 'sent' : 'failed', res?.status ?? 'no result']);
      }
    } catch (e) {
      for (const r of list) logs.push([r.phone ?? '-', r.type, 'sms', 'failed', String(e)]);
    }
  };
  await Promise.all([send(smsQueue, staffSms), send(recipients.filter((r) => r.type === 'police'), policeSms)]);
  if (!police) logs.push(['-', 'police', 'sms', 'skipped', 'No active police station configured']);

  if (logs.length) {
    await asSystem((tx) =>
      tx.all(
        `insert into notification_log (alert_id, recipient, recipient_type, channel, status, detail)
         select $1, x.r, x.t, x.c, x.s, x.d
           from jsonb_to_recordset($2::jsonb) as x(r text, t text, c text, s text, d text)`,
        [alertId, JSON.stringify(logs.map(([r, t, c, s, d]) => ({ r, t, c, s, d })))],
      ),
    );
  }
  return {
    status: 'dispatched' as const,
    notified: logs.filter((l) => l[3] === 'sent').length,
    police: police ? { name: police.name, distance_km: Math.round(police.distance_km * 10) / 10 } : null,
  };
}
