'use client';

import { formatUgPhone, normalizeUgPhone } from '@safenest/shared';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, errorMessage } from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [raw, setRaw] = useState('');
  const [phone, setPhone] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Second step for police, managers and the super admin
  const [pinStep, setPinStep] = useState<{ mode: 'setup' | 'enter'; pending: string } | null>(null);
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const p = normalizeUgPhone(raw);
    if (!p) return setErr('Enter a Ugandan mobile number, e.g. 0772 123 456');
    setBusy(true);
    setErr(null);
    try {
      await api('/api/auth/otp', { body: { phone: p } });
      setPhone(p);
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await api<{ token?: string; pin?: 'setup' | 'enter'; pending?: string }>('/api/auth/verify', { body: { phone, code } });
      if (r.pin && r.pending) {
        setPinStep({ mode: r.pin, pending: r.pending });
        setBusy(false);
        return;
      }
      router.replace('/');
      router.refresh();
    } catch (e) {
      setErr(errorMessage(e));
      setBusy(false);
    }
  };

  const submitPin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pinStep) return;
    if (pinStep.mode === 'setup' && pin !== pin2) return setErr('The two PINs do not match');
    setBusy(true);
    setErr(null);
    try {
      await api('/api/auth/pin', { body: { pending: pinStep.pending, pin } });
      router.replace('/');
      router.refresh();
    } catch (e) {
      setErr(errorMessage(e));
      setPin('');
      setPin2('');
      setBusy(false);
    }
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
          {pinStep ? (
            <form onSubmit={submitPin} className="space-y-4">
              {pinStep.mode === 'setup' ? (
                <p className="text-sm text-muted">
                  Your account can see sensitive information, so it needs a PIN as well as the SMS code. Choose 4–6 digits
                  you don&apos;t use anywhere else. Never share it.
                </p>
              ) : (
                <p className="text-sm text-muted">Enter your SafeNest PIN to finish signing in.</p>
              )}
              <div>
                <label className="label" htmlFor="pin">{pinStep.mode === 'setup' ? 'New PIN' : 'PIN'}</label>
                <input id="pin" type="password" className="input border-2 border-brand text-center text-2xl tracking-[0.5em]"
                  inputMode="numeric" autoComplete={pinStep.mode === 'setup' ? 'new-password' : 'current-password'}
                  maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} autoFocus />
              </div>
              {pinStep.mode === 'setup' && (
                <div>
                  <label className="label" htmlFor="pin2">Type it again</label>
                  <input id="pin2" type="password" className="input text-center text-2xl tracking-[0.5em]" inputMode="numeric"
                    autoComplete="new-password" maxLength={6} value={pin2} onChange={(e) => setPin2(e.target.value.replace(/\D/g, ''))} />
                </div>
              )}
              {err && <p className="text-sm text-sos">{err}</p>}
              <button className="btn btn-primary w-full" disabled={busy || pin.length < 4}>
                {busy ? 'Checking…' : pinStep.mode === 'setup' ? 'Save PIN and sign in' : 'Sign in'}
              </button>
            </form>
          ) : !phone ? (
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
              <div>
                <label className="label" htmlFor="code">Enter the 6-digit code</label>
                <input id="code" className="input border-2 border-brand text-center text-2xl tracking-[0.5em]" inputMode="numeric"
                  autoComplete="one-time-code" placeholder="••••••" maxLength={6} value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} autoFocus />
              </div>
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
