import type { Session } from '@supabase/supabase-js';
import type { Estate, MemberRole, Profile, Unit } from '@safenest/shared';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase } from './supabase';

export interface MembershipWithEstate {
  id: string;
  role: MemberRole;
  estate: Pick<Estate, 'id' | 'name' | 'lat' | 'lng' | 'gate_phone' | 'subscription_status'>;
  unit: Pick<Unit, 'id' | 'label' | 'block'> | null;
}

/** Which app experience someone gets, decided by their estate membership. */
export type Mode = 'loading' | 'signed_out' | 'unassigned' | 'resident' | 'staff';

interface AuthState {
  session: Session | null;
  profile: Profile | null;
  memberships: MembershipWithEstate[];
  active: MembershipWithEstate | null;
  mode: Mode;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [memberships, setMemberships] = useState<MembershipWithEstate[]>([]);
  const [loadingProfile, setLoadingProfile] = useState(false);

  const load = useCallback(async (s: Session | null) => {
    if (!s) {
      setProfile(null);
      setMemberships([]);
      return;
    }
    setLoadingProfile(true);
    const [{ data: p }, { data: m }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', s.user.id).single(),
      supabase
        .from('memberships')
        .select('id, role, estate:estates(id, name, lat, lng, gate_phone, subscription_status), unit:units(id, label, block)')
        .eq('user_id', s.user.id)
        .eq('active', true),
    ]);
    setProfile((p as Profile) ?? null);
    setMemberships((m as unknown as MembershipWithEstate[]) ?? []);
    setLoadingProfile(false);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      await load(data.session);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') load(s);
    });
    return () => sub.subscription.unsubscribe();
  }, [load]);

  // Staff membership wins (a manager who also lives on the estate gets the staff app).
  const active =
    memberships.find((m) => m.role === 'guard' || m.role === 'manager') ??
    memberships.find((m) => m.role === 'resident') ??
    null;

  let mode: Mode = 'loading';
  if (ready && !loadingProfile) {
    if (!session) mode = 'signed_out';
    else if (!active) mode = 'unassigned';
    else mode = active.role === 'resident' ? 'resident' : 'staff';
  }

  const value: AuthState = {
    session,
    profile,
    memberships,
    active,
    mode,
    refresh: () => load(session),
    signOut: async () => {
      if (profile) await supabase.from('profiles').update({ expo_push_token: null }).eq('id', profile.id);
      await supabase.auth.signOut();
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
