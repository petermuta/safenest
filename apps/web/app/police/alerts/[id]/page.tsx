'use client';

import { formatUgPhone } from '@safenest/shared';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { LEVEL_LABEL, POLICE_STATUS } from '@/components/police-shell';
import { Badge } from '@/components/shell';
import { api, errorMessage } from '@/lib/api';
import { directionsUrl, distanceKm, etaMinutes, formatKm, osmEmbed } from '@/lib/geo';
import { usePoll } from '@/lib/use-poll';

interface CaseData {
  alert: any;
  me: { id: string; role: string; station_id: string; level: string };
  can: { assign: boolean; escalate: boolean; status: boolean };
}
interface OfficerRow { id: string; full_name: string; badge_no: string | null; role: string; on_duty: boolean; open_cases: number }

const fmt = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';

export default function PoliceCase() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<CaseData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [officers, setOfficers] = useState<OfficerRow[]>([]);
  const [pick, setPick] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [here, setHere] = useState<{ lat: number; lng: number; acc: number } | null>(null);
  const [geoErr, setGeoErr] = useState<string | null>(null);
  const [nin, setNin] = useState<string | null>(null);

  const load = async () => {
    try {
      setData(await api<CaseData>(`/api/police/alerts/${id}`));
    } catch (e) {
      setErr(errorMessage(e));
    }
  };
  usePoll(load, 10_000, [id]);

  // The officer's own position, for distance and travel-time to the scene.
  useEffect(() => {
    if (!navigator.geolocation) return setGeoErr('This browser cannot share location');
    const w = navigator.geolocation.watchPosition(
      (p) => setHere({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy }),
      () => setGeoErr('Allow location access to see distance and travel time'),
      { enableHighAccuracy: true, maximumAge: 15_000, timeout: 20_000 },
    );
    return () => navigator.geolocation.clearWatch(w);
  }, []);

  useEffect(() => {
    if (data?.can.assign) api<OfficerRow[]>('/api/police/officers').then(setOfficers).catch(() => {});
  }, [data?.can.assign]);

  const run = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(label);
    try {
      await fn();
      await load();
      if (data?.can.assign) api<OfficerRow[]>('/api/police/officers').then(setOfficers).catch(() => {});
    } catch (e) {
      alert(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  if (err) return <div className="card p-6"><p className="font-bold">{err}</p><Link href="/police" className="btn btn-secondary mt-4">Back to cases</Link></div>;
  if (!data) return <p className="text-muted">Loading case…</p>;

  const a = data.alert;
  const st = POLICE_STATUS[a.police_status] ?? POLICE_STATUS.new;
  const km = here ? distanceKm(here.lat, here.lng, a.lat, a.lng) : null;
  const onDuty = officers.filter((o) => o.on_duty && o.role !== 'commander');

  return (
    <>
      <Link href="/police" className="text-sm font-semibold text-muted">← All cases</Link>

      <div className={`mt-3 overflow-hidden rounded-3xl text-white ${a.police_status === 'closed' ? 'bg-[#374151]' : 'bg-sos'}`}>
        <div className="p-5">
          <div className="text-xs font-bold uppercase opacity-90">
            SOS · {fmt(a.created_at)}{a.source === 'community' ? ' · from a community alert' : ''}
          </div>
          <div className="mt-1 text-2xl font-black">{a.estate_name}{a.unit_label ? ` · Unit ${a.unit_label}` : ''}</div>
          {a.estate_address && <div className="opacity-90">{a.estate_address}</div>}
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge tone="grey">{st.label}</Badge>
            <Badge tone="grey">Level: {LEVEL_LABEL[a.police_level as keyof typeof LEVEL_LABEL]}</Badge>
          </div>
        </div>
      </div>

      {a.note && (
        <div className="card mt-4 p-4">
          <div className="label">What the resident reported</div>
          <p className="font-semibold">{a.note}</p>
        </div>
      )}

      {/* Location: map, distance, estimated travel time, directions */}
      <div className="card mt-4 overflow-hidden">
        <iframe title="Location of the SOS" src={osmEmbed(a.lat, a.lng)} className="h-64 w-full border-0" loading="lazy" />
        <div className="grid gap-4 p-4 sm:grid-cols-3">
          <div>
            <div className="label">Distance from you</div>
            <div className="text-2xl font-black text-brand-deep">{km != null ? formatKm(km) : '—'}</div>
            <div className="text-xs text-muted">{km != null ? 'straight line' : geoErr ?? 'Getting your location…'}</div>
          </div>
          <div>
            <div className="label">Travel time (estimate)</div>
            <div className="text-2xl font-black text-brand-deep">{km != null ? `~${etaMinutes(km)} min` : '—'}</div>
            <div className="text-xs text-muted">by road in city traffic; Maps gives the exact route</div>
          </div>
          <div className="flex flex-col justify-center gap-2">
            <a href={directionsUrl(a.lat, a.lng)} target="_blank" rel="noreferrer" className="btn btn-primary">Get directions</a>
            <div className="text-center text-xs text-muted">
              {a.lat.toFixed(5)}, {a.lng.toFixed(5)} {a.accuracy_m ? `(±${Math.round(a.accuracy_m)} m)` : '(approximate)'}
            </div>
          </div>
        </div>
      </div>

      {/* Who raised it */}
      <div className="card mt-4 flex flex-wrap gap-4 p-4">
        {a.resident.has_selfie ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/identity/${a.resident.id}/selfie?alert=${a.id}`} alt="Resident's registered photo"
            className="size-28 rounded-2xl object-cover" />
        ) : (
          <div className="grid size-28 place-items-center rounded-2xl bg-surface-2 text-xs text-muted">No photo</div>
        )}
        <div className="min-w-0 flex-1">
          <div className="label">Resident</div>
          <div className="text-lg font-bold">{a.resident.full_name ?? 'Name not given'}</div>
          <a className="font-semibold text-brand-deep underline" href={`tel:${a.resident.phone}`}>{formatUgPhone(a.resident.phone)}</a>
          <div className="mt-2 text-sm">
            NIN: <span className="font-mono">{nin ?? a.resident.nin_masked ?? 'not registered'}</span>
            {a.resident.nin_masked && !nin && (
              <button className="ml-2 text-sm font-semibold text-brand-deep underline"
                onClick={() => run('nin', async () => setNin((await api<{ nin: string }>(`/api/police/alerts/${id}/nin`, { method: 'POST' })).nin))}>
                Show full NIN (logged)
              </button>
            )}
          </div>
          {a.gate_phone && <div className="mt-1 text-sm">Estate gate: <a className="underline" href={`tel:${a.gate_phone}`}>{formatUgPhone(a.gate_phone)}</a></div>}
        </div>
      </div>

      {/* Evidence */}
      <div className="card mt-4 p-4">
        <div className="label">Evidence ({a.evidence.length})</div>
        {!a.evidence.length && <p className="text-sm text-muted">None uploaded yet.</p>}
        <div className="grid gap-3 sm:grid-cols-2">
          {a.evidence.map((e: { id: string; kind: string; created_at: string }) => {
            const url = `/api/evidence/${e.id}`;
            return (
              <div key={e.id}>
                <div className="mb-1 text-xs text-muted">{e.kind} · {fmt(e.created_at)}</div>
                {e.kind === 'photo' && <a href={url} target="_blank" rel="noreferrer">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={url} alt="" className="max-h-56 rounded-xl object-cover" /></a>}
                {e.kind === 'video' && <video src={url} controls className="w-full rounded-xl" />}
                {e.kind === 'audio' && <audio src={url} controls className="w-full" />}
              </div>
            );
          })}
        </div>
      </div>

      {/* Actions */}
      <div className="card mt-4 grid gap-5 p-4">
        <div>
          <div className="label">Chain of command</div>
          <div className="text-sm">
            Post: <b>{a.post?.name ?? '—'}</b>
            {a.regional && <> → Regional: <b>{a.regional.name}</b></>}
            {a.police_level === 'headquarters' && <> → <b>Headquarters</b></>}
          </div>
          <div className="mt-1 text-xs text-muted">
            {a.assigned_at && <>Assigned {fmt(a.assigned_at)} to {a.assigned_officer?.full_name}. </>}
            {a.escalated_regional_at && <>Escalated to regional {fmt(a.escalated_regional_at)}. </>}
            {a.escalated_hq_at && <>Escalated to headquarters {fmt(a.escalated_hq_at)}.</>}
          </div>
        </div>

        {data.can.assign && a.police_status !== 'closed' && (
          <div>
            <div className="label">Dispatch an on-duty officer</div>
            {!onDuty.length ? (
              <p className="text-sm text-muted">No officers at this post are on duty right now.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                <select className="input max-w-sm" value={pick} onChange={(e) => setPick(e.target.value)}>
                  <option value="">Choose officer…</option>
                  {onDuty.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.full_name}{o.badge_no ? ` (${o.badge_no})` : ''}{o.open_cases ? ` · ${o.open_cases} open` : ''}
                    </option>
                  ))}
                </select>
                <button className="btn btn-danger" disabled={!pick || busy === 'assign'}
                  onClick={() => run('assign', () => api(`/api/police/alerts/${id}/assign`, { body: { officer_id: pick } }))}>
                  {a.assigned_officer ? 'Reassign' : 'Dispatch'}
                </button>
              </div>
            )}
          </div>
        )}

        {data.can.status && a.police_status !== 'closed' && (
          <div>
            <div className="label">Update progress</div>
            <div className="flex flex-wrap gap-2">
              {(['en_route', 'on_scene', 'closed'] as const).map((s) => (
                <button key={s} className={`btn ${s === 'closed' ? 'btn-secondary' : 'btn-primary'}`} disabled={!!busy || a.police_status === s}
                  onClick={() => (s !== 'closed' || confirm('Close this case?')) && run(s, () => api(`/api/police/alerts/${id}/status`, { body: { status: s } }))}>
                  {s === 'en_route' ? 'En route' : s === 'on_scene' ? 'On scene' : 'Close case'}
                </button>
              ))}
            </div>
          </div>
        )}

        {data.can.escalate && a.police_status !== 'closed' && (
          <div>
            <div className="label">Escalate</div>
            <button className="btn btn-secondary" disabled={!!busy}
              onClick={() => confirm(`Escalate this case to ${a.police_level === 'post' ? 'regional HQ' : 'headquarters'}?`) &&
                run('escalate', () => api(`/api/police/alerts/${id}/escalate`, { method: 'POST' }))}>
              Escalate to {a.police_level === 'post' ? 'regional HQ' : 'headquarters'}
            </button>
          </div>
        )}
      </div>
    </>
  );
}
