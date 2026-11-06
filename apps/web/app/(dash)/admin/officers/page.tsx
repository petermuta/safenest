'use client';

import { formatUgPhone } from '@safenest/shared';
import { useCallback, useEffect, useState } from 'react';
import { useEstate } from '@/components/estate-context';
import { Badge, PageTitle } from '@/components/shell';
import { api, errorMessage } from '@/lib/api';

interface Officer {
  id: string; full_name: string; phone: string; badge_no: string | null; role: string; on_duty: boolean; active: boolean;
  station_name: string; station_level: string; signed_in: boolean;
}
interface Unit { id: string; name: string; level: 'post' | 'regional' | 'headquarters'; active: boolean }

const blank = { station_id: '', phone: '', full_name: '', badge_no: '', role: 'officer' };

export default function OfficersPage() {
  const { appRole } = useEstate();
  const [rows, setRows] = useState<Officer[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [form, setForm] = useState(blank);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [o, u] = await Promise.all([api<Officer[]>('/api/admin/officers').catch(() => null), api<Unit[]>('/api/admin/police').catch(() => null)]);
    if (o) setRows(o);
    if (u) setUnits(u.filter((x) => x.active));
  }, []);
  useEffect(() => { load(); }, [load]);

  if (appRole !== 'super_admin') return <p className="text-muted">Only the SafeNest super admin manages police officers.</p>;

  const unit = units.find((u) => u.id === form.station_id);
  const roles = unit?.level === 'post' ? [['officer', 'Officer'], ['dispatcher', 'Dispatcher']] : [['commander', 'Commander']];

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    try {
      await api('/api/admin/officers', { body: form });
      setForm({ ...blank, station_id: form.station_id, role: form.role });
      load();
    } catch (x) {
      setErr(errorMessage(x));
    }
  };

  const patch = async (id: string, b: Record<string, unknown>) => {
    await api(`/api/admin/officers/${id}`, { method: 'PATCH', body: b }).catch((x) => alert(errorMessage(x)));
    load();
  };

  return (
    <>
      <PageTitle title="Police officers"
        sub="Each officer signs in with their own phone number. Dispatchers run a post; commanders run a regional HQ or headquarters." />

      <form onSubmit={add} className="card mb-6 grid gap-4 p-6 sm:grid-cols-3">
        <div>
          <label className="label">Unit</label>
          <select className="input" required value={form.station_id}
            onChange={(e) => {
              const u = units.find((x) => x.id === e.target.value);
              setForm({ ...form, station_id: e.target.value, role: u?.level === 'post' ? 'officer' : 'commander' });
            }}>
            <option value="">Choose unit…</option>
            {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Role</label>
          <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            {roles.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Badge / force number</label>
          <input className="input" value={form.badge_no} onChange={(e) => setForm({ ...form, badge_no: e.target.value })} />
        </div>
        <div>
          <label className="label">Full name</label>
          <input className="input" required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
        </div>
        <div>
          <label className="label">Phone</label>
          <input className="input" required value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="0772 123 456" />
        </div>
        <div className="flex items-end"><button className="btn btn-primary w-full">Add officer</button></div>
        {err && <p className="text-sm text-sos sm:col-span-3">{err}</p>}
      </form>

      <div className="card divide-y divide-line">
        {rows.map((o) => (
          <div key={o.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <div className="font-semibold">{o.full_name}{o.badge_no ? <span className="font-normal text-muted"> · {o.badge_no}</span> : null}</div>
              <div className="text-sm text-muted">{formatUgPhone(o.phone)} · {o.station_name} · {o.role}</div>
            </div>
            {!o.signed_in && <Badge tone="grey">not signed in yet</Badge>}
            {o.on_duty && o.active && <Badge tone="green">on duty</Badge>}
            <Badge tone={o.active ? 'green' : 'red'}>{o.active ? 'active' : 'deactivated'}</Badge>
            <button className="text-sm font-semibold text-brand-deep" onClick={() => patch(o.id, { active: !o.active })}>
              {o.active ? 'Deactivate' : 'Reactivate'}
            </button>
          </div>
        ))}
        {!rows.length && <p className="p-4 text-muted">No officers yet. Add police units first, then their officers.</p>}
      </div>
    </>
  );
}
