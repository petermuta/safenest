// Fans an SOS alert out to the estate's guards and manager (push, SMS fallback)
// and to the nearest police station (SMS — police don't have the app).
//
// Called by the resident's app right after trigger_sos(). Idempotent: a second call
// for the same alert does nothing.
// Env: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY (provided by Supabase),
//      AT_USERNAME, AT_API_KEY, AT_SENDER_ID, EXPO_ACCESS_TOKEN (optional), DASHBOARD_URL (optional)

import { createClient } from 'npm:@supabase/supabase-js@2';
import { sendSms } from '../_shared/africastalking.ts';
import { corsHeaders, json } from '../_shared/cors.ts';

interface Recipient {
  type: 'guard' | 'manager' | 'police';
  name: string;
  phone: string | null;
  pushToken: string | null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const url = Deno.env.get('SUPABASE_URL')!;
  const authHeader = req.headers.get('Authorization') ?? '';
  const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  });
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const { data: userData } = await userClient.auth.getUser();
  const caller = userData?.user;
  if (!caller) return json({ error: 'Not signed in' }, 401);

  const { alert_id } = await req.json().catch(() => ({}));
  if (!alert_id) return json({ error: 'alert_id is required' }, 400);

  // Only the person who raised the alert can dispatch it.
  const { data: alert } = await admin.from('sos_alerts').select('*').eq('id', alert_id).single();
  if (!alert || alert.user_id !== caller.id) return json({ error: 'Alert not found' }, 404);

  // Claim the dispatch atomically so double taps don't double-send.
  const { data: claimed } = await admin
    .from('sos_alerts')
    .update({ dispatched_at: new Date().toISOString() })
    .eq('id', alert_id)
    .is('dispatched_at', null)
    .select('id');
  if (!claimed?.length) return json({ status: 'already_dispatched' });

  const [{ data: estate }, { data: unit }, { data: resident }, { data: staff }] = await Promise.all([
    admin.from('estates').select('name').eq('id', alert.estate_id).single(),
    alert.unit_id
      ? admin.from('units').select('label').eq('id', alert.unit_id).single()
      : Promise.resolve({ data: null }),
    admin.from('profiles').select('full_name, phone').eq('id', alert.user_id).single(),
    admin
      .from('memberships')
      .select('role, profiles!inner(full_name, phone, expo_push_token)')
      .eq('estate_id', alert.estate_id)
      .eq('active', true)
      .in('role', ['guard', 'manager']),
  ]);

  const recipients: Recipient[] = (staff ?? []).map((m: any) => ({
    type: m.role,
    name: m.profiles.full_name ?? m.role,
    phone: m.profiles.phone,
    pushToken: m.profiles.expo_push_token,
  }));

  let police: { name: string; phone: string; distance_km: number } | null = null;
  const { data: nearest } = await admin.rpc('nearest_police_station', { p_lat: alert.lat, p_lng: alert.lng });
  if (nearest?.[0]) {
    police = nearest[0];
    recipients.push({ type: 'police', name: police!.name, phone: police!.phone, pushToken: null });
  }

  // ---- compose
  const unitLabel = unit?.label ? `Unit ${unit.label}` : 'unit not set';
  const who = `${resident?.full_name ?? 'Resident'} ${resident?.phone ?? ''}`.trim();
  const mapLink = `https://maps.google.com/?q=${alert.lat.toFixed(6)},${alert.lng.toFixed(6)}`;
  const acc = alert.accuracy_m ? ` (±${Math.round(alert.accuracy_m)}m)` : '';
  const time = new Date(alert.created_at).toLocaleTimeString('en-GB', {
    timeZone: 'Africa/Kampala', hour: '2-digit', minute: '2-digit',
  });
  const dashboard = Deno.env.get('DASHBOARD_URL');

  const staffSms =
    `SAFENEST SOS ${time}: ${estate?.name}, ${unitLabel}. ${who}. ` +
    `Location: ${mapLink}${acc}` + (dashboard ? ` Details: ${dashboard}/sos` : '');
  const policeSms =
    `EMERGENCY via SafeNest ${time}. Resident needs help at ${estate?.name}, ${unitLabel}. ` +
    `Contact: ${who}. Location: ${mapLink}${acc}. Please respond.`;

  const logs: Array<Record<string, unknown>> = [];
  const smsQueue: Recipient[] = [];

  // ---- push to staff who have the app
  const pushable = recipients.filter((r) => r.type !== 'police' && r.pushToken);
  if (pushable.length) {
    try {
      const res = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...(Deno.env.get('EXPO_ACCESS_TOKEN') ? { Authorization: `Bearer ${Deno.env.get('EXPO_ACCESS_TOKEN')}` } : {}),
        },
        body: JSON.stringify(
          pushable.map((r) => ({
            to: r.pushToken,
            title: `🚨 SOS — ${unitLabel}`,
            body: `${who} needs help at ${estate?.name}. Tap to respond.`,
            data: { type: 'sos', alert_id },
            priority: 'high',
            sound: 'default',
            channelId: 'sos',
            interruptionLevel: 'critical',
          })),
        ),
      });
      const tickets: Array<{ status: string; message?: string }> = (await res.json())?.data ?? [];
      pushable.forEach((r, i) => {
        const ok = tickets[i]?.status === 'ok';
        logs.push({ alert_id, recipient: r.phone ?? r.name, recipient_type: r.type, channel: 'push',
                    status: ok ? 'sent' : 'failed', detail: tickets[i]?.message ?? null });
        if (!ok) smsQueue.push(r); // fallback
      });
    } catch (e) {
      pushable.forEach((r) => {
        logs.push({ alert_id, recipient: r.phone ?? r.name, recipient_type: r.type, channel: 'push',
                    status: 'failed', detail: String(e) });
        smsQueue.push(r);
      });
    }
  }
  // Staff without a push token go straight to SMS.
  smsQueue.push(...recipients.filter((r) => r.type !== 'police' && !r.pushToken));

  // ---- SMS
  const send = async (list: Recipient[], message: string) => {
    const phones = [...new Set(list.map((r) => r.phone).filter((p): p is string => !!p))];
    if (!phones.length) return;
    try {
      const results = await sendSms(phones, message);
      for (const r of list) {
        const res = results.find((x) => x.number === r.phone);
        logs.push({ alert_id, recipient: r.phone, recipient_type: r.type, channel: 'sms',
                    status: res?.ok ? 'sent' : 'failed', detail: res?.status ?? 'no result' });
      }
    } catch (e) {
      for (const r of list) {
        logs.push({ alert_id, recipient: r.phone, recipient_type: r.type, channel: 'sms', status: 'failed', detail: String(e) });
      }
    }
  };

  await Promise.all([
    send(smsQueue, staffSms),
    send(recipients.filter((r) => r.type === 'police'), policeSms),
  ]);

  if (!police) {
    logs.push({ alert_id, recipient: '-', recipient_type: 'police', channel: 'sms', status: 'skipped',
                detail: 'No active police station configured' });
  }
  if (logs.length) await admin.from('notification_log').insert(logs);

  return json({
    status: 'dispatched',
    notified: logs.filter((l) => l.status === 'sent').length,
    police: police ? { name: police.name, distance_km: Math.round(police.distance_km * 10) / 10 } : null,
  });
});
