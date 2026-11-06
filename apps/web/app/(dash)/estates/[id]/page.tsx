'use client';

import { formatUgPhone, normalizeUgPhone, type Estate, type Invitation, type MemberRole, type Unit } from '@safenest/shared';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useEstate } from '@/components/estate-context';
import { Badge, PageTitle } from '@/components/shell';
import { api, errorMessage } from '@/lib/api';

interface MemberRow {
  id: string;
  role: MemberRole;
  unit_id: string | null;
  profile: { full_name: string | null; phone: string } | null;
  nin_masked?: string | null;
  has_selfie?: boolean;
}

/** "A1-A12, B1, B2" -> ["A1".."A12","B1","B2"] */
function expandUnits(input: string): string[] {
  const out: string[] = [];
  for (const part of input.split(',').map((p) => p.trim()).filter(Boolean)) {
    const m = part.match(/^([A-Za-z]*\s*)(\d+)\s*-\s*\1?(\d+)$/);
    if (m) {
      const [, prefix, a, b] = m;
      for (let i = Number(a); i <= Number(b) && out.length < 500; i++) out.push(`${prefix.trim()}${i}`);
    } else out.push(part);
  }
  return [...new Set(out)];
}

export default function EstateDetail() {
  const { id } = useParams<{ id: string }>();
  const { reload: reloadEstates, setCurrent } = useEstate();
  const [estate, setEstate] = useState<Estate | null>(null);
  const [units, setUnits] = useState<Unit[]>([]);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [invites, setInvites] = useState<Invitation[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [unitInput, setUnitInput] = useState('');
  const [settings, setSettings] = useState({ name: '', gate_phone: '' });
  const [member, setMember] = useState({ name: '', phone: '', role: 'resident' as MemberRole, unit: '' });
  const [filter, setFilter] = useState('');

  const [denied, setDenied] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await api<{ estate: Estate; units: Unit[]; members?: MemberRow[]; invites?: Invitation[] }>(`/api/estates/${id}`);
      setEstate(d.estate);
      setSettings({ name: d.estate.name ?? '', gate_phone: d.estate.gate_phone ?? '' });
      setUnits(d.units);
      setMembers(d.members ?? []);
      setInvites(d.invites ?? []);
    } catch (e) {
      setDenied(errorMessage(e));
    }
  }, [id]);

  useEffect(() => { load(); setCurrent(id); }, [load, id]); // eslint-disable-line react-hooks/exhaustive-deps

  const unitLabel = useMemo(() => Object.fromEntries(units.map((u) => [u.id, u.label])), [units]);
  const flash = (ok: boolean, text: string) => { setMsg({ ok, text }); setTimeout(() => setMsg(null), 5000); };

  /** Runs a change, shows the result, reloads the page data. */
  const run = async (fn: () => Promise<unknown>, success?: string) => {
    try {
      await fn();
      if (success) flash(true, success);
      await load();
      return true;
    } catch (e) {
      flash(false, errorMessage(e));
      return false;
    }
  };

  const saveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (settings.gate_phone.trim() && !normalizeUgPhone(settings.gate_phone)) {
      return flash(false, 'Gate phone must be a Ugandan mobile number');
    }
    if (await run(() => api(`/api/estates/${id}`, { method: 'PATCH', body: { name: settings.name, gate_phone: settings.gate_phone } }), 'Estate saved')) {
      reloadEstates();
    }
  };

  const addUnits = async (e: React.FormEvent) => {
    e.preventDefault();
    const labels = expandUnits(unitInput).filter((l) => !units.some((u) => u.label === l));
    if (!labels.length) return flash(false, 'No new units to add');
    if (await run(() => api(`/api/estates/${id}/units`, { body: { labels } }), `Added ${labels.length} unit${labels.length > 1 ? 's' : ''}`)) {
      setUnitInput('');
    }
  };

  const deleteUnit = async (u: Unit) => {
    if (!confirm(`Delete unit ${u.label}? Residents linked to it will lose their unit.`)) return;
    await run(() => api(`/api/units/${u.id}`, { method: 'DELETE' }));
  };

  const addMember = async (e: React.FormEvent) => {
    e.preventDefault();
    const phone = normalizeUgPhone(member.phone);
    if (!phone) return flash(false, 'Enter a valid Ugandan mobile number');
    if (member.role === 'resident' && !member.unit) return flash(false, 'Pick the resident’s unit');
    try {
      const r = await api<{ status: string }>(`/api/estates/${id}/members`, {
        body: { phone, full_name: member.name, role: member.role, unit_id: member.unit || null },
      });
      flash(true, r.status === 'added'
        ? `${member.name || phone} added — they already use SafeNest`
        : `${member.name || phone} registered — they get access when they sign in with ${formatUgPhone(phone)}`);
      setMember({ name: '', phone: '', role: member.role, unit: '' });
      load();
    } catch (err) {
      flash(false, errorMessage(err));
    }
  };

  const removeMember = async (m: MemberRow) => {
    if (!confirm(`Remove ${m.profile?.full_name ?? m.profile?.phone} from this estate?`)) return;
    await run(() => api(`/api/memberships/${m.id}`, { method: 'DELETE' }));
  };

  const cancelInvite = async (inv: Invitation) => {
    await run(() => api(`/api/invitations/${inv.id}`, { method: 'DELETE' }));
  };

  if (denied) return <p className="text-muted">{denied}</p>;
  if (!estate) return <p className="text-muted">Loading…</p>;

  const q = filter.toLowerCase();
  const people = [
    ...members.map((m) => ({ kind: 'member' as const, key: m.id, name: m.profile?.full_name ?? '—', phone: m.profile?.phone ?? '', role: m.role, unit: m.unit_id, row: m, nin: m.nin_masked ?? null, selfie: !!m.has_selfie })),
    ...invites.map((i) => ({ kind: 'invite' as const, key: i.id, name: i.full_name ?? '—', phone: i.phone, role: i.role, unit: i.unit_id, row: i, nin: null, selfie: false })),
  ].filter((p) => !q || p.name.toLowerCase().includes(q) || p.phone.includes(q) || (p.unit && unitLabel[p.unit]?.toLowerCase().includes(q)));

  return (
    <>
      <PageTitle title={estate.name} sub={`${units.length} units · ${members.filter((m) => m.role === 'resident').length} residents · ${members.filter((m) => m.role === 'guard').length} guards`} />

      {msg && (
        <div className={`mb-4 rounded-2xl px-4 py-3 text-sm font-semibold ${msg.ok ? 'bg-surface-2 text-brand-deep' : 'bg-red-600/10 text-sos'}`}>{msg.text}</div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        <div className="space-y-6">
          <form onSubmit={saveSettings} className="card space-y-4 p-6">
            <h2 className="font-bold">Estate details</h2>
            <div>
              <label className="label">Name</label>
              <input className="input" value={settings.name} onChange={(e) => setSettings({ ...settings, name: e.target.value })} />
            </div>
            <div>
              <label className="label">Gate phone (guard house)</label>
              <input className="input" value={settings.gate_phone} onChange={(e) => setSettings({ ...settings, gate_phone: e.target.value })} placeholder="0772 123 456" />
              <p className="mt-1 text-xs text-muted">Residents’ phones SMS this number if they press SOS with no internet.</p>
            </div>
            <button className="btn btn-primary">Save</button>
          </form>

          <form onSubmit={addUnits} className="card space-y-4 p-6">
            <h2 className="font-bold">Units</h2>
            <div>
              <label className="label">Add units</label>
              <input className="input" value={unitInput} onChange={(e) => setUnitInput(e.target.value)} placeholder="A1-A12, B1-B6, Gatehouse flat" />
              <p className="mt-1 text-xs text-muted">Separate with commas. Ranges like A1-A12 are expanded.</p>
            </div>
            <button className="btn btn-primary" disabled={!unitInput.trim()}>Add units</button>
            <div className="flex flex-wrap gap-2 pt-2">
              {units.map((u) => (
                <span key={u.id} className="group inline-flex items-center gap-1 rounded-xl border border-line bg-surface-2 px-3 py-1.5 text-sm font-semibold">
                  {u.label}
                  <button type="button" onClick={() => deleteUnit(u)} className="text-muted opacity-0 transition group-hover:opacity-100" aria-label={`Delete ${u.label}`}>×</button>
                </span>
              ))}
              {!units.length && <p className="text-sm text-muted">No units yet.</p>}
            </div>
          </form>
        </div>

        <div className="space-y-6">
          <form onSubmit={addMember} className="card grid gap-4 p-6 sm:grid-cols-2">
            <h2 className="font-bold sm:col-span-2">Add resident or guard</h2>
            <div>
              <label className="label">Full name</label>
              <input className="input" value={member.name} onChange={(e) => setMember({ ...member, name: e.target.value })} placeholder="Grace Achieng" />
            </div>
            <div>
              <label className="label">Phone</label>
              <input className="input" value={member.phone} onChange={(e) => setMember({ ...member, phone: e.target.value })} placeholder="0772 123 456" />
            </div>
            <div>
              <label className="label">Role</label>
              <select className="input" value={member.role} onChange={(e) => setMember({ ...member, role: e.target.value as MemberRole })}>
                <option value="resident">Resident</option>
                <option value="guard">Gate guard</option>
              </select>
            </div>
            <div>
              <label className="label">Unit {member.role === 'guard' && '(optional)'}</label>
              <select className="input" value={member.unit} onChange={(e) => setMember({ ...member, unit: e.target.value })}>
                <option value="">{member.role === 'guard' ? 'None' : 'Choose unit…'}</option>
                {units.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2">
              <button className="btn btn-primary" disabled={!member.phone}>Add</button>
              <span className="ml-3 text-sm text-muted">They sign in to the app with this number — no password.</span>
            </div>
          </form>

          <div className="card overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b border-line p-4">
              <h2 className="font-bold">People</h2>
              <input className="input max-w-56 py-1.5 text-sm" placeholder="Search name, phone, unit" value={filter} onChange={(e) => setFilter(e.target.value)} />
            </div>
            <div className="divide-y divide-line">
              {people.map((p) => (
                <div key={p.key} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{p.name}</div>
                    <div className="text-sm text-muted">{formatUgPhone(p.phone)}{p.unit ? ` · Unit ${unitLabel[p.unit] ?? '?'}` : ''}</div>
                    {p.kind === 'member' && p.role === 'resident' && (
                      <div className="text-xs text-muted">
                        {p.nin ? <>NIN <span className="font-mono">{p.nin}</span></> : <span className="text-amber-700 dark:text-amber-400">NIN not added</span>}
                        {' · '}{p.selfie ? 'Photo ✓' : <span className="text-amber-700 dark:text-amber-400">no photo</span>}
                      </div>
                    )}
                  </div>
                  <Badge tone={p.role === 'manager' ? 'green' : p.role === 'guard' ? 'amber' : 'grey'}>{p.role}</Badge>
                  {p.kind === 'invite' && <Badge tone="grey">not signed in</Badge>}
                  {p.role !== 'manager' && (
                    <button className="text-sm font-semibold text-muted hover:text-sos"
                      onClick={() => (p.kind === 'member' ? removeMember(p.row as MemberRow) : cancelInvite(p.row as Invitation))}>
                      Remove
                    </button>
                  )}
                </div>
              ))}
              {!people.length && <p className="p-4 text-sm text-muted">No one here yet.</p>}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
