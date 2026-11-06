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

export default function AuditLog() {
  const [rows, setRows] = useState<Row[] | null>(null);
  useEffect(() => { api<Row[]>('/api/police/audit').then(setRows).catch(() => setRows([])); }, []);

  return (
    <>
      <h1 className="text-2xl font-black tracking-tight">Audit log</h1>
      <p className="mt-1 text-muted">Every police action on resident data. Commanders see their unit and the units under it.</p>
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
