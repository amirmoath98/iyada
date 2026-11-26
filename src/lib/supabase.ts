import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
export const configured = !!url && !!key;

export const supabase = createClient(url || 'https://example.supabase.co', key || 'missing-key', {
  auth: {
    storage: Platform.OS === 'web' ? undefined : AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: Platform.OS === 'web',
  },
});

export const SITE_URL = process.env.EXPO_PUBLIC_SITE_URL ?? '';

// أخطاء قاعدة البيانات -> رسائل مفهومة
const ERR: Record<string, string> = {
  invalid_phone: 'رقم الموبايل لازم يكون عراقي، مثل 07701234567',
  invalid_name: 'اكتب الاسم الكامل',
  already_booked: 'هذا الشخص محجوز بنفس اليوم. لفرد ثاني من العائلة اكتب اسمه.',
  clinic_not_found: 'العيادة مو موجودة',
  invalid_day: 'اليوم غير صالح',
  forbidden: 'ما عندك صلاحية لهالعملية',
  conflict: 'أحد غيّر الترتيب هسه، حدّثنا الشاشة. جرّب مرة ثانية.',
  not_linked: 'هالعيادة مو مرتبطة',
  empty_queue: 'ما في حجوزات اليوم',
};
export function errText(e: unknown): string {
  const m = (e as { message?: string })?.message ?? String(e);
  const k = Object.keys(ERR).find((x) => m.includes(x));
  return k ? ERR[k] : 'صار خطأ، جرّب مرة ثانية.';
}
