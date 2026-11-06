'use client';

import type { PoliceStation } from '@safenest/shared';
import { useCallback, useEffect, useState } from 'react';
import { useEstate } from '@/components/estate-context';
import { Badge, PageTitle } from '@/components/shell';
import { api, errorMessage } from '@/lib/api';

const blank = { name: '', district: '', phone: '', lat: '', lng: '' };

export default function PolicePage() {
  const { appRole } = useEstate();
  const [rows, setRows] = useState<PoliceStation[]>([]);
  const [form, setForm] = useState(blank);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const data = await api<PoliceStation[]>('/api/admin/police').catch(() => null);
    if (data) setRows(data);
  }, []);
  useEffect(() => { load(); }, [load]);

  if (appRole !== 'super_admin') return <p className="text-muted">Only the SafeNest super admin manages police stations.</p>;

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    const phone = form.phone.replace(/[^\d+]/g, '');
    if (!/^\+256\d{9}$/.test(phone)) return setErr('Phone must be +256 followed by 9 digits');
    try {
      await api('/api/admin/police', { body: { name: form.name, district: form.district || null, phone, lat: Number(form.lat), lng: Number(form.lng) } });
      setForm(blank);
      load();
    } catch (e) {
      setErr(errorMessage(e));
    }
  };

  const toggle = async (s: PoliceStation) => {
    await api(`/api/admin/police/${s.id}`, { method: 'PATCH', body: { active: !s.active } }).catch((e) => alert(errorMessage(e)));
    load();
  };

  return (
    <>
      <PageTitle title="Police stations" sub="SOS alerts SMS the nearest active station. Verify every number with the station before adding it." />

      <form onSubmit={add} className="card mb-6 grid gap-4 p-6 sm:grid-cols-5">
        {(['name', 'district', 'phone', 'lat', 'lng'] as const).map((k) => (
          <div key={k}>
            <label className="label">{{ name: 'Station', district: 'District', phone: 'Phone (+256…)', lat: 'Latitude', lng: 'Longitude' }[k]}</label>
            <input className="input" required={k !== 'district'} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
          </div>
        ))}
        {err && <p className="text-sm text-sos sm:col-span-5">{err}</p>}
        <div className="sm:col-span-5"><button className="btn btn-primary">Add station</button></div>
      </form>

      <div className="card divide-y divide-line">
        {rows.map((s) => (
          <div key={s.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <div className="font-semibold">{s.name}</div>
              <div className="text-sm text-muted">{s.district} · {s.phone} · {s.lat.toFixed(4)}, {s.lng.toFixed(4)}</div>
            </div>
            <Badge tone={s.active ? 'green' : 'grey'}>{s.active ? 'active' : 'off'}</Badge>
            <button className="text-sm font-semibold text-brand-deep" onClick={() => toggle(s)}>{s.active ? 'Disable' : 'Enable'}</button>
          </div>
        ))}
        {!rows.length && <p className="p-4 text-muted">No stations yet.</p>}
      </div>
    </>
  );
}
