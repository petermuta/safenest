import type { Estate, MemberRole, Profile, Unit } from '@safenest/shared';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, clearToken, loadToken, saveToken, setSignedOutHandler } from './api';

export interface MembershipWithEstate {
  id: string;
  role: MemberRole;
  estate: Pick<Estate, 'id' | 'name' | 'lat' | 'lng' | 'gate_phone' | 'subscription_status'>;
  unit: Pick<Unit, 'id' | 'label' | 'block'> | null;
}

/** Which app experience someone gets, decided by their estate membership. */
export type Mode = 'loading' | 'signed_out' | 'unassigned' | 'resident' | 'staff';

interface AuthState {
  userId: string | null;
  profile: Profile | null;
  memberships: MembershipWithEstate[];
  active: MembershipWithEstate | null;
  mode: Mode;
  signIn: (phone: string, code: string) => Promise<void>;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [memberships, setMemberships] = useState<MembershipWithEstate[]>([]);

  const reset = useCallback(() => {
    setProfile(null);
    setMemberships([]);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const me = await api<{ profile: Profile; memberships: MembershipWithEstate[] }>('/api/me');
      setProfile(me.profile);
      setMemberships(me.memberships);
    } catch (e: any) {
      if (e?.status === 401) reset();
      // Offline: keep whatever we had so the SOS button still shows.
    }
  }, [reset]);

  useEffect(() => {
    setSignedOutHandler(reset);
    loadToken().then(async (t) => {
      if (t) await refresh();
      setReady(true);
    });
  }, [refresh, reset]);

  // Staff membership wins (a manager who also lives on the estate gets the staff app).
  const active =
    memberships.find((m) => m.role === 'guard' || m.role === 'manager') ??
    memberships.find((m) => m.role === 'resident') ??
    null;

  let mode: Mode = 'loading';
  if (ready) {
    if (!profile) mode = 'signed_out';
    else if (!active) mode = 'unassigned';
    else mode = active.role === 'resident' ? 'resident' : 'staff';
  }

  const value: AuthState = {
    userId: profile?.id ?? null,
    profile,
    memberships,
    active,
    mode,
    signIn: async (phone, code) => {
      const { token } = await api<{ token: string }>('/api/auth/verify', { body: { phone, code } });
      await saveToken(token);
      await refresh();
    },
    refresh,
    signOut: async () => {
      await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
      await clearToken();
      reset();
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
