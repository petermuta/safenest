'use client';

import { formatUgPhone, normalizeUgPhone } from '@safenest/shared';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createClient, errorMessage } from '@/lib/supabase/client';

export default function LoginPage() {
  const supabase = createClient();
  const router = useRouter();
  const [raw, setRaw] = useState('');
  const [phone, setPhone] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const p = normalizeUgPhone(raw);
    if (!p) return setErr('Enter a Ugandan mobile number, e.g. 0772 123 456');
    setBusy(true);
    setErr(null);
    const { error } = await supabase.auth.signInWithOtp({ phone: p });
    setBusy(false);
    if (error) return setErr(errorMessage(error));
    setPhone(p);
  };

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone) return;
    setBusy(true);
    setErr(null);
    const { error } = await supabase.auth.verifyOtp({ phone, token: code, type: 'sms' });
    setBusy(false);
    if (error) return setErr(errorMessage(error));
    router.replace('/');
    router.refresh();
  };

  return (
    <main className="grid min-h-screen place-items-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 rounded-[1.75rem] bg-gradient-to-br from-[#10B981] to-[#064E3B] p-7 text-white shadow-[0_20px_45px_-18px_rgba(6,78,59,0.7)]">
          <div className="mb-4 grid size-12 place-items-center rounded-2xl bg-white/15 text-2xl">🛡️</div>
          <h1 className="text-3xl font-black tracking-tight">SafeNest</h1>
          <p className="mt-1 text-white/85">Estate dashboard for managers and landlords</p>
        </div>

        <div className="card p-6">
          {!phone ? (
            <form onSubmit={send} className="space-y-4">
              <div>
                <label className="label" htmlFor="phone">Phone number</label>
                <input id="phone" className="input text-lg" placeholder="0772 123 456" inputMode="tel" autoComplete="tel"
                  value={raw} onChange={(e) => setRaw(e.target.value)} autoFocus />
              </div>
              {err && <p className="text-sm text-sos">{err}</p>}
              <button className="btn btn-primary w-full" disabled={busy}>{busy ? 'Sending…' : 'Send code'}</button>
            </form>
          ) : (
            <form onSubmit={verify} className="space-y-4">
              <p className="text-sm text-muted">Code sent to <b className="text-ink">{formatUgPhone(phone)}</b></p>
              <input className="input text-center text-2xl tracking-[0.5em]" inputMode="numeric" autoComplete="one-time-code"
                maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} autoFocus />
              {err && <p className="text-sm text-sos">{err}</p>}
              <button className="btn btn-primary w-full" disabled={busy || code.length !== 6}>{busy ? 'Checking…' : 'Sign in'}</button>
              <button type="button" className="btn btn-secondary w-full" onClick={() => { setPhone(null); setCode(''); }}>
                Change number
              </button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
