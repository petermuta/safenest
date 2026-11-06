'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useEstate } from '@/components/estate-context';
import { Badge, PageTitle } from '@/components/shell';
import { api, errorMessage } from '@/lib/api';

export default function EstatesPage() {
  const router = useRouter();
  const { estates, loaded, reload, setCurrent, appRole } = useEstate();
  const [form, setForm] = useState({ name: '', district: '', address: '', lat: '', lng: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const useMyLocation = () =>
    navigator.geolocation?.getCurrentPosition((p) =>
      setForm((f) => ({ ...f, lat: p.coords.latitude.toFixed(6), lng: p.coords.longitude.toFixed(6) })));

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const estate = await api<{ id: string }>('/api/estates', {
        body: {
          name: form.name,
          district: form.district || null,
          address: form.address || null,
          lat: form.lat ? Number(form.lat) : null,
          lng: form.lng ? Number(form.lng) : null,
        },
      });
      await reload();
      setCurrent(estate.id);
      router.push(`/estates/${estate.id}`);
    } catch (e) {
      setErr(errorMessage(e));
      setBusy(false);
    }
  };

  return (
    <>
      <PageTitle
        title="Estates"
        sub="Register estates, then add units, residents and guards"
        action={appRole !== 'guard' && <button className="btn btn-primary" onClick={() => setShowForm((v) => !v)}>+ Register estate</button>}
      />

      {(showForm || (loaded && estates.length === 0)) && (
        <form onSubmit={create} className="card mb-6 grid gap-4 p-6 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="label">Estate name</label>
            <input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Kira Gardens Estate" />
          </div>
          <div>
            <label className="label">District</label>
            <input className="input" value={form.district} onChange={(e) => setForm({ ...form, district: e.target.value })} placeholder="Wakiso" />
          </div>
          <div>
            <label className="label">Address / landmark</label>
            <input className="input" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Off Kira Road, near…" />
          </div>
          <div>
            <label className="label">Latitude</label>
            <input className="input" value={form.lat} onChange={(e) => setForm({ ...form, lat: e.target.value })} placeholder="0.3972" />
          </div>
          <div>
            <label className="label">Longitude</label>
            <input className="input" value={form.lng} onChange={(e) => setForm({ ...form, lng: e.target.value })} placeholder="32.6398" />
          </div>
          <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
            <button type="button" className="btn btn-secondary" onClick={useMyLocation}>Use my location</button>
            <span className="text-sm text-muted">The estate pin is used if a resident's phone can't get GPS during an SOS.</span>
          </div>
          {err && <p className="text-sm text-sos sm:col-span-2">{err}</p>}
          <div className="sm:col-span-2">
            <button className="btn btn-primary" disabled={busy}>{busy ? 'Creating…' : 'Create estate'}</button>
          </div>
        </form>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {estates.map(({ estate, role }) => (
          <Link key={estate.id} href={`/estates/${estate.id}`} className="card p-5 transition hover:-translate-y-0.5">
            <div className="flex items-start justify-between gap-3">
              <div className="text-lg font-bold">{estate.name}</div>
              <Badge tone={estate.subscription_status === 'active' ? 'green' : 'amber'}>{estate.subscription_status}</Badge>
            </div>
            <div className="mt-1 text-sm text-muted">{[estate.district, estate.address].filter(Boolean).join(' · ') || 'No address yet'}</div>
            <div className="mt-3 text-xs font-semibold uppercase text-muted">You are {role}</div>
          </Link>
        ))}
      </div>
    </>
  );
}
