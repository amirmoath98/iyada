import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase } from './supabase';
import type { Clinic, Role } from './types';

type Membership = { clinic: Clinic; role: Role };
type Ctx = {
  session: Session | null; loading: boolean; memberships: Membership[]; isAdmin: boolean;
  active: Membership | null; setActive: (m: Membership) => void; refresh: () => Promise<void>; signOut: () => Promise<void>;
};
const SessionCtx = createContext<Ctx | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [active, setActive] = useState<Membership | null>(null);

  async function load(s: Session | null) {
    if (!s) { setMemberships([]); setActive(null); setIsAdmin(false); setLoading(false); return; }
    const { data } = await supabase.from('staff').select('role, clinics(*)').eq('user_id', s.user.id);
    const ms = (data ?? []).map((r: any) => ({ role: r.role as Role, clinic: r.clinics as Clinic })).filter((m) => m.clinic);
    const { data: ad } = await supabase.from('admins').select('user_id').eq('user_id', s.user.id).maybeSingle();
    setMemberships(ms);
    setIsAdmin(!!ad);
    setActive((cur) => ms.find((m) => cur && m.clinic.id === cur.clinic.id && m.role === cur.role) ?? ms[0] ?? null);
    setLoading(false);
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); load(data.session); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => { setSession(s); load(s); });
    return () => sub.subscription.unsubscribe();
  }, []);

  return (
    <SessionCtx.Provider value={{
      session, loading, memberships, isAdmin, active, setActive,
      refresh: () => load(session),
      signOut: async () => { await supabase.auth.signOut(); },
    }}>
      {children}
    </SessionCtx.Provider>
  );
}

export function useSession() {
  const c = useContext(SessionCtx);
  if (!c) throw new Error('SessionProvider missing');
  return c;
}
