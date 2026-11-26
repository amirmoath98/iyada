import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { supabase } from './supabase';

import type { Clinic, Role } from './types';

type Membership = { clinic: Clinic; role: Role };
type Ctx = {
  session: Session | null; loading: boolean; memberships: Membership[]; isAdmin: boolean;
  active: Membership | null; userId: string | null; setActive: (m: Membership) => void; refresh: () => Promise<void>; signOut: () => Promise<void>;
};
const SessionCtx = createContext<Ctx | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [active, setActive] = useState<Membership | null>(null);

  const latestLoad = useRef(0);
  async function load(s: Session | null) {
    const request = ++latestLoad.current;
    if (!s) { setMemberships([]); setActive(null); setIsAdmin(false); setLoading(false); return; }
    // يقبل الدعوات اللي على بريده، ويكمل تسجيل عيادة بدأها قبل تأكيد البريد
    await supabase.rpc('claim_invites');
    const pending = (s.user.user_metadata as { pending_clinic?: Record<string, string> } | undefined)?.pending_clinic;
    if (pending) {
      const { error } = await supabase.rpc('register_clinic', pending);
      if (!error || /slug_taken|too_many|invalid/.test(error.message)) await supabase.auth.updateUser({ data: { pending_clinic: null } });
    }
    const { data } = await supabase.from('staff').select('role, clinics(*)').eq('user_id', s.user.id);
    const ms = (data ?? []).map((r: any) => ({ role: r.role as Role, clinic: r.clinics as Clinic })).filter((m) => m.clinic);
    const { data: ad } = await supabase.from('admins').select('user_id').eq('user_id', s.user.id).maybeSingle();
    if (request !== latestLoad.current) return;
    setMemberships(ms);
    setIsAdmin(!!ad);
    setActive((cur) => ms.find((m) => cur && m.clinic.id === cur.clinic.id && m.role === cur.role) ?? ms[0] ?? null);
    setLoading(false);
  }

  useEffect(() => {
    let initial = true;
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      initial = false;
      setSession(s);
    });
    supabase.auth.getSession().then(({ data }) => { if (initial) setSession(data.session); });
    return () => { initial = false; sub.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (session === undefined) return;
    setLoading(true);
    void load(session);
    return () => { latestLoad.current++; };
  }, [session]);

  return () => sub.subscription.unsubscribe();
  }, []);

  return (
    <SessionCtx.Provider value={{
      session: session ?? null, loading, memberships, isAdmin, active, setActive, userId: session?.user.id ?? null,
      refresh: () => load(session ?? null),
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
