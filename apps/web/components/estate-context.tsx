'use client';

import type { AppRole, Estate, MemberRole } from '@safenest/shared';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from '@/lib/api';

export interface StaffEstate {
  role: MemberRole;
  estate: Estate;
}

interface Ctx {
  userId: string;
  appRole: AppRole;
  estates: StaffEstate[];
  loaded: boolean;
  current: StaffEstate | null;
  setCurrent: (id: string) => void;
  reload: () => Promise<void>;
}

const EstateContext = createContext<Ctx | null>(null);
const KEY = 'safenest.estate';

/** Estates the signed-in person manages or guards, plus which one is selected. */
export function EstateProvider({ userId, appRole, children }: { userId: string; appRole: AppRole; children: ReactNode }) {
  const [estates, setEstates] = useState<StaffEstate[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [currentId, setCurrentId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const list = await api<StaffEstate[]>('/api/estates').catch(() => []);
    setEstates(list);
    setLoaded(true);
    let saved: string | null = null;
    try { saved = localStorage.getItem(KEY); } catch {}
    setCurrentId((prev) =>
      prev && list.some((e) => e.estate.id === prev)
        ? prev
        : list.find((e) => e.estate.id === saved)?.estate.id ?? list[0]?.estate.id ?? null);
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const setCurrent = (id: string) => {
    setCurrentId(id);
    try { localStorage.setItem(KEY, id); } catch {}
  };

  const current = estates.find((e) => e.estate.id === currentId) ?? null;
  return (
    <EstateContext.Provider value={{ userId, appRole, estates, loaded, current, setCurrent, reload }}>
      {children}
    </EstateContext.Provider>
  );
}

export function useEstate() {
  const ctx = useContext(EstateContext);
  if (!ctx) throw new Error('useEstate must be used inside EstateProvider');
  return ctx;
}
