'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { api, errorMessage } from '@/lib/api';

export interface PoliceOfficer {
  id: string;
  full_name: string;
  role: 'officer' | 'dispatcher' | 'commander';
  on_duty: boolean;
  badge_no: string | null;
  station_name: string;
  station_level: 'post' | 'regional' | 'headquarters';
}

const LEVEL = { post: 'Police post', regional: 'Regional HQ', headquarters: 'Headquarters' } as const;
const ROLE = { officer: 'Officer', dispatcher: 'Dispatcher', commander: 'Commander' } as const;

export function PoliceShell({ officer, children }: { officer: PoliceOfficer; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [onDuty, setOnDuty] = useState(officer.on_duty);
  const [busy, setBusy] = useState(false);

  const toggleDuty = async () => {
    setBusy(true);
    try {
      const r = await api<{ on_duty: boolean }>('/api/police/duty', { body: { on_duty: !onDuty } });
      setOnDuty(r.on_duty);
    } catch (e) {
      alert(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const nav = [
    { href: '/police', label: 'Alerts' },
    { href: '/police/search', label: 'NIN search' },
    { href: '/police/audit', label: 'Audit log' },
  ];

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3 px-4 py-3">
          <div className="grid size-10 place-items-center rounded-2xl bg-gradient-to-br from-[#1F2937] to-[#064E3B] text-lg text-white">🚓</div>
          <div className="min-w-0 flex-1">
            <div className="truncate font-black tracking-tight">SafeNest Police</div>
            <div className="truncate text-xs text-muted">
              {officer.full_name}{officer.badge_no ? ` · ${officer.badge_no}` : ''} · {ROLE[officer.role]}, {officer.station_name} ({LEVEL[officer.station_level]})
            </div>
          </div>
          <button
            onClick={toggleDuty}
            disabled={busy}
            className={`btn ${onDuty ? 'btn-primary' : 'btn-secondary'} px-3 py-2 text-sm`}
            title="Only on-duty officers can be dispatched"
          >
            {onDuty ? '● On duty' : '○ Off duty'}
          </button>
        </div>
        <nav className="mx-auto flex max-w-5xl gap-1 overflow-x-auto px-4 pb-2">
          {nav.map((n) => {
            const active = n.href === '/police' ? pathname === '/police' || pathname.startsWith('/police/alerts') : pathname.startsWith(n.href);
            return (
              <Link key={n.href} href={n.href}
                className={`shrink-0 rounded-xl px-3 py-2 text-sm font-semibold ${active ? 'bg-surface-2 text-brand-deep' : 'text-muted'}`}>
                {n.label}
              </Link>
            );
          })}
          <button className="ml-auto shrink-0 px-3 py-2 text-sm font-semibold text-muted"
            onClick={async () => { await api('/api/auth/logout', { method: 'POST' }).catch(() => {}); router.replace('/login'); }}>
            Sign out
          </button>
        </nav>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}

export const POLICE_STATUS: Record<string, { label: string; tone: 'red' | 'amber' | 'green' | 'grey' }> = {
  new: { label: 'New — not assigned', tone: 'red' },
  assigned: { label: 'Officer assigned', tone: 'amber' },
  en_route: { label: 'Officer en route', tone: 'amber' },
  on_scene: { label: 'Officer on scene', tone: 'green' },
  closed: { label: 'Closed', tone: 'grey' },
};
export const LEVEL_LABEL = LEVEL;
