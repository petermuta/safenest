'use client';

import { useCallback, useEffect, useState } from 'react';
import { useEstate } from '@/components/estate-context';
import { Badge, PageTitle } from '@/components/shell';
import { api, errorMessage } from '@/lib/api';

type Level = 'post' | 'regional' | 'headquarters';
interface Unit {
  id: string; name: string; level: Level; parent_id: string | null; parent_name: string | null;
  district: string | null; phone: string; lat: number; lng: number; active: boolean; officers: number;
}

const LEVEL_LABEL: Record<Level, string> = { post: 'Police post', regional: 'Regional HQ', headquarters: 'Headquarters' };
const PARENT_LEVEL: Record<Level, Level | null> = { post: 'regional', regional: 'headquarters', headquarters: null };
const blank = { name: '', level: 'post' as Level, parent_id: '', district: '', phone: '', lat: '', lng: '' };

export default function PoliceUnitsPage() {
  const { appRole } = useEstate();
  const [rows, setRows] = useState<Unit[]>([]);
  const [form, setForm] = useState(blank);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const data = await api<Unit[]>('/api/admin/police').catch(() => null);
    if (data) setRows(data);
  }, []);
  useEffect(() => { load(); }, [load]);

  if (appRole !== 'super_admin') return <p className="text-muted">Only the SafeNest super admin manages police units.</p>;

  const parentLevel = PARENT_LEVEL[form.level];
  const parents = rows.filter((r) => r.level === parentLevel && r.active);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    try {
      await api('/api/admin/police', {
        body: { ...form, parent_id: form.parent_id || null, district: form.district || null, lat: Number(form.lat), lng: Number(form.lng) },
      });
      setForm({ ...blank, level: form.level, parent_id: form.parent_id });
      load();
    } catch (x) {
      setErr(errorMessage(x));
    }
  };

  const patch = async (id: string, b: Record<string, unknown>) => {
    await api(`/api/admin/police/${id}`, { method: 'PATCH', body: b }).catch((x) => alert(errorMessage(x)));
    load();
  };

  return (
    <>
      <PageTitle title="Police units"
        sub="SOS alerts go to the nearest active post. Posts report to a regional HQ; regional HQs report to headquarters. Verify every phone number before adding it." />

      <form onSubmit={add} className="card mb-6 grid gap-4 p-6 sm:grid-cols-4">
        <div>
          <label className="label">Level</label>
          <select className="input" value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value as Level, parent_id: '' })}>
            <option value="post">Police post</option>
            <option value="regional">Regional HQ</option>
            <option value="headquarters">Headquarters</option>
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="label">Name</label>
          <input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Kira Division Police Post" />
        </div>
        <div>
          <label className="label">Reports to</label>
          <select className="input" value={form.parent_id} disabled={!parentLevel} onChange={(e) => setForm({ ...form, parent_id: e.target.value })}>
            <option value="">{parentLevel ? `Choose ${LEVEL_LABEL[parentLevel]}…` : '— (top level)'}</option>
            {parents.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">District</label>
          <input className="input" value={form.district} onChange={(e) => setForm({ ...form, district: e.target.value })} />
        </div>
        <div>
          <label className="label">Phone (+256…)</label>
          <input className="input" required value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </div>
        <div>
          <label className="label">Latitude</label>
          <input className="input" required value={form.lat} onChange={(e) => setForm({ ...form, lat: e.target.value })} />
        </div>
        <div>
          <label className="label">Longitude</label>
          <input className="input" required value={form.lng} onChange={(e) => setForm({ ...form, lng: e.target.value })} />
        </div>
        {err && <p className="text-sm text-sos sm:col-span-4">{err}</p>}
        <div className="sm:col-span-4"><button className="btn btn-primary">Add unit</button></div>
      </form>

      <div className="card divide-y divide-line">
        {rows.map((u) => (
          <div key={u.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <div className="font-semibold">{u.name} <span className="text-xs font-normal text-muted">· {LEVEL_LABEL[u.level]}</span></div>
              <div className="text-sm text-muted">
                {u.district ? `${u.district} · ` : ''}{u.phone} · {u.officers} officer{u.officers === 1 ? '' : 's'}
                {u.level !== 'headquarters' && <> · reports to {u.parent_name ?? <span className="text-amber-700">nobody yet</span>}</>}
              </div>
            </div>
            {u.level !== 'headquarters' && (
              <select className="input w-auto py-1.5 text-sm" value={u.parent_id ?? ''}
                onChange={(e) => patch(u.id, { parent_id: e.target.value || null })}>
                <option value="">Reports to…</option>
                {rows.filter((r) => r.level === PARENT_LEVEL[u.level]).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            )}
            <Badge tone={u.active ? 'green' : 'grey'}>{u.active ? 'active' : 'off'}</Badge>
            <button className="text-sm font-semibold text-brand-deep" onClick={() => patch(u.id, { active: !u.active })}>
              {u.active ? 'Disable' : 'Enable'}
            </button>
          </div>
        ))}
        {!rows.length && <p className="p-4 text-muted">No units yet. Start with headquarters, then regional HQs, then posts.</p>}
      </div>
    </>
  );
}
