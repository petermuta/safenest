'use client';

import { formatUgPhone } from '@safenest/shared';
import Link from 'next/link';
import { useState } from 'react';
import { POLICE_STATUS } from '@/components/police-shell';
import { Badge } from '@/components/shell';
import { api, errorMessage } from '@/lib/api';

interface Result {
  found: boolean;
  person?: { id: string; full_name: string | null; phone: string; has_selfie: boolean };
  homes?: { estate: string; address: string | null; district: string | null; unit: string | null; role: string }[];
  alerts?: { id: string; created_at: string; police_status: string; can_open: boolean }[];
}

export default function NinSearch() {
  const [nin, setNin] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [res, setRes] = useState<Result | null>(null);

  const search = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    setRes(null);
    try {
      setRes(await api<Result>('/api/police/search', { body: { nin, reason } }));
    } catch (x) {
      setErr(errorMessage(x));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <h1 className="text-2xl font-black tracking-tight">Find a resident by NIN</h1>
      <p className="mt-1 text-muted">Exact NIN only. Every search is recorded in the audit log with your name and reason.</p>

      <form onSubmit={search} className="card mt-5 grid gap-4 p-5 sm:grid-cols-[1fr_1.4fr_auto] sm:items-end">
        <div>
          <label className="label" htmlFor="nin">NIN</label>
          <input id="nin" className="input font-mono uppercase" placeholder="CM12345678ABCD" maxLength={20}
            value={nin} onChange={(e) => setNin(e.target.value)} autoComplete="off" />
        </div>
        <div>
          <label className="label" htmlFor="reason">Reason for search</label>
          <input id="reason" className="input" placeholder="e.g. Identity check, case SOS-Kira 6 Nov"
            value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Searching…' : 'Search'}</button>
      </form>

      {err && <p className="mt-4 text-sm text-sos">{err}</p>}
      {res && !res.found && <div className="card mt-5 p-5 text-muted">No SafeNest resident is registered with that NIN.</div>}
      {res?.found && res.person && (
        <div className="card mt-5 p-5">
          <div className="flex flex-wrap gap-4">
            {res.person.has_selfie ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/api/identity/${res.person.id}/selfie`} alt="Registered photo" className="size-32 rounded-2xl object-cover" />
            ) : (
              <div className="grid size-32 place-items-center rounded-2xl bg-surface-2 text-xs text-muted">No photo</div>
            )}
            <div>
              <div className="text-xl font-bold">{res.person.full_name ?? 'Name not given'}</div>
              <a className="font-semibold text-brand-deep underline" href={`tel:${res.person.phone}`}>{formatUgPhone(res.person.phone)}</a>
              <div className="mt-3 space-y-1 text-sm">
                {res.homes?.map((h, i) => (
                  <div key={i}>{h.estate}{h.unit ? `, Unit ${h.unit}` : ''}{h.district ? ` · ${h.district}` : ''} <span className="text-muted">({h.role})</span></div>
                ))}
              </div>
            </div>
          </div>
          {!!res.alerts?.length && (
            <div className="mt-5">
              <div className="label">SOS history</div>
              <div className="space-y-1 text-sm">
                {res.alerts.map((a) => (
                  <div key={a.id} className="flex items-center gap-2">
                    <span className="text-muted">{new Date(a.created_at).toLocaleString('en-GB')}</span>
                    <Badge tone={POLICE_STATUS[a.police_status]?.tone ?? 'grey'}>{POLICE_STATUS[a.police_status]?.label ?? a.police_status}</Badge>
                    {a.can_open && <Link className="font-semibold text-brand-deep underline" href={`/police/alerts/${a.id}`}>Open</Link>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
