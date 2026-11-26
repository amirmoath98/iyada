import { useEffect, useState } from 'react';
import { Linking, View } from 'react-native';
import { Btn, Card, H, Loading, Note, P, Row, Select, useT } from '@/components/ui';
import { errText, supabase } from '@/lib/supabase';

export type ScheduleDay = {
  day: string;
  booked: number;
  capacity: number;
  state: 'open' | 'closed' | 'full' | 'postponed';
  moved_to: string | null;
};
type Notice = { id: string; name: string; phone: string; body: string; status: string };

export const WEEKDAYS = [
  { value: 6, label: 'السبت' },
  { value: 0, label: 'الأحد' },
  { value: 1, label: 'الاثنين' },
  { value: 2, label: 'الثلاثاء' },
  { value: 3, label: 'الأربعاء' },
  { value: 4, label: 'الخميس' },
  { value: 5, label: 'الجمعة' },
];

export const DAY_LABEL = {
  open: 'مفتوح',
  full: 'الحجز ممتلئ',
  closed: 'مغلق',
  postponed: 'مؤجل',
};
const errors: Record<string, string> = {
  day_has_bookings: 'هذا اليوم بيه حجوزات. اختار تأجيل اليوم حتى تنقل المواعيد المنتظرة.',
  day_already_postponed: 'هذا اليوم مؤجل مسبقاً.',
  no_waiting_bookings: 'ماكو حجوزات منتظرة بهذا اليوم. تگدر تغلقه من «إغلاق الحجز».',
  target_unavailable: 'اليوم البديل مغلق أو مؤجل.',
  target_capacity: 'اليوم البديل ما بيه أماكن كافية لكل الحجوزات. اختار يوم ثاني.',
  target_duplicate: 'أحد المراجعين عنده حجز باليوم البديل. اختار يوم ثاني.',
};
const dateFormatter = new Intl.DateTimeFormat('ar-IQ', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
export function scheduleDate(day: string) {
  return dateFormatter.format(new Date(day + 'T00:00:00Z'));
}

export function ClinicSchedule({ clinicId, slug, onChange }: { clinicId: string; slug: string; onChange: () => void }) {
  const t = useT();
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [savedWeekdays, setSavedWeekdays] = useState<number[] | null>(null);
  const weekChanged = savedWeekdays !== null &&
    (savedWeekdays.length !== weekdays.length || weekdays.some((d) => !savedWeekdays.includes(d)));
  const [days, setDays] = useState<ScheduleDay[]>([]);
  const [selected, setSelected] = useState('');
  const [destination, setDestination] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [show, setShow] = useState(false);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  const day = days.find((d) => d.day === selected);
  const targets = days.filter((d) => d.day > selected && d.state === 'open');

  async function load() {
    const { data, error } = await supabase.rpc('clinic_schedule', { p_slug: slug });
    if (error) setNotice({ tone: 'err', text: errText(error) });
    else {
      const next = data as ScheduleDay[];
      setDays(next);
      setSelected((current) => next.some((d) => d.day === current) ? current : next[0]?.day ?? '');
    }
    setLoading(false);
  }

  useEffect(() => {
    if (!show) return;
    let current = true;
    void load();
    void supabase.rpc('clinic_working_days', { p_slug: slug }).then(({ data, error }) => {
      if (!current) return;
      if (error) setNotice({ tone: 'err', text: errText(error) });
      else {
        const week = (data ?? []) as number[];
        setSavedWeekdays(week);
        setWeekdays(week);
      }
    });
    return () => { current = false; };
  }, [show, slug]);

  useEffect(() => {
    setNotices([]);
    if (day?.state !== 'postponed') return;
    let current = true;
    void supabase.rpc('clinic_postponement_messages', { p_clinic: clinicId, p_day: day.day })
      .then(({ data, error }) => {
        if (!current) return;
        if (error) setNotice({ tone: 'err', text: errText(error) });
        else setNotices(data as Notice[]);
      });
    return () => { current = false; };
  }, [clinicId, day?.day, day?.state]);

  async function saveWeek() {
    if (!weekChanged || busy) return;
    setBusy(true);
    setNotice(null);
    const { data, error } = await supabase.rpc('set_clinic_weekdays', { p_clinic: clinicId, p_days: weekdays });
    if (error) setNotice({ tone: 'err', text: errText(error) });
    else {
      const week = data as number[];
      setSavedWeekdays(week);
      setWeekdays(week);
      setDestination('');
      setConfirm(false);
      setNotice({ tone: 'ok', text: t('انحفظت أيام الدوام الأسبوعية') });
      await load();
    }
    setBusy(false);
  }

  async function save(action: 'open' | 'close' | 'postpone') {
    if (!day || busy) return;
    setBusy(true);
    setNotice(null);
    const { data, error } = action === 'postpone'
      ? await supabase.rpc('postpone_clinic_day', { p_clinic: clinicId, p_from: day.day, p_to: destination })
      : await supabase.rpc('set_clinic_day_open', { p_clinic: clinicId, p_day: day.day, p_open: action === 'open' });
    if (error) {
      setNotice({ tone: 'err', text: t(errors[error.message] ?? errText(error)) });
    } else {
      setConfirm(false);
      setDestination('');
      setNotice({ tone: 'ok', text: action === 'postpone'
        ? `${t('تم نقل الحجوزات المنتظرة')} (${data})`
        : t(action === 'open' ? 'تم فتح الحجز' : 'تم إغلاق الحجز') });
      await load();
      onChange();
    }
    setBusy(false);
  }

  return (
    <Card>
      <Row style={{ justifyContent: 'space-between' }}>
        <H size={18}>{t('أيام العيادة والحجوزات')}</H>
        <Btn small title={t(show ? 'إخفاء التقويم' : 'افتح التقويم')} onPress={() => setShow(!show)} />
      </Row>
      {show && (loading ? <Loading /> : <>
        {savedWeekdays !== null && <View style={{ marginBottom: 14, gap: 8 }}>
          <H size={16}>{t('أيام الدوام الأسبوعية')}</H>
          <P mute small>{t('حدّد الأيام اللي يداوم بيها الدكتور كل أسبوع. الحجوزات المسجلة تبقى، وتگدر تأجّلها من التقويم عند الحاجة.')}</P>
          <Row>
            {WEEKDAYS.map(({ value, label }) => (
              <Btn key={value} small title={t(label)} kind={weekdays.includes(value) ? 'dark' : 'plain'}
                disabled={busy} onPress={() => setWeekdays((current) => current.includes(value)
                  ? current.filter((d) => d !== value) : [...current, value])} />
            ))}
          </Row>
          <Row><Btn kind="primary" title={t('احفظ أيام الدوام')} disabled={!weekChanged || busy} onPress={saveWeek} /></Row>
        </View>}
        <Select
          label={t('اليوم')}
          value={selected}
          options={days.map((d) => d.day)}
          render={(value) => {
            const option = days.find((d) => d.day === value);
            return option ? `${scheduleDate(value)} · ${t(DAY_LABEL[option.state])}` : t('اختار يوم');
          }}
          onChange={(value) => { setSelected(value); setDestination(''); setConfirm(false); setNotice(null); }}
        />
        {day && <>
          <P>{t('الحجوزات')} {day.booked} / {day.capacity} {day.moved_to ? `· ${t('مؤجل إلى')} ${scheduleDate(day.moved_to)}` : ''}</P>
          <Row style={{ marginTop: 10 }}>
            {day.state === 'closed' || day.state === 'postponed'
              ? <Btn title={t('فتح الحجز')} disabled={busy} onPress={() => save('open')} />
              : <Btn title={t('إغلاق الحجز')} disabled={busy} onPress={() => save('close')} />}
            {day.state !== 'postponed' && <Btn title={t('تأجيل اليوم')} disabled={busy || !day.booked || !targets.length}
              onPress={() => setConfirm(!confirm)} />}
          </Row>
          {confirm && <>
            <Select label={t('اليوم البديل')} value={destination} options={targets.map((d) => d.day)}
              render={(value) => value ? scheduleDate(value) : t('اختار يوم بديل')} onChange={setDestination} />
            <P mute small>{t('ينغلق الحجز بهذا اليوم وتنتقل المواعيد المنتظرة لليوم البديل. المواعيد اللي بدأت أو انتهت تبقى بسجلها.')}</P>
            <Btn kind="primary" title={t('تأكيد تأجيل اليوم')} busy={busy} disabled={!destination} onPress={() => save('postpone')} style={{ marginTop: 10 }} />
          </>}
          {notices.length > 0 && <View style={{ marginTop: 12, gap: 6 }}>
            <H size={16}>{t('إشعار المراجعين بالتأجيل')}</H>
            <P mute small>{t('افتح رسالة المراجع الجاهزة بالواتساب واضغط إرسال.')}</P>
            {notices.map((n) => <Row key={n.id} style={{ justifyContent: 'space-between' }}>
              <P>{n.name}</P>
              {n.status === 'sent' ? <P small mute>{t('أُرسلت')}</P> :
                <Btn small title={t('افتح رسالة واتساب')} onPress={() => {
                  void Linking.openURL(`https://wa.me/964${n.phone.replace(/^0/, '')}?text=${encodeURIComponent(n.body)}`)
                    .catch(() => setNotice({ tone: 'err', text: t('ما گدرنا نفتح واتساب.') }));
                }} />}
            </Row>)}
          </View>}
        </>}
        {notice && <Note tone={notice.tone}>{notice.text}</Note>}
      </>)}
    </Card>
  );
}
