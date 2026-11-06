'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import { LEVEL_LABEL, POLICE_STATUS } from '@/components/police-shell';
import { Badge } from '@/components/shell';
import { api } from '@/lib/api';
import { usePoll } from '@/lib/use-poll';

interface Row {
  id: string;
  created_at: string;
  status: string;
  police_status: string;
  police_level: 'post' | 'regional' | 'headquarters';
  source: string;
  resident_name: string | null;
  estate_name: string;
  unit_label: string | null;
  post_name: string | null;
  assigned_officer: string | null;
}

const fmt = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

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

export default function PoliceAlerts() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const seen = useRef<Set<string> | null>(null);

  // Checks every 5 seconds; beeps when a new case reaches this unit.
  usePoll(async () => {
    const data = await api<Row[]>('/api/police/alerts').catch(() => null);
    if (!data) return;
    if (seen.current && data.some((r) => r.police_status !== 'closed' && !seen.current!.has(r.id))) beep();
    seen.current = new Set(data.map((r) => r.id));
    setRows(data);
  }, 5_000, []);

  const open = rows?.filter((r) => r.police_status !== 'closed') ?? [];
  const closed = rows?.filter((r) => r.police_status === 'closed') ?? [];

  return (
    <>
      <div className="mb-5">
        <h1 className="text-2xl font-black tracking-tight">SOS cases</h1>
        <p className="text-muted">Updates every 5 seconds. Keep this page open on the duty desk.</p>
      </div>

      {rows === null && <p className="text-muted">Loading…</p>}
      {rows && !open.length && <div className="card p-6 text-center text-muted">No open cases for your unit.</div>}

      <div className="grid gap-3">
        {open.map((r) => {
          const st = POLICE_STATUS[r.police_status] ?? POLICE_STATUS.new;
          return (
            <Link key={r.id} href={`/police/alerts/${r.id}`}
              className={`card block p-4 transition hover:-translate-y-0.5 ${r.police_status === 'new' ? 'sos-live border-sos/60' : ''}`}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-lg font-bold">{r.estate_name}{r.unit_label ? ` · Unit ${r.unit_label}` : ''}</span>
                <Badge tone={st.tone}>{st.label}</Badge>
                {r.police_level !== 'post' && <Badge tone="amber">Escalated: {LEVEL_LABEL[r.police_level]}</Badge>}
                {r.source === 'community' && <Badge tone="grey">From community alert</Badge>}
              </div>
              <div className="mt-1 text-sm text-muted">
                {fmt(r.created_at)} · {r.resident_name ?? 'Resident'} · {r.post_name}
                {r.assigned_officer ? ` · Assigned: ${r.assigned_officer}` : ''}
              </div>
            </Link>
          );
        })}
      </div>

      {closed.length > 0 && (
        <div className="card mt-8 divide-y divide-line">
          <div className="px-4 py-3 font-bold">Closed (last 7 days)</div>
          {closed.map((r) => (
            <Link key={r.id} href={`/police/alerts/${r.id}`} className="flex flex-wrap items-center gap-2 px-4 py-3 text-sm">
              <span className="w-36 text-muted">{fmt(r.created_at)}</span>
              <span className="flex-1 font-semibold">{r.estate_name}{r.unit_label ? ` · ${r.unit_label}` : ''}</span>
              <span className="text-muted">{r.assigned_officer ?? ''}</span>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
