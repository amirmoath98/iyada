export type VisitType = 'new' | 'follow' | 'surgery' | 'postop';
export type Role = 'doctor' | 'secretary' | 'partner';

export type Clinic = {
  id: string; slug: string; kind: 'clinic' | 'radiology' | 'lab' | 'pharmacy';
  name: string; doctor_name: string; specialty: string; bio: string; hours: string; fee: string; phone: string;
  building: string; floor: string; room: string; landmark: string; area: string; gov: string; map_url: string;
  logo_path: string | null; open_time: string; daily_limit: number; durations: Record<VisitType, number>;
  near_areas: string[]; questions: string[];
};

export type Patient = { id: string; name: string; phone: string; gov: string; area: string };

export type Booking = {
  id: string; clinic_id: string; patient_id: string; day: string; original_seq: number; type: VisitType;
  status: 'waiting' | 'in' | 'done' | 'cancelled' | 'no_show'; near: boolean; complaint: string;
  answers: Record<string, string>; reminded: boolean; confirmed: boolean | null; patients?: Patient;
};

export type QueueItem = { id: string; booking_id: string | null; name: string };
export type Queue = { clinic_id: string; day: string; items: QueueItem[]; cur: number; version: number; updated_at: string };

export type MedicalRecord = {
  booking_id: string; patient_id: string; diagnosis: string; prescription: string;
  surgery: { name: string; date: string; hospital: string } | null; follow_up: string; updated_at: string;
};

export type Referral = {
  id: string; from_clinic: string; to_clinic: string; booking_id: string; patient_id: string; patient_name: string;
  what: string; result: string | null; result_at: string | null; created_at: string;
};

export type Link = { id: string; from_clinic: string; to_clinic: string; status: 'pending' | 'accepted' | 'rejected' };

export const TYPE_LABEL: Record<VisitType, string> = { new: 'كشف جديد', follow: 'مراجعة', surgery: 'حجز عملية', postop: 'بعد عملية' };
export const FOLLOW_OPTIONS = ['', 'بعد أسبوع', 'بعد أسبوعين', 'بعد شهر', 'بعد ٣ أشهر', 'بعد أسبوعين من العملية'];

// اليوم بتوقيت بغداد
export const todayIQ = () => new Date(Date.now() + 3 * 3600 * 1000).toISOString().slice(0, 10);

export const fmtTime = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${String(m).padStart(2, '0')} ${h < 12 ? 'ص' : 'م'}`;
};
export const fmtDate = (iso: string) =>
  new Date(iso.slice(0, 10) + 'T12:00:00').toLocaleDateString('ar-IQ', { day: 'numeric', month: 'long', year: 'numeric' });
