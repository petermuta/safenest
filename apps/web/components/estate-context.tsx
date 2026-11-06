'use client';

import type { AppRole, Estate, MemberRole } from '@safenest/shared';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { createClient } from '@/lib/supabase/client';

export interface StaffEstate {
  role: MemberRole;
  estate: Estate;
}

interface Ctx {
  userId: string;
  appRole: AppRole;
  estates: StaffEstate[];
  current: StaffEstate | null;
  setCurrent: (id: string) => void;
  reload: () => Promise<void>;
}

const EstateContext = createContext<Ctx | null>(null);
const KEY = 'safenest.estate';

/** Estates the signed-in person manages or guards, plus which one is selected. */
export function EstateProvider({ userId, appRole, children }: { userId: string; appRole: AppRole; children: ReactNode }) {
  const supabase = createClient();
  const [estates, setEstates] = useState<StaffEstate[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    let list: StaffEstate[];
    if (appRole === 'super_admin') {
      const { data } = await supabase.from('estates').select('*').order('name');
      list = (data ?? []).map((estate) => ({ role: 'manager' as const, estate: estate as Estate }));
    } else {
      const { data } = await supabase
        .from('memberships')
        .select('role, estate:estates(*)')
        .eq('user_id', userId)
        .eq('active', true)
        .in('role', ['manager', 'guard']);
      list = (data as unknown as StaffEstate[]) ?? [];
    }
    setEstates(list);
    let saved: string | null = null;
    try { saved = localStorage.getItem(KEY); } catch {}
    setCurrentId((prev) => prev ?? (list.find((e) => e.estate.id === saved)?.estate.id ?? list[0]?.estate.id ?? null));
  }, [supabase, userId, appRole]);

  useEffect(() => { reload(); }, [reload]);

  const setCurrent = (id: string) => {
    setCurrentId(id);
    try { localStorage.setItem(KEY, id); } catch {}
  };

  const current = estates.find((e) => e.estate.id === currentId) ?? null;
  return (
    <EstateContext.Provider value={{ userId, appRole, estates, current, setCurrent, reload }}>
      {children}
    </EstateContext.Provider>
  );
}

export function useEstate() {
  const ctx = useContext(EstateContext);
  if (!ctx) throw new Error('useEstate must be used inside EstateProvider');
  return ctx;
}
