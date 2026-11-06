'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { api } from '@/lib/api';
import { usePoll } from '@/lib/use-poll';
import { useEstate } from './estate-context';

const NAV = [
  { href: '/', label: 'Overview', icon: '◎' },
  { href: '/estates', label: 'Estates & residents', icon: '⌂' },
  { href: '/visitors', label: 'Visitor log', icon: '☰' },
  { href: '/sos', label: 'SOS alerts', icon: '⚠' },
];

export function Shell({ name, children }: { name: string; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { estates, current, setCurrent, appRole } = useEstate();
  const [openAlerts, setOpenAlerts] = useState(0);

  // Open SOS count for the sidebar badge, refreshed every 10 seconds.
  usePoll(async () => {
    if (!current) return;
    const o = await api<{ openSos: number }>(`/api/estates/${current.estate.id}/overview`).catch(() => null);
    if (o) setOpenAlerts(o.openSos);
  }, 10_000, [current?.estate.id]);

  const nav = appRole === 'super_admin' ? [...NAV, { href: '/admin/police', label: 'Police stations', icon: '✚' }] : NAV;

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[260px_1fr]">
      <aside className="border-b border-line bg-surface px-4 py-4 lg:sticky lg:top-0 lg:h-screen lg:border-b-0 lg:border-r lg:py-6">
        <div className="mb-4 flex items-center gap-3 px-2">
          <div className="grid size-10 place-items-center rounded-2xl bg-gradient-to-br from-[#10B981] to-[#064E3B] text-lg text-white shadow-lg shadow-emerald-900/30">🛡️</div>
          <div>
            <div className="text-lg font-black tracking-tight">SafeNest</div>
            <div className="text-xs text-muted">{name}</div>
          </div>
        </div>

        {estates.length > 0 && (
          <select className="input mb-4 text-sm" value={current?.estate.id ?? ''} onChange={(e) => setCurrent(e.target.value)}>
            {estates.map((e) => <option key={e.estate.id} value={e.estate.id}>{e.estate.name}</option>)}
          </select>
        )}

        <nav className="flex gap-1 overflow-x-auto lg:flex-col">
          {nav.map((n) => {
            const active = n.href === '/' ? pathname === '/' : pathname.startsWith(n.href);
            return (
              <Link key={n.href} href={n.href}
                className={`flex shrink-0 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                  active ? 'bg-surface-2 text-brand-deep' : 'text-muted hover:bg-surface-2/60'}`}>
                <span className="w-4 text-center">{n.icon}</span>
                {n.label}
                {n.href === '/sos' && openAlerts > 0 && (
                  <span className="sos-live ml-auto rounded-full bg-sos px-2 py-0.5 text-xs text-white">{openAlerts}</span>
                )}
              </Link>
            );
          })}
        </nav>

        <button className="btn btn-secondary mt-6 hidden w-full lg:flex"
          onClick={async () => { await api('/api/auth/logout', { method: 'POST' }).catch(() => {}); router.replace('/login'); router.refresh(); }}>
          Sign out
        </button>
      </aside>
      <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-8 lg:py-10">{children}</main>
    </div>
  );
}

export function PageTitle({ title, sub, action }: { title: string; sub?: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-black tracking-tight sm:text-3xl">{title}</h1>
        {sub && <p className="mt-1 text-muted">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

export function Badge({ children, tone = 'green' }: { children: ReactNode; tone?: 'green' | 'amber' | 'red' | 'grey' }) {
  const cls = {
    green: 'bg-surface-2 text-brand-deep',
    amber: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
    red: 'bg-red-600/12 text-sos',
    grey: 'bg-line/60 text-muted',
  }[tone];
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold uppercase ${cls}`}>{children}</span>;
}

export function NoEstate() {
  return (
    <div className="card p-8 text-center">
      <p className="text-lg font-bold">No estate yet</p>
      <p className="mt-1 text-muted">Register your estate to start adding units, residents and guards.</p>
      <Link href="/estates" className="btn btn-primary mt-5">Register an estate</Link>
    </div>
  );
}
