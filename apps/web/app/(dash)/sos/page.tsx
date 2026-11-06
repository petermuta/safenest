'use client';

import { formatUgPhone, SOS_BUCKET, type SosAlert, type SosEvidence, type SosStatus } from '@safenest/shared';
import { useCallback, useEffect, useState } from 'react';
import { useEstate } from '@/components/estate-context';
import { Badge, NoEstate, PageTitle } from '@/components/shell';
import { createClient, errorMessage } from '@/lib/supabase/client';

type Row = SosAlert & {
  resident: { full_name: string | null; phone: string } | null;
  unit: { label: string } | null;
  station: { name: string; phone: string } | null;
  evidence: SosEvidence[];
  notifications: { recipient_type: string; channel: string; status: string }[];
};

const fmt = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' });
/** Three short alarm beeps (browsers allow this once the page has been clicked). */
function beep() {
  try {
    const ctx = new AudioContext();
    [0, 0.35, 0.7].forEach((t) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.25, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.25);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + t);
      o.stop(ctx.currentTime + t + 0.26);
    });
  } catch {}
}

const tone = (s: SosStatus) => (s === 'active' ? 'red' : s === 'acknowledged' ? 'amber' : s === 'resolved' ? 'green' : 'grey');

export default function SosPage() {
  const supabase = createClient();
  const { current, estates } = useEstate();
  const [rows, setRows] = useState<Row[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    if (!current) return;
    const { data } = await supabase
      .from('sos_alerts')
      .select(`*, resident:profiles!sos_alerts_user_id_fkey(full_name, phone), unit:units(label),
               station:police_stations(name, phone), evidence:sos_evidence(*), notifications:notification_log(recipient_type, channel, status)`)
      .eq('estate_id', current.estate.id)
      .order('created_at', { ascending: false })
      .limit(50);
    const list = (data as Row[]) ?? [];
    setRows(list);

    // Short-lived signed links for evidence on open alerts.
    const paths = list.filter((r) => r.status === 'active' || r.status === 'acknowledged').flatMap((r) => r.evidence.map((e) => e.storage_path));
    if (paths.length) {
      const { data: signed } = await supabase.storage.from(SOS_BUCKET).createSignedUrls(paths, 3600);
      setUrls(Object.fromEntries((signed ?? []).filter((s) => s.signedUrl && s.path).map((s) => [s.path as string, s.signedUrl as string])));
    }
  }, [current, supabase]);

  useEffect(() => {
    load();
    if (!current) return;
    const id = current.estate.id;
    const ch = supabase.channel(`web-sos-${id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'sos_alerts', filter: `estate_id=eq.${id}` }, () => {
        load();
        beep();
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') new Notification('SafeNest SOS', { body: 'A resident has raised an SOS.' });
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'sos_alerts', filter: `estate_id=eq.${id}` }, load)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'sos_evidence' }, load)
      .subscribe();
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') Notification.requestPermission();
    return () => { supabase.removeChannel(ch); };
  }, [load, current, supabase]);

  const setStatus = async (id: string, status: SosStatus) => {
    const { error } = await supabase.rpc('update_sos_status', { p_alert: id, p_status: status });
    if (error) alert(errorMessage(error)); else load();
  };

  if (!estates.length) return <NoEstate />;
  const open = rows.filter((r) => r.status === 'active' || r.status === 'acknowledged');
  const closed = rows.filter((r) => !open.includes(r));

  return (
    <>
      <PageTitle title="SOS alerts" sub="Live — new alerts appear here instantly" />

      {!open.length && (
        <div className="card mb-6 p-6 text-center text-muted">No open alerts. Keep this page open on the gate or office computer to see alerts live.</div>
      )}

      <div className="mb-8 grid gap-5">
        {open.map((r) => {
          const sent = r.notifications.filter((n) => n.status === 'sent');
          return (
            <div key={r.id} className={`card overflow-hidden ${r.status === 'active' ? 'sos-live border-sos/50' : ''}`}>
              <div className={`flex flex-wrap items-center justify-between gap-3 px-6 py-4 text-white ${r.status === 'active' ? 'bg-sos' : 'bg-amber-500'}`}>
                <div>
                  <div className="text-xs font-bold uppercase opacity-90">SOS · {fmt(r.created_at)}</div>
                  <div className="text-xl font-black">{r.resident?.full_name ?? 'Resident'}{r.unit ? ` · Unit ${r.unit.label}` : ''}</div>
                </div>
                <Badge tone="grey">{r.status}</Badge>
              </div>
              <div className="grid gap-6 p-6 md:grid-cols-3">
                <div>
                  <div className="label">Contact</div>
                  {r.resident && <a className="font-semibold text-brand-deep underline" href={`tel:${r.resident.phone}`}>{formatUgPhone(r.resident.phone)}</a>}
                  <div className="label mt-4">Location</div>
                  <a className="font-semibold text-brand-deep underline" target="_blank" rel="noreferrer" href={`https://maps.google.com/?q=${r.lat},${r.lng}`}>
                    Open map
                  </a>
                  <div className="text-xs text-muted">{r.lat.toFixed(5)}, {r.lng.toFixed(5)} {r.accuracy_m ? `±${Math.round(r.accuracy_m)}m` : '(approximate)'}</div>
                </div>
                <div>
                  <div className="label">Notified</div>
                  <div className="text-sm">{sent.filter((n) => n.recipient_type !== 'police').length} staff messages sent</div>
                  <div className="text-sm">
                    Police: {r.station ? `${r.station.name} ${sent.some((n) => n.recipient_type === 'police') ? '✓ SMS sent' : '— not confirmed'}` : 'no station configured'}
                  </div>
                  {r.station && <a className="text-sm font-semibold text-brand-deep underline" href={`tel:${r.station.phone}`}>Call station</a>}
                </div>
                <div>
                  <div className="label">Evidence ({r.evidence.length})</div>
                  <div className="space-y-2">
                    {r.evidence.map((e) => {
                      const url = urls[e.storage_path];
                      if (!url) return <div key={e.id} className="text-sm text-muted">{e.kind} — loading…</div>;
                      if (e.kind === 'photo') return <a key={e.id} href={url} target="_blank" rel="noreferrer"><img src={url} alt="SOS photo" className="h-24 rounded-xl object-cover" /></a>;
                      if (e.kind === 'video') return <video key={e.id} src={url} controls className="w-full rounded-xl" />;
                      return <audio key={e.id} src={url} controls className="w-full" />;
                    })}
                    {!r.evidence.length && <div className="text-sm text-muted">Waiting for uploads…</div>}
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-3 border-t border-line px-6 py-4">
                {r.status === 'active' && <button className="btn btn-danger" onClick={() => setStatus(r.id, 'acknowledged')}>Acknowledge — responding</button>}
                <button className="btn btn-primary" onClick={() => setStatus(r.id, 'resolved')}>Mark resolved</button>
                <button className="btn btn-secondary" onClick={() => confirm('Mark as false alarm?') && setStatus(r.id, 'false_alarm')}>False alarm</button>
              </div>
            </div>
          );
        })}
      </div>

      {closed.length > 0 && (
        <div className="card overflow-hidden">
          <div className="border-b border-line px-4 py-3 font-bold">History</div>
          <div className="divide-y divide-line">
            {closed.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                <span className="w-40 text-muted">{fmt(r.created_at)}</span>
                <span className="flex-1 font-semibold">{r.resident?.full_name ?? 'Resident'}{r.unit ? ` · ${r.unit.label}` : ''}</span>
                <span className="text-muted">{r.evidence.length} evidence</span>
                <Badge tone={tone(r.status)}>{r.status.replace('_', ' ')}</Badge>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
