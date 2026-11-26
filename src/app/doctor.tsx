import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, Switch, Text, View } from 'react-native';
import { Attachments, QA } from '@/components/PatientBits';
import { Shell } from '@/components/Shell';
import { Btn, Card, Chip, Field, H, Loading, Note, P, Row, Select, useT } from '@/components/ui';
import { estOf } from '@/lib/est';
import { useSession } from '@/lib/session';
import { errText, supabase } from '@/lib/supabase';
import { C } from '@/lib/theme';
import { FOLLOW_OPTIONS, fmtTime, TYPE_LABEL, type Booking, type Clinic, type MedicalRecord, type Referral } from '@/lib/types';
import { statusOf, STATUS_LABEL, useClinicDay } from '@/lib/useClinicDay';

const TONE = { done: 'done', in: 'in', next: 'next', wait: 'wait', x: 'warn' } as const;

export default function Doctor() {
  return <Shell need={['doctor']}><Body /></Shell>;
}

function Body() {
  const t = useT();
  const { active } = useSession();
  const clinic = active!.clinic;
  const { queue, bookings, loading } = useClinicDay(clinic.id);
  const [view, setView] = useState<string | null>(null);
  const [follow, setFollow] = useState(true);
  const insideId = queue?.items[queue.cur]?.booking_id ?? null;

  // لما السكرتير يضغط «التالي» ينفتح ملف الداخل، إذا الخيار مشغّل
  useEffect(() => { if (follow && insideId) setView(insideId); }, [insideId, follow]);
  useEffect(() => { if (!view && bookings.length) setView(insideId ?? bookings[0].id); }, [bookings.length]);

  if (loading || !queue) return <Loading />;
  const ordered = queue.items.map((it) => bookings.find((b) => b.id === it.booking_id)).filter(Boolean) as Booking[];
  const idx = ordered.findIndex((b) => b.id === view);
  const sel = ordered[idx];

  return (
    <>
      <View style={{ backgroundColor: C.teal, borderRadius: 14, padding: 16, flexDirection: 'row', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}>
        <View><Text style={{ color: '#DDEFEA', fontSize: 12 }}>{t('داخل الآن')}</Text><Text style={{ color: '#fff', fontSize: 22, fontWeight: '700' }}>{queue.items[queue.cur]?.name ?? t('لا أحد')}</Text></View>
        <Row>
          {insideId && insideId !== view && <Btn kind="light" title={t('اعرض ملف الداخل')} onPress={() => setView(insideId)} />}
          <Row style={{ gap: 6 }}>
            <Switch value={follow} onValueChange={setFollow} accessibilityLabel={t('افتح ملف الداخل تلقائياً')} />
            <Text style={{ color: '#fff' }}>{t('افتح ملف الداخل تلقائياً')}</Text>
          </Row>
        </Row>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16, alignItems: 'flex-start' }}>
        <Card style={{ flexGrow: 1, flexBasis: 300, maxWidth: 440, padding: 0, overflow: 'hidden' }}>
          <View style={{ padding: 16 }}><H size={17}>{t('مرضى اليوم')}</H></View>
          {ordered.length === 0 && <P mute style={{ padding: 16 }}>{t('ما في حجوزات اليوم بعد.')}</P>}
          {ordered.map((b) => {
            const st = statusOf(queue, b.id);
            return (
              <Pressable key={b.id} accessibilityRole="button" onPress={() => setView(b.id)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderTopWidth: 1, borderTopColor: C.line, backgroundColor: b.id === view ? C.tealSoft : C.card }}>
                <Text style={{ width: 28, color: C.teal, fontWeight: '700' }}>{b.original_seq}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '600', color: C.ink }}>{b.patients?.name}</Text>
                  <Text style={{ color: C.mute, fontSize: 12 }}>{t(TYPE_LABEL[b.type])}</Text>
                </View>
                <Chip text={t(STATUS_LABEL[st])} tone={TONE[st]} />
              </Pressable>
            );
          })}
        </Card>
        <View style={{ flexGrow: 999, flexBasis: 520, gap: 16 }}>
          {sel ? <PatientFile key={sel.id} clinic={clinic} b={sel} all={bookings} st={statusOf(queue, sel.id)}
            onPrev={idx > 0 ? () => setView(ordered[idx - 1].id) : undefined}
            onNext={idx < ordered.length - 1 ? () => setView(ordered[idx + 1].id) : undefined} />
            : <Card><P mute>{t('اختار مريض من القائمة.')}</P></Card>}
        </View>
      </View>
    </>
  );
}

function PatientFile({ clinic, b, all, st, onPrev, onNext }: {
  clinic: Clinic; b: Booking; all: Booking[]; st: keyof typeof TONE; onPrev?: () => void; onNext?: () => void;
}) {
  const t = useT();
  const [paths, setPaths] = useState<string[]>([]);
  const [refs, setRefs] = useState<Referral[]>([]);
  const [rec, setRec] = useState<MedicalRecord | null>(null);
  const [links, setLinks] = useState<{ id: string; name: string }[]>([]);
  const [dx, setDx] = useState(''); const [rx, setRx] = useState('');
  const [sName, setSName] = useState(''); const [sDate, setSDate] = useState(''); const [sHosp, setSHosp] = useState('');
  const [fu, setFu] = useState('');
  const [to, setTo] = useState(''); const [what, setWhat] = useState('');
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const [a, r, m, l] = await Promise.all([
      supabase.from('attachments').select('path').eq('patient_id', b.patient_id).order('created_at'),
      supabase.from('referrals').select('*').eq('booking_id', b.id).order('created_at'),
      supabase.from('medical_records').select('*').eq('booking_id', b.id).maybeSingle(),
      supabase.from('clinic_links').select('to_clinic, status, clinics!clinic_links_to_clinic_fkey(id, name)').eq('from_clinic', clinic.id).eq('status', 'accepted'),
    ]);
    setPaths((a.data ?? []).map((x) => x.path));
    setRefs((r.data as Referral[]) ?? []);
    const mr = m.data as MedicalRecord | null;
    setRec(mr); setDx(mr?.diagnosis ?? ''); setRx(mr?.prescription ?? ''); setFu(mr?.follow_up ?? '');
    setSName(mr?.surgery?.name ?? ''); setSDate(mr?.surgery?.date ?? ''); setSHosp(mr?.surgery?.hospital ?? '');
    const ls = (l.data ?? []).map((x: any) => ({ id: x.clinics.id as string, name: x.clinics.name as string }));
    setLinks(ls); setTo((cur) => cur || ls[0]?.id || '');
  }
  useEffect(() => { load(); }, [b.id]);

  async function save(sendRx: boolean) {
    setBusy(true); setMsg(null);
    const { error } = await supabase.rpc('save_record', {
      p_booking: b.id, p_diagnosis: dx, p_prescription: rx,
      p_surgery: sName.trim() ? { name: sName.trim(), date: sDate, hospital: sHosp.trim() } : null,
      p_follow_up: fu, p_send_rx: sendRx,
    });
    setBusy(false);
    setMsg(error ? { tone: 'err', text: errText(error) } : { tone: 'ok', text: sendRx ? t('انحفظ وانرسلت الوصفة ✓') : t('انحفظ ✓') });
    if (!error) load();
  }

  async function refer() {
    if (what.trim().length < 2 || !to) { setMsg({ tone: 'err', text: t('اكتب المطلوب') }); return; }
    const { error } = await supabase.rpc('refer', { p_booking: b.id, p_to: to, p_what: what });
    if (error) { setMsg({ tone: 'err', text: errText(error) }); return; }
    setWhat(''); setMsg({ tone: 'ok', text: t('انحال المريض ✓ وانرسلتله رسالة بالعنوان') }); load();
  }

  const qs = clinic.questions ?? [];
  return (
    <>
      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <Row>
            <View style={{ width: 52, height: 52, borderRadius: 14, backgroundColor: C.tealSoft, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: C.teal, fontWeight: '700', fontSize: 20 }}>{b.original_seq}</Text></View>
            <View>
              <H size={22} style={{ marginBottom: 0 }}>{b.patients?.name}</H>
              <P mute small>{t(TYPE_LABEL[b.type])} · {fmtTime(estOf(clinic, all, b))} · {b.patients?.area}{b.patients?.gov ? `، ${b.patients.gov}` : ''}</P>
            </View>
          </Row>
          <Row>
            <Chip text={t(STATUS_LABEL[st])} tone={TONE[st]} />
            <Btn small title={t('→ السابق')} onPress={onPrev} disabled={!onPrev} />
            <Btn small title={t('اللاحق ←')} onPress={onNext} disabled={!onNext} />
          </Row>
        </Row>
        <Pressable onPress={() => router.push({ pathname: '/archive', params: { p: b.patient_id } })}><Text style={{ color: C.teal, marginTop: 8 }}>{t('افتح أرشيف المريض الكامل')}</Text></Pressable>
      </Card>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
        <Card style={{ flexGrow: 1, flexBasis: 260 }}><H size={16}>{t('حالة المريض كما كتبها')}</H><P>{b.complaint ? `«${b.complaint}»` : t('ما كتب شي')}</P></Card>
        <Card style={{ flexGrow: 1, flexBasis: 260 }}><H size={16}>{t('أسئلة الطبيب')}</H>{qs.length ? qs.map((q, i) => <QA key={i} q={q} a={b.answers?.[`q${i}`]} />) : <P mute small>{t('ما في أسئلة محددة')}</P>}</Card>
        <Card style={{ flexGrow: 1, flexBasis: 260 }}><H size={16}>{t('المرفقات')}</H><Attachments paths={paths} /></Card>
        <Card style={{ flexGrow: 1, flexBasis: 260 }}>
          <H size={16}>{t('الإحالات والنتائج')}</H>
          {refs.length === 0 ? <P mute>{t('ما في إحالات')}</P> : refs.map((r) => (
            <View key={r.id} style={{ paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: C.line }}>
              <P>{r.what}</P><P small mute={!r.result}>{r.result ? `${t('النتيجة:')} ${r.result}` : t('بانتظار النتيجة')}</P>
            </View>
          ))}
        </Card>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
        <Card style={{ flexGrow: 2, flexBasis: 320 }}>
          <H size={16}>{t('السجل الطبي')}</H>
          <Field label={t('التشخيص')} value={dx} onChangeText={setDx} multiline />
          <Field label={t('الوصفة')} value={rx} onChangeText={setRx} multiline />
          <P small mute style={{ marginTop: 10 }}>{t('إذا صارت عملية:')}</P>
          <Field label={t('اسم العملية')} value={sName} onChangeText={setSName} />
          <Row style={{ flexWrap: 'nowrap' }}>
            <View style={{ flex: 1 }}><Field label={t('التاريخ')} value={sDate} onChangeText={setSDate} placeholder="2026-12-01" /></View>
            <View style={{ flex: 1 }}><Field label={t('المستشفى')} value={sHosp} onChangeText={setSHosp} /></View>
          </Row>
          <Select label={t('المراجعة الجاية')} value={fu} options={FOLLOW_OPTIONS} render={(v) => (v ? t(v) : t('ما يحتاج'))} onChange={setFu} />
          {msg && <Note tone={msg.tone}>{msg.text}</Note>}
          <Row style={{ marginTop: 12 }}>
            <Btn kind="primary" title={t('احفظ')} onPress={() => save(false)} busy={busy} />
            <Btn title={t('احفظ ودز الوصفة للمريض')} onPress={() => save(true)} disabled={busy || !rx.trim()} />
          </Row>
          {rec?.updated_at ? <P small mute style={{ marginTop: 6 }}>{t('آخر حفظ')} {new Date(rec.updated_at).toLocaleTimeString('ar-IQ')}</P> : null}
        </Card>
        <Card style={{ flexGrow: 1, flexBasis: 260 }}>
          <H size={16}>{t('إحالة لعيادة مرتبطة')}</H>
          {links.length === 0 ? <P mute>{t('ما في عيادات مرتبطة. اطلب ربط من إعدادات العيادة.')}</P> : (
            <>
              <Select label={t('إلى')} value={to} options={links.map((l) => l.id)} render={(v) => links.find((l) => l.id === v)?.name ?? ''} onChange={setTo} />
              <Field label={t('المطلوب')} value={what} onChangeText={setWhat} placeholder={t('مثلاً: أشعة للركبة وضعيتين')} />
              <Btn kind="dark" title={t('إحالة')} onPress={refer} style={{ marginTop: 12, backgroundColor: C.plumInk, borderColor: C.plumInk }} />
            </>
          )}
        </Card>
      </View>
    </>
  );
}
