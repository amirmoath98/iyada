import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from './supabase';
import { todayIQ, type Booking, type Queue } from './types';

// حجوزات اليوم + ترتيب الشاشة، مع تحديث مباشر ونسخة محفوظة للعمل بدون نت
export function useClinicDay(clinicId: string | undefined) {
  const [queue, setQueue] = useState<Queue | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const cacheKey = `iyada.day.${clinicId}`;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    if (!clinicId) return;
    const day = todayIQ();
    const [q, b] = await Promise.all([
      supabase.from('display_queue').select('*').eq('clinic_id', clinicId).eq('day', day).maybeSingle(),
      supabase.from('bookings').select('*, patients(id,name,phone,gov,area)').eq('clinic_id', clinicId).eq('day', day).order('original_seq'),
    ]);
    if (q.error || b.error) { setOffline(true); setLoading(false); return; }
    const qv = (q.data as Queue) ?? { clinic_id: clinicId, day, items: [], cur: -1, version: 0, updated_at: '' };
    setQueue(qv); setBookings((b.data as Booking[]) ?? []); setOffline(false); setLoading(false);
    AsyncStorage.setItem(cacheKey, JSON.stringify({ q: qv, b: b.data })).catch(() => {});
  }, [clinicId, cacheKey]);

  // تجميع التحديثات المتتالية بتحميل واحد
  const soon = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(load, 250);
  }, [load]);

  useEffect(() => {
    if (!clinicId) return;
    AsyncStorage.getItem(cacheKey).then((v) => {
      if (!v) return;
      try { const c = JSON.parse(v); if (c.q?.day === todayIQ()) { setQueue(c.q); setBookings(c.b ?? []); setLoading(false); } } catch {}
    }).catch(() => {});
    load();
    const ch = supabase.channel(`day-${clinicId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'display_queue', filter: `clinic_id=eq.${clinicId}` }, soon)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings', filter: `clinic_id=eq.${clinicId}` }, soon)
      .subscribe();
    const poll = setInterval(load, 30000); // احتياط إذا انقطع التحديث المباشر
    return () => { supabase.removeChannel(ch); clearInterval(poll); if (timer.current) clearTimeout(timer.current); };
  }, [clinicId, cacheKey, load, soon]);

  return { queue, setQueue, bookings, loading, offline, reload: load };
}

export function statusOf(q: Queue | null, id: string): 'done' | 'in' | 'next' | 'wait' | 'x' {
  if (!q) return 'x';
  const i = q.items.findIndex((x) => x.id === id);
  if (i < 0) return 'x';
  if (i < q.cur) return 'done';
  if (i === q.cur) return 'in';
  if (i === q.cur + 1) return 'next';
  return 'wait';
}

export const STATUS_LABEL = { done: 'انتهى', in: 'داخل', next: 'التالي', wait: 'ينتظر', x: 'ملغي' } as const;
