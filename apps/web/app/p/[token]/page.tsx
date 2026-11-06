import { qrPayload } from '@safenest/shared';
import QRCode from 'qrcode';
import { asSystem } from '@/lib/server/db';

// Public page a resident shares with their guest. The guest shows it at the gate.
export const dynamic = 'force-dynamic';

interface PublicPass {
  guest_name: string;
  code: string;
  qr_token: string;
  estate_name: string;
  unit_label: string;
  valid_from: string;
  valid_until: string;
  status: 'active' | 'used' | 'expired' | 'revoked';
}

const fmt = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', { timeZone: 'Africa/Kampala', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export default async function PublicPassPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const valid = /^[0-9a-f-]{36}$/i.test(token);
  const pass = valid
    ? ((await asSystem((tx) => tx.one(`select get_public_pass($1::uuid) as p`, [token])))?.p as PublicPass | null)
    : null;

  if (!pass) {
    return (
      <main className="grid min-h-screen place-items-center p-6">
        <div className="card max-w-sm p-8 text-center">
          <p className="text-lg font-bold">Pass not found</p>
          <p className="mt-1 text-muted">Check the link with the person who invited you.</p>
        </div>
      </main>
    );
  }

  const live = pass.status === 'active';
  const svg = await QRCode.toString(qrPayload(pass.qr_token), { type: 'svg', margin: 1, color: { dark: '#064E3B', light: '#FFFFFF' } });
  const note = { active: 'Show this at the gate', used: 'This pass has been used', expired: 'This pass has expired', revoked: 'This pass was cancelled' }[pass.status];

  return (
    <main className="grid min-h-screen place-items-center p-4">
      <div className="w-full max-w-sm">
        <div className="rounded-t-[1.75rem] bg-gradient-to-br from-[#10B981] to-[#064E3B] px-6 py-5 text-white">
          <div className="text-sm font-semibold opacity-90">SafeNest guest pass</div>
          <div className="text-2xl font-black">{pass.estate_name}</div>
          <div className="opacity-90">Visiting Unit {pass.unit_label}</div>
        </div>
        <div className="card rounded-t-none p-6 text-center">
          <div className="text-lg font-bold">{pass.guest_name}</div>
          <div className={`mt-1 text-sm font-semibold ${live ? 'text-brand-deep' : 'text-sos'}`}>{note}</div>
          <div className={`mx-auto my-5 w-60 rounded-2xl bg-white p-3 ${live ? '' : 'opacity-20'}`} dangerouslySetInnerHTML={{ __html: svg }} />
          <div className="text-xs font-bold tracking-widest text-muted">GATE CODE</div>
          <div className="text-4xl font-black tracking-[0.3em]">{pass.code}</div>
          <div className="mt-4 text-sm text-muted">Valid {fmt(pass.valid_from)} – {fmt(pass.valid_until)}<br />Works once.</div>
        </div>
      </div>
    </main>
  );
}
