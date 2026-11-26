import type { Booking, Clinic } from './types';

// الوقت التقريبي من التسلسل الأصلي (نفس حساب قاعدة البيانات)
export function estOf(c: Clinic, all: Booking[], b: Booking): string {
  const [h, m] = c.open_time.split(':').map(Number);
  let min = h * 60 + m;
  for (const x of all) if (x.day === b.day && x.status !== 'cancelled' && x.original_seq < b.original_seq) min += c.durations[x.type] ?? 15;
  return `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}
