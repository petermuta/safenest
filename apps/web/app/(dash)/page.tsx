'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useEstate } from '@/components/estate-context';
import { Badge, NoEstate, PageTitle } from '@/components/shell';
import { createClient } from '@/lib/supabase/client';

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
  const supabase = createClient();
  const { current, estates } = useEstate();
  const [s, setS] = useState<Stats | null>(null);

  useEffect(() => {
    if (!current) return;
    const id = current.estate.id;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const c = (q: PromiseLike<{ count: number | null }>) => Promise.resolve(q).then((r) => r.count ?? 0);
    Promise.all([
      c(supabase.from('units').select('id', { count: 'exact', head: true }).eq('estate_id', id)),
      c(supabase.from('memberships').select('id', { count: 'exact', head: true }).eq('estate_id', id).eq('role', 'resident').eq('active', true)),
      c(supabase.from('memberships').select('id', { count: 'exact', head: true }).eq('estate_id', id).eq('role', 'guard').eq('active', true)),
      c(supabase.from('visitor_logs').select('id', { count: 'exact', head: true }).eq('estate_id', id).gte('entry_at', today.toISOString())),
      c(supabase.from('visitor_logs').select('id', { count: 'exact', head: true }).eq('estate_id', id).is('exit_at', null).gte('entry_at', new Date(Date.now() - 86400000).toISOString())),
      c(supabase.from('sos_alerts').select('id', { count: 'exact', head: true }).eq('estate_id', id).in('status', ['active', 'acknowledged'])),
      c(supabase.from('invitations').select('id', { count: 'exact', head: true }).eq('estate_id', id).is('accepted_at', null)),
    ]).then(([units, residents, guards, visitorsToday, insideNow, openSos, pendingInvites]) =>
      setS({ units, residents, guards, visitorsToday, insideNow, openSos, pendingInvites }));
  }, [current, supabase]);

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
