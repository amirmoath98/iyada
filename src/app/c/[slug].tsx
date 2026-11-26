import * as ImagePicker from 'expo-image-picker';
import { Link, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { LangSwitch } from '@/components/Shell';
import { DAY_LABEL, scheduleDate, type ScheduleDay } from '@/components/ClinicSchedule';
import { QA } from '@/components/PatientBits';
import { Btn, Card, Field, H, Loading, Note, P, Row, Screen, Select, useT } from '@/components/ui';
import { areasOf, GOVS } from '@/lib/geo';
import { errText, supabase } from '@/lib/supabase';
import { C } from '@/lib/theme';
import { fmtTime, TYPE_LABEL, type Clinic, type VisitType } from '@/lib/types';

type Done = { token: string; seq: number; day: string; est: string };

// صفحة العيادة: يفتحها المريض من الرابط أو الـ QR، بدون حساب
export default function ClinicPage() {
  const t = useT();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const [c, setC] = useState<Clinic | null | undefined>(undefined);
  const [name, setName] = useState(''); const [phone, setPhone] = useState('');
  const [type, setType] = useState<VisitType>('new');
  const [gov, setGov] = useState(GOVS[0]); const [area, setArea] = useState(areasOf(GOVS[0])[0]);
  const [complaint, setComplaint] = useState('');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [consent, setConsent] = useState(false);
  const [err, setErr] = useState('');
  const [days, setDays] = useState<ScheduleDay[]>([]);
  const [selectedDay, setSelectedDay] = useState('');
  const availability = days.find((d) => d.day === selectedDay);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Done | null>(null);

  async function loadSchedule() {
    const { data, error } = await supabase.rpc('clinic_schedule', { p_slug: slug });
    if (error) { setErr(t('ما گدرنا نحمّل أيام الحجز. حدّث الصفحة وجرّب مرة ثانية.')); return; }
    const next = data as ScheduleDay[];
    setDays(next);
    setSelectedDay((current) => next.some((d) => d.day === current) ? current : next.find((d) => d.state === 'open')?.day ?? next[0]?.day ?? '');
  }

  useEffect(() => {
    void loadSchedule();
    supabase.from('clinics').select('*').eq('slug', slug).eq('kind', 'clinic').maybeSingle().then(({ data }) => {
      const cl = data as Clinic | null;
      setC(cl);
      if (cl?.gov) { setGov(cl.gov); setArea(areasOf(cl.gov)[0]); }
    });
  }, [slug]);

  async function book() {
    if (!availability || availability.state !== 'open' || busy) return;
    setErr('');
    if (!consent) { setErr(t('لازم توافق على مشاركة معلوماتك ويا العيادة')); return; }
    setBusy(true);
    const { data, error } = await supabase.rpc('book_appointment', {
      p_slug: slug, p_name: name, p_phone: phone, p_gov: gov, p_area: area, p_type: type,
      p_complaint: complaint, p_answers: answers, p_day: selectedDay,
    });
    setBusy(false);
    if (error) { setErr(errText(error)); return; }
    const r = data as ({ full: true; next_day: string | null } | ({ full: false } & Done));
    if (r.full) {
      if (r.next_day) setSelectedDay(r.next_day);
      await loadSchedule();
      setErr(t(r.next_day ? 'اليوم اللي اخترته صار مو متاح. راجع التاريخ الجديد قبل الحجز.' : 'ماكو أيام متاحة خلال الـ٣٠ يوم الجاية.'));
      return;
    }
    setDone(r);
  }

  if (c === undefined) return <Screen><Loading /></Screen>;
  if (c === null) return <Screen max={560}><Card><H>{t('العيادة مو موجودة')}</H><P mute>{t('تأكد من الرابط.')}</P></Card></Screen>;
  const addr = [c.building, c.floor, c.room].filter(Boolean).join('، ');

  return (
    <Screen max={980}>
      <Row style={{ justifyContent: 'flex-end' }}><LangSwitch /></Row>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16, alignItems: 'flex-start' }}>
        <Card style={{ flexGrow: 1, flexBasis: 300 }}>
          <Row style={{ marginBottom: 10 }}>
            <View style={{ width: 64, height: 64, borderRadius: 16, backgroundColor: C.teal, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 24 }}>{c.doctor_name.replace('د. ', '').charAt(0)}</Text>
            </View>
            <View style={{ flex: 1 }}><H size={20} style={{ marginBottom: 0 }}>{c.doctor_name}</H><P mute>{c.specialty}</P></View>
          </Row>
          {c.bio ? <P>{c.bio}</P> : null}
          <QA q={t('الدوام')} a={c.hours} />
          {c.fee ? <QA q={t('الكشفية')} a={c.fee} /> : null}
          <QA q={t('العنوان')} a={`${addr}\n${c.area}${c.gov ? `، ${c.gov}` : ''}${c.landmark ? ` · ${c.landmark}` : ''}`} />
          {c.phone ? <QA q={t('التلفون')} a={c.phone} /> : null}
          {c.map_url ? <Pressable onPress={() => Linking.openURL(c.map_url)}><Text style={{ color: C.teal, marginTop: 10 }}>{t('افتح الموقع على الخريطة')}</Text></Pressable> : null}
        </Card>

        <Card style={{ flexGrow: 2, flexBasis: 420 }}>
          {done ? <Booked c={c} d={done} /> : (
            <>
              <H>{t('احجز موعد')}</H>
              {days.length > 0 && <Select label={t('يوم الحجز')} value={selectedDay} options={days.map((d) => d.day)}
                render={(v) => {
                  const option = days.find((d) => d.day === v);
                  return option ? scheduleDate(v) + ' · ' + t(DAY_LABEL[option.state]) : t('اختار يوم');
                }} onChange={(v) => { setSelectedDay(v); setErr(''); }} />}
              {availability && availability.state !== 'open' && <Note>{t('اختار يوم مفتوح للحجز.')}</Note>}
              <Field label={t('الاسم الكامل للمريض')} value={name} onChangeText={setName} autoComplete="name" />
              <Field label={t('رقم الواتساب')} value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="07XXXXXXXXX" />
              <P small mute>{t('إذا تحجز لفرد من عائلتك، اكتب اسمه وخلي نفس رقمك.')}</P>
              <Select label={t('نوع الزيارة')} value={type} options={Object.keys(TYPE_LABEL)} render={(v) => t(TYPE_LABEL[v as VisitType])} onChange={(v) => setType(v as VisitType)} />
              <Row style={{ flexWrap: 'nowrap' }}>
                <Select label={t('المحافظة')} value={gov} options={GOVS} onChange={(v) => { setGov(v); setArea(areasOf(v)[0]); }} />
                <Select label={t('المنطقة')} value={area} options={areasOf(gov)} onChange={setArea} />
              </Row>
              <Field label={t('اكتب حالتك')} value={complaint} onChangeText={setComplaint} multiline placeholder={t('مثلاً: ألم بالركبة من شهر')} />
              {(c.questions ?? []).map((q, i) => (
                <Field key={i} label={q} value={answers[`q${i}`] ?? ''} onChangeText={(v) => setAnswers({ ...answers, [`q${i}`]: v })} />
              ))}
              <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: consent }} onPress={() => setConsent(!consent)}
                style={{ flexDirection: 'row', gap: 10, alignItems: 'center', marginTop: 14 }}>
                <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: C.teal, backgroundColor: consent ? C.teal : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                  {consent && <Text style={{ color: '#fff', fontWeight: '700' }}>✓</Text>}
                </View>
                <Text style={{ color: C.ink, flex: 1 }}>{t('أوافق على مشاركة معلوماتي وصوري ويا العيادة، وتوصلني رسائل الحجز على الواتساب.')}</Text>
              </Pressable>
              {err ? <Note tone="err">{err}</Note> : null}
              <Btn kind="primary" title={t('احجز')} onPress={book} busy={busy}
                disabled={availability?.state !== 'open'} style={{ marginTop: 14 }} />
            </>
          )}
        </Card>
      </View>
    </Screen>
  );
}

function Booked({ c, d }: { c: Clinic; d: Done }) {
  const t = useT();
  const [up, setUp] = useState<{ n: number; busy: boolean; err: string }>({ n: 0, busy: false, err: '' });

  // الصور تنرفع بجودتها الأصلية بدون أي تعديل
  async function pick() {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, quality: 1, allowsEditing: false, selectionLimit: 6 });
    if (r.canceled) return;
    setUp((u) => ({ ...u, busy: true, err: '' }));
    let n = 0;
    for (const a of r.assets) {
      try {
        const ext = (a.fileName?.split('.').pop() || a.mimeType?.split('/')[1] || 'jpg').toLowerCase();
        const path = `incoming/${d.token}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const body = await (await fetch(a.uri)).arrayBuffer();
        const { error } = await supabase.storage.from('attachments').upload(path, body, { contentType: a.mimeType ?? 'image/jpeg', upsert: false });
        if (error) throw error;
        const { error: e2 } = await supabase.rpc('attach_by_token', { p_token: d.token, p_path: path });
        if (e2) throw e2;
        n++;
      } catch { setUp((u) => ({ ...u, err: t('صورة وحدة أو أكثر ما انرفعت، جرّب مرة ثانية.') })); }
    }
    setUp((u) => ({ n: u.n + n, busy: false, err: u.err }));
  }

  return (
    <View style={{ gap: 8 }}>
      <H>{t('تم الحجز ✓')}</H>
      <P>{t('رقمك')} <Text style={{ fontWeight: '700' }}>{d.seq}</Text> · {d.day} · {t('الوقت التقريبي')} {fmtTime(d.est)}</P>
      <P mute small>{t('راح توصلك رسالة واتساب بالعنوان الكامل، وتذكير قبل دورك.')}</P>
      <Link href={`/q/${d.token}`} asChild><Pressable><Text style={{ color: C.teal, fontSize: 16 }}>{t('تابع دورك من هنا')}</Text></Pressable></Link>
      <Card style={{ backgroundColor: C.tealSoft, borderColor: C.tealSoft, marginTop: 8 }}>
        <P style={{ fontWeight: '600' }}>{t('عندك أشعة أو تحاليل؟ ارفعها هسه (اختياري)')}</P>
        <Btn title={t('اختار صور')} onPress={pick} busy={up.busy} style={{ marginTop: 8 }} />
        {up.n > 0 && <Note tone="ok">{t('انرفعت')} {up.n} ✓</Note>}
        {up.err ? <Note tone="err">{up.err}</Note> : null}
      </Card>
      <P small mute>{c.name}</P>
    </View>
  );
}
