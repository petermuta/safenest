'use client';

import type { VisitorLog } from '@safenest/shared';
import { useCallback, useEffect, useState } from 'react';
import { useEstate } from '@/components/estate-context';
import { Badge, NoEstate, PageTitle } from '@/components/shell';
import { createClient } from '@/lib/supabase/client';

type Row = VisitorLog & { unit: { label: string } | null; guard: { full_name: string | null } | null };

const METHOD = { pass_qr: 'QR pass', pass_code: 'Code', walk_in: 'Walk-in' } as const;
const fmt = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export default function VisitorsPage() {
  const supabase = createClient();
  const { current, estates } = useEstate();
  const [rows, setRows] = useState<Row[]>([]);
  const [days, setDays] = useState(1);
  const [q, setQ] = useState('');

  const load = useCallback(async () => {
    if (!current) return;
    const since = new Date(Date.now() - days * 86400000).toISOString();
    const { data } = await supabase
      .from('visitor_logs')
      .select('*, unit:units(label), guard:profiles!visitor_logs_guard_id_fkey(full_name)')
      .eq('estate_id', current.estate.id)
      .gte('entry_at', since)
      .order('entry_at', { ascending: false })
      .limit(500);
    setRows((data as Row[]) ?? []);
  }, [current, days, supabase]);

  useEffect(() => {
    load();
    if (!current) return;
    const ch = supabase.channel(`web-visitors-${current.estate.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'visitor_logs', filter: `estate_id=eq.${current.estate.id}` }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load, current, supabase]);

  if (!estates.length) return <NoEstate />;

  const s = q.toLowerCase();
  const shown = rows.filter((r) => !s || r.guest_name.toLowerCase().includes(s) || r.vehicle_plate?.toLowerCase().includes(s) || r.unit?.label.toLowerCase().includes(s));

  const exportCsv = () => {
    const head = ['Guest', 'Phone', 'Vehicle', 'Unit', 'Method', 'Entry', 'Exit', 'Guard', 'Notes'];
    const lines = shown.map((r) => [r.guest_name, r.guest_phone ?? '', r.vehicle_plate ?? '', r.unit?.label ?? '', METHOD[r.method],
      r.entry_at, r.exit_at ?? '', r.guard?.full_name ?? '', r.notes ?? ''].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','));
    const url = URL.createObjectURL(new Blob([[head.join(','), ...lines].join('\n')], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `visitors-${current?.estate.name ?? 'estate'}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <PageTitle title="Visitor log" sub={`${shown.length} visits · ${shown.filter((r) => !r.exit_at).length} not checked out`}
        action={<button className="btn btn-secondary" onClick={exportCsv} disabled={!shown.length}>Export CSV</button>} />

      <div className="mb-4 flex flex-wrap gap-3">
        <select className="input w-auto" value={days} onChange={(e) => setDays(Number(e.target.value))}>
          <option value={1}>Last 24 hours</option>
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
        </select>
        <input className="input max-w-xs" placeholder="Search guest, plate or unit" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-line text-xs uppercase text-muted">
            <tr>{['Guest', 'Unit', 'Vehicle', 'How', 'In', 'Out', 'Guard'].map((h) => <th key={h} className="px-4 py-3 font-semibold">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-line">
            {shown.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-3"><div className="font-semibold">{r.guest_name}</div><div className="text-xs text-muted">{r.guest_phone}</div></td>
                <td className="px-4 py-3">{r.unit?.label ?? '—'}</td>
                <td className="px-4 py-3">{r.vehicle_plate ?? '—'}</td>
                <td className="px-4 py-3"><Badge tone={r.method === 'walk_in' ? 'amber' : 'green'}>{METHOD[r.method]}</Badge></td>
                <td className="px-4 py-3">{fmt(r.entry_at)}</td>
                <td className="px-4 py-3">{r.exit_at ? fmt(r.exit_at) : <Badge tone="grey">inside</Badge>}</td>
                <td className="px-4 py-3 text-muted">{r.guard?.full_name ?? '—'}</td>
              </tr>
            ))}
            {!shown.length && <tr><td colSpan={7} className="px-4 py-8 text-center text-muted">No visitors in this period.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
