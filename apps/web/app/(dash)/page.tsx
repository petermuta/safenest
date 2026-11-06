'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useEstate } from '@/components/estate-context';
import { Badge, NoEstate, PageTitle } from '@/components/shell';
import { api } from '@/lib/api';
import { usePoll } from '@/lib/use-poll';

interface Stats {
  units: number;
  residents: number;
  guards: number;
  visitorsToday: number;
  insideNow: number;
  openSos: number;
  pendingInvites: number;
}

export default function Overview() {
  const { current, estates, loaded } = useEstate();
  const [s, setS] = useState<Stats | null>(null);

  usePoll(async () => {
    if (!current) return;
    const since = new Date(new Date().setHours(0, 0, 0, 0)).toISOString();
    const o = await api<Stats>(`/api/estates/${current.estate.id}/overview?since=${encodeURIComponent(since)}`).catch(() => null);
    if (o) setS(o);
  }, 15_000, [current?.estate.id]);

  if (!loaded) return null;
  if (!estates.length) return <><PageTitle title="Welcome to SafeNest" /><NoEstate /></>;
  if (!current) return null;

  const sub = current.estate.subscription_status;
  const tiles = [
    { label: 'Units', value: s?.units, href: `/estates/${current.estate.id}` },
    { label: 'Residents', value: s?.residents, href: `/estates/${current.estate.id}`, note: s?.pendingInvites ? `${s.pendingInvites} not yet signed in` : undefined },
    { label: 'Guards', value: s?.guards, href: `/estates/${current.estate.id}` },
    { label: 'Visitors today', value: s?.visitorsToday, href: '/visitors', note: s ? `${s.insideNow} inside now` : undefined },
  ];

  return (
    <>
      <PageTitle
        title={current.estate.name}
        sub={[current.estate.district, current.estate.address].filter(Boolean).join(' · ') || undefined}
        action={<Badge tone={sub === 'active' ? 'green' : sub === 'trial' ? 'amber' : 'red'}>{sub.replace('_', ' ')}</Badge>}
      />

      {s && s.openSos > 0 && (
        <Link href="/sos" className="sos-live mb-6 flex items-center justify-between rounded-3xl bg-sos px-6 py-5 text-white">
          <div>
            <div className="text-sm font-bold opacity-90">SOS</div>
            <div className="text-xl font-black">{s.openSos} open alert{s.openSos > 1 ? 's' : ''} — respond now</div>
          </div>
          <span className="text-2xl">→</span>
        </Link>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {tiles.map((t) => (
          <Link key={t.label} href={t.href} className="card p-5 transition hover:-translate-y-0.5">
            <div className="text-sm font-semibold text-muted">{t.label}</div>
            <div className="mt-2 text-4xl font-black tracking-tight text-brand-deep">{t.value ?? '–'}</div>
            {t.note && <div className="mt-1 text-xs text-muted">{t.note}</div>}
          </Link>
        ))}
      </div>

      {!current.estate.gate_phone && current.role === 'manager' && (
        <div className="card mt-6 border-amber-400/50 p-5">
          <div className="font-bold text-amber-700 dark:text-amber-400">Add a gate phone number</div>
          <p className="mt-1 text-sm text-muted">
            If a resident has no data when they press SOS, the app opens an SMS to this number instead.{' '}
            <Link className="font-semibold text-brand-deep underline" href={`/estates/${current.estate.id}`}>Set it now</Link>
          </p>
        </div>
      )}
    </>
  );
}
