'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

interface Row {
  id: string;
  created_at: string;
  action: string;
  alert_id: string | null;
  detail: Record<string, unknown> | null;
  officer: string | null;
  unit: string | null;
  subject: string | null;
}

const ACTION: Record<string, string> = {
  view_alert: 'Opened case',
  assign: 'Dispatched officer',
  escalate: 'Escalated',
  status: 'Updated status',
  reveal_nin: 'Viewed full NIN',
  nin_search: 'Searched by NIN',
  view_selfie: 'Viewed resident photo',
  nin_search_blocked: 'NIN search blocked (daily limit)',
  reset_pin: 'PIN reset by admin',
  duty_on: 'Signed on duty',
  duty_off: 'Signed off duty',
};

function describe(r: Row) {
  const d = r.detail ?? {};
  if (r.action === 'assign') return `→ ${d.officer}`;
  if (r.action === 'escalate') return `→ ${d.to}${d.unit ? ` (${d.unit})` : ''}`;
  if (r.action === 'status') return `→ ${String(d.status).replace('_', ' ')}`;
  if (r.action === 'nin_search') return `${d.found ? 'match' : 'no match'} · ••••${d.nin_last4} · "${d.reason}"`;
  return '';
}

interface Unusual { officer: string; unit: string | null; searches: number; reveals: number; blocked: number }

export default function AuditLog() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [unusual, setUnusual] = useState<Unusual[]>([]);
  useEffect(() => {
    api<{ entries: Row[]; unusual: Unusual[] }>('/api/police/audit')
      .then((d) => { setRows(d.entries); setUnusual(d.unusual); })
      .catch(() => setRows([]));
  }, []);

  return (
    <>
      <h1 className="text-2xl font-black tracking-tight">Audit log</h1>
      <p className="mt-1 text-muted">Every police action on resident data. Commanders see their unit and the units under it.</p>
      {unusual.length > 0 && (
        <div className="card mt-5 border-amber-400/60 p-4">
          <div className="font-bold text-amber-700 dark:text-amber-400">Unusual activity in the last 24 hours</div>
          <p className="text-sm text-muted">High numbers of NIN searches or reveals can mean misuse. Check each one has a genuine case reason.</p>
          <ul className="mt-2 space-y-1 text-sm">
            {unusual.map((u) => (
              <li key={u.officer + u.unit}>
                <b>{u.officer}</b>{u.unit ? ` (${u.unit})` : ''}: {u.searches} searches, {u.reveals} full-NIN views
                {u.blocked ? `, ${u.blocked} blocked by the daily limit` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="card mt-5 overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-line text-xs uppercase text-muted">
            <tr>{['When', 'Officer', 'Unit', 'Action', 'Resident', ''].map((h) => <th key={h} className="px-4 py-3">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows?.map((r) => (
              <tr key={r.id}>
                <td className="whitespace-nowrap px-4 py-2 text-muted">{new Date(r.created_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                <td className="px-4 py-2 font-semibold">{r.officer ?? 'Admin'}</td>
                <td className="px-4 py-2">{r.unit ?? '—'}</td>
                <td className="px-4 py-2">{ACTION[r.action] ?? r.action} <span className="text-muted">{describe(r)}</span></td>
                <td className="px-4 py-2">{r.subject ?? '—'}</td>
                <td className="px-4 py-2">{r.alert_id && <Link className="text-brand-deep underline" href={`/police/alerts/${r.alert_id}`}>case</Link>}</td>
              </tr>
            ))}
            {rows && !rows.length && <tr><td colSpan={6} className="px-4 py-8 text-center text-muted">Nothing recorded yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
