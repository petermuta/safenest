import type { GuestPass } from '@safenest/shared';

export const passTone = (p: Pick<GuestPass, 'status' | 'valid_until'>) => {
  const expired = p.status === 'active' && new Date(p.valid_until) < new Date();
  const label = expired ? 'expired' : p.status;
  const tone = label === 'active' ? 'green' : label === 'used' ? 'grey' : label === 'revoked' ? 'red' : 'amber';
  return { label, tone } as const;
};

export const fmtTime = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });

export const fmtClock = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
