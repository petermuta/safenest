'use client';

import { useState } from 'react';
import { useEstate } from '@/components/estate-context';
import { Badge, NoEstate, PageTitle } from '@/components/shell';
import { api, errorMessage } from '@/lib/api';
import { usePoll } from '@/lib/use-poll';

interface Alert {
  id: string; category: string; message: string; status: string; created_at: string; author: string;
  estate_name: string | null; distance_km: number; see_it_too: number; all_clear: number; reports: number;
  has_photo: boolean; sent_to_police: boolean; can_moderate: boolean;
}

const CAT: Record<string, string> = {
  suspicious_person: 'Suspicious person', suspicious_vehicle: 'Suspicious vehicle', break_in: 'Break-in',
  fire: 'Fire', accident: 'Accident', noise: 'Disturbance', other: 'Other',
};

export default function CommunityModeration() {
  const { current, estates, loaded } = useEstate();
  const [rows, setRows] = useState<Alert[]>([]);

  const load = async () => {
    if (!current?.estate.lat || !current.estate.lng) return;
    const d = await api<{ alerts: Alert[] }>(`/api/community?lat=${current.estate.lat}&lng=${current.estate.lng}`).catch(() => null);
    if (d) setRows(d.alerts);
  };
  usePoll(load, 20_000, [current?.estate.id]);

  const setStatus = async (id: string, status: string) => {
    try {
      await api(`/api/community/${id}/remove`, { body: { status } });
      load();
    } catch (e) {
      alert(errorMessage(e));
    }
  };

  if (!loaded) return null;
  if (!estates.length) return <NoEstate />;

  return (
    <>
      <PageTitle title="Community alerts" sub="Posts from residents within 1 km of this estate, last 3 days. Police only see posts a resident sends to them." />
      {!current?.estate.lat && <div className="card p-5 text-muted">Set this estate’s location (on the Estates page) to see nearby alerts.</div>}
      {current?.estate.lat && !rows.length && <div className="card p-5 text-muted">No community alerts nearby.</div>}
      <div className="grid gap-3">
        {rows.map((a) => (
          <div key={a.id} className={`card p-4 ${a.status === 'removed' ? 'opacity-60' : ''}`}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-bold">{CAT[a.category] ?? a.category}</span>
              {a.status !== 'open' && <Badge tone="grey">{a.status}</Badge>}
              {a.reports > 0 && <Badge tone={a.reports >= 3 ? 'red' : 'amber'}>{a.reports} report{a.reports > 1 ? 's' : ''}{a.reports >= 3 ? ' · hidden' : ''}</Badge>}
              {a.sent_to_police && <Badge tone="red">sent to police</Badge>}
            </div>
            <p className="mt-1">{a.message}</p>
            {a.has_photo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/api/community/${a.id}/photo`} alt="" className="mt-2 max-h-48 rounded-xl object-cover" />
            )}
            <div className="mt-2 text-sm text-muted">
              {a.author}{a.estate_name ? ` (${a.estate_name})` : ''} · {new Date(a.created_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
              {' · '}{a.distance_km < 1 ? `${Math.round(a.distance_km * 1000)} m away` : `${a.distance_km} km away`}
              {' · '}👀 {a.see_it_too} · ✓ {a.all_clear}
            </div>
            {a.can_moderate && (
              <div className="mt-3 flex gap-2">
                {a.status !== 'removed'
                  ? <button className="btn btn-secondary py-1.5 text-sm" onClick={() => confirm('Remove this post for everyone?') && setStatus(a.id, 'removed')}>Remove</button>
                  : <button className="btn btn-secondary py-1.5 text-sm" onClick={() => setStatus(a.id, 'open')}>Restore</button>}
                {a.reports > 0 && a.status !== 'removed' && (
                  <button className="btn btn-secondary py-1.5 text-sm" onClick={() => setStatus(a.id, 'open')}>Keep (clear reports)</button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
