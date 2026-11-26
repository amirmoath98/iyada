import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { Shell } from '@/components/Shell';
import { Team } from '@/components/Team';
import { Btn, Card, Chip, Field, H, Note, P, Row, Select, useT } from '@/components/ui';
import { areasOf, GOVS } from '@/lib/geo';
import { useSession } from '@/lib/session';
import { errText, SITE_URL, supabase } from '@/lib/supabase';
import { C } from '@/lib/theme';
import type { Clinic } from '@/lib/types';

export default function Settings() {
  return <Shell need={['secretary', 'doctor', 'partner']}><Body /></Shell>;
}

const FIELDS: [keyof Clinic, string][] = [
  ['name', 'اسم العيادة'], ['doctor_name', 'اسم الطبيب'], ['specialty', 'الاختصاص'], ['bio', 'نبذة'],
  ['hours', 'الدوام'], ['fee', 'الكشفية'], ['phone', 'تلفون العيادة'], ['building', 'العمارة أو المجمع'],
  ['floor', 'الطابق'], ['room', 'رقم العيادة'], ['landmark', 'أقرب نقطة دالة'], ['map_url', 'رابط الخريطة'],
];

function Body() {
  const t = useT();
  const { active, refresh } = useSession();
  const [c, setC] = useState<Clinic>(active!.clinic);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [newQ, setNewQ] = useState('');
  const base = SITE_URL || (typeof window !== 'undefined' && window.location ? window.location.origin : '');
  const page = `${base}/c/${c.slug}`;
  const display = `${base}/display/${c.id}`;

  async function save() {
    setBusy(true); setMsg(null);
    const { id, slug, kind, created_at, logo_path, durations, ...rest } = c as Clinic & { created_at?: string };
    const { error } = await supabase.from('clinics').update({ ...rest, daily_limit: Number(c.daily_limit) || 30 }).eq('id', c.id);
    setBusy(false);
    setMsg(error ? { tone: 'err', text: errText(error) } : { tone: 'ok', text: t('انحفظ ✓') });
    if (!error) refresh();
  }
  const set = (k: keyof Clinic, v: unknown) => setC({ ...c, [k]: v } as Clinic);

  return (
    <>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16, alignItems: 'flex-start' }}>
        <Card style={{ flexGrow: 2, flexBasis: 420 }}>
          <H>{t('معلومات العيادة')}</H>
          <P mute small>{t('تطلع بصفحة العيادة وبرسائل الواتساب.')}</P>
          {FIELDS.map(([k, l]) => (
            <Field key={k} label={t(l)} value={String(c[k] ?? '')} onChangeText={(v) => set(k, v)} multiline={k === 'bio'} />
          ))}
          <Row style={{ flexWrap: 'nowrap' }}>
            <Select label={t('المحافظة')} value={c.gov || GOVS[0]} options={GOVS} onChange={(v) => setC({ ...c, gov: v, area: areasOf(v)[0], near_areas: [] })} />
            <Select label={t('المنطقة')} value={c.area} options={areasOf(c.gov || GOVS[0])} onChange={(v) => set('area', v)} />
          </Row>
          <Row style={{ flexWrap: 'nowrap' }}>
            <View style={{ flex: 1 }}><Field label={t('بداية الدوام')} value={c.open_time.slice(0, 5)} onChangeText={(v) => set('open_time', v)} placeholder="16:00" /></View>
            <View style={{ flex: 1 }}><Field label={t('الحد اليومي للحجوزات')} value={String(c.daily_limit)} onChangeText={(v) => set('daily_limit', v.replace(/[^0-9]/g, ''))} keyboardType="number-pad" /></View>
          </Row>
        </Card>
        <View style={{ flexGrow: 1, flexBasis: 320, gap: 16 }}>
          <Card>
            <H size={17}>{t('أسئلة الطبيب')}</H>
            <P mute small>{t('يسألها المجيب الذكي ويطلعها بصفحة الحجز.')}</P>
            {c.questions.map((q, i) => (
              <Row key={i} style={{ justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: C.line }}>
                <P style={{ flex: 1 }}>{q}</P>
                <Btn small title={t('حذف')} onPress={() => set('questions', c.questions.filter((_, j) => j !== i))} />
              </Row>
            ))}
            <Row style={{ flexWrap: 'nowrap', alignItems: 'flex-end' }}>
              <View style={{ flex: 1 }}><Field label={t('سؤال جديد')} value={newQ} onChangeText={setNewQ} /></View>
              <Btn title={t('إضافة')} onPress={() => { if (newQ.trim()) { set('questions', [...c.questions, newQ.trim()]); setNewQ(''); } }} />
            </Row>
          </Card>
          <Card>
            <H size={17}>{t('المناطق القريبة من العيادة')}</H>
            <P mute small>{t('المريض من هالمناطق يوصله تذكير قبل دوره بساعة، والباقي صباح اليوم.')}</P>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
              {areasOf(c.gov || GOVS[0]).slice(0, -1).map((a) => {
                const on = c.near_areas.includes(a);
                return (
                  <Pressable key={a} accessibilityRole="checkbox" accessibilityState={{ checked: on }}
                    onPress={() => set('near_areas', on ? c.near_areas.filter((x) => x !== a) : [...c.near_areas, a])}
                    style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: on ? C.teal : C.line, backgroundColor: on ? C.tealSoft : C.card }}>
                    <Text style={{ color: on ? C.teal : C.ink }}>{a}</Text>
                  </Pressable>
                );
              })}
            </View>
          </Card>
        </View>
      </View>
      {msg && <Note tone={msg.tone}>{msg.text}</Note>}
      <Row><Btn kind="primary" title={t('احفظ الإعدادات')} onPress={save} busy={busy} /></Row>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16, alignItems: 'flex-start' }}>
        <Card style={{ flexGrow: 1, flexBasis: 300, alignItems: 'center', gap: 8 }}>
          <H size={17}>{t('رابط الحجز والـ QR')}</H>
          {base ? <QRCode value={page} size={180} /> : null}
          <P selectable small>{page}</P>
          <P mute small>{t('اطبع الـ QR وحطه على الباب والوصفة.')}</P>
        </Card>
        <Card style={{ flexGrow: 1, flexBasis: 300, gap: 8 }}>
          <H size={17}>{t('شاشة المراجعين')}</H>
          <P mute small>{t('افتح هالرابط على متصفح التلفزيون بالصالة.')}</P>
          <P selectable small>{display}</P>
        </Card>
        <Links clinicId={c.id} />
        {active!.role !== 'partner' && <Team clinicId={c.id} />}
      </View>
    </>
  );
}

type L = { id: string; status: string; from_clinic: string; to_clinic: string; from: { name: string }; to: { name: string } };
function Links({ clinicId }: { clinicId: string }) {
  const t = useT();
  const [rows, setRows] = useState<L[]>([]);
  const [slug, setSlug] = useState('');
  const [msg, setMsg] = useState('');
  const load = () => supabase.from('clinic_links')
    .select('id, status, from_clinic, to_clinic, from:clinics!clinic_links_from_clinic_fkey(name), to:clinics!clinic_links_to_clinic_fkey(name)')
    .or(`from_clinic.eq.${clinicId},to_clinic.eq.${clinicId}`).then(({ data }) => setRows((data as unknown as L[]) ?? []));
  useEffect(() => { load(); }, [clinicId]);
  const call = async (fn: string, args: Record<string, unknown>) => { const { error } = await supabase.rpc(fn, args); setMsg(error ? errText(error) : ''); load(); };
  const label = { pending: 'بانتظار الموافقة', accepted: 'مرتبطة', rejected: 'مرفوض' } as Record<string, string>;
  return (
    <Card style={{ flexGrow: 1, flexBasis: 320 }}>
      <H size={17}>{t('الربط مع العيادات')}</H>
      <P mute small>{t('كل ربط يحتاج موافقة العيادة الثانية، وأي طرف يگدر يفكه.')}</P>
      {rows.map((r) => {
        const mine = r.from_clinic === clinicId;
        return (
          <Row key={r.id} style={{ justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.line }}>
            <P style={{ flex: 1 }}>{mine ? `→ ${r.to?.name}` : `← ${r.from?.name}`}</P>
            <Chip text={t(label[r.status])} tone={r.status === 'accepted' ? 'wait' : r.status === 'pending' ? 'next' : 'warn'} />
            {!mine && r.status === 'pending' && (<>
              <Btn small kind="primary" title={t('موافقة')} onPress={() => call('link_respond', { p_link: r.id, p_accept: true })} />
              <Btn small title={t('رفض')} onPress={() => call('link_respond', { p_link: r.id, p_accept: false })} />
            </>)}
            {r.status === 'accepted' && <Btn small title={t('فك الربط')} onPress={() => call('link_remove', { p_link: r.id })} />}
          </Row>
        );
      })}
      <Row style={{ flexWrap: 'nowrap', alignItems: 'flex-end' }}>
        <View style={{ flex: 1 }}><Field label={t('معرّف العيادة الثانية (من رابطها)')} value={slug} onChangeText={setSlug} autoCapitalize="none" placeholder="rad-center" /></View>
        <Btn title={t('طلب ربط')} onPress={() => { if (slug.trim()) { call('link_request', { p_from: clinicId, p_to_slug: slug.trim() }); setSlug(''); } }} />
      </Row>
      {msg ? <Note tone="err">{msg}</Note> : null}
    </Card>
  );
}
