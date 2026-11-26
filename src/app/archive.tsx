import { useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Attachments } from '@/components/PatientBits';
import { Shell } from '@/components/Shell';
import { Btn, Card, Chip, Field, H, Loading, Note, P, Row, useT } from '@/components/ui';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { C } from '@/lib/theme';
import { fmtDate, TYPE_LABEL, type Booking, type MedicalRecord, type Patient, type Referral } from '@/lib/types';

type Visit = Booking & { medical_records: MedicalRecord | null };
type Summary = Patient & { visits: number; last: string; surg: boolean; imgs: boolean };

export default function Archive() {
  return <Shell need={['doctor']}><Body /></Shell>;
}

// الأرشيف للطبيب بس (RLS يمنع السكرتير من السجل الطبي)
function Body() {
  const t = useT();
  const { active } = useSession();
  const clinicId = active!.clinic.id;
  const { p } = useLocalSearchParams<{ p?: string }>();
  const [list, setList] = useState<Summary[] | null>(null);
  const [q, setQ] = useState('');
  const [f, setF] = useState<'all' | 'surg' | 'img'>('all');
  const [sel, setSel] = useState<string | null>(p ?? null);

  useEffect(() => {
    (async () => {
      const [pt, bk, mr, at, rf] = await Promise.all([
        supabase.from('patients').select('*').eq('clinic_id', clinicId),
        supabase.from('bookings').select('patient_id, day, status').eq('clinic_id', clinicId).neq('status', 'cancelled'),
        supabase.from('medical_records').select('patient_id, surgery').eq('clinic_id', clinicId).not('surgery', 'is', null),
        supabase.from('attachments').select('patient_id').eq('clinic_id', clinicId),
        supabase.from('referrals').select('patient_id').eq('from_clinic', clinicId),
      ]);
      const surg = new Set((mr.data ?? []).map((x) => x.patient_id));
      const img = new Set([...(at.data ?? []), ...(rf.data ?? [])].map((x) => x.patient_id));
      const rows = ((pt.data as Patient[]) ?? []).map((x) => {
        const v = (bk.data ?? []).filter((b) => b.patient_id === x.id);
        return { ...x, visits: v.length, last: v.map((b) => b.day).sort().at(-1) ?? '', surg: surg.has(x.id), imgs: img.has(x.id) };
      }).filter((x) => x.visits > 0).sort((a, b) => b.last.localeCompare(a.last));
      setList(rows);
      setSel((cur) => cur ?? rows[0]?.id ?? null);
    })();
  }, [clinicId]);

  const shown = useMemo(() => (list ?? []).filter((x) =>
    (!q.trim() || x.name.includes(q.trim()) || x.phone.includes(q.trim())) &&
    (f === 'all' || (f === 'surg' && x.surg) || (f === 'img' && x.imgs))), [list, q, f]);

  if (!list) return <Loading />;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16, alignItems: 'flex-start' }}>
      <Card style={{ flexGrow: 1, flexBasis: 300, maxWidth: 440, padding: 0, overflow: 'hidden' }}>
        <View style={{ padding: 16 }}>
          <H size={17}>{t('أرشيف المرضى')}</H>
          <Field label={t('ابحث بالاسم أو الرقم')} value={q} onChangeText={setQ} />
          <Row style={{ marginTop: 10, gap: 6 }}>
            {([['all', 'الكل'], ['surg', 'سوّوا عملية'], ['img', 'عندهم أشعة أو نتائج']] as const).map(([k, l]) => (
              <Btn key={k} small kind={f === k ? 'dark' : 'plain'} title={t(l)} onPress={() => setF(k)} />
            ))}
          </Row>
        </View>
        {shown.length === 0 && <P mute style={{ padding: 16 }}>{t('ما في نتائج.')}</P>}
        {shown.map((x) => (
          <Pressable key={x.id} accessibilityRole="button" onPress={() => setSel(x.id)}
            style={{ flexDirection: 'row', gap: 10, alignItems: 'center', padding: 12, borderTopWidth: 1, borderTopColor: C.line, backgroundColor: x.id === sel ? C.tealSoft : C.card }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '600', color: C.ink }}>{x.name}</Text>
              <Text style={{ color: C.mute, fontSize: 12 }}>{x.visits} {t('زيارة')} · {t('آخرها')} {x.last ? fmtDate(x.last) : ''}</Text>
            </View>
            {x.surg && <Chip text={t('عملية')} tone="next" />}
            {x.imgs && <Chip text={t('أشعة')} tone="ref" />}
          </Pressable>
        ))}
      </Card>
      <View style={{ flexGrow: 999, flexBasis: 520, gap: 16 }}>
        {sel ? <PatientArchive key={sel} id={sel} clinicId={clinicId} /> : <Card><P mute>{t('ما في مرضى بعد.')}</P></Card>}
      </View>
    </View>
  );
}

function PatientArchive({ id, clinicId }: { id: string; clinicId: string }) {
  const t = useT();
  const [pt, setPt] = useState<Patient | null>(null);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [paths, setPaths] = useState<string[]>([]);
  const [refs, setRefs] = useState<Referral[]>([]);
  useEffect(() => {
    (async () => {
      const [a, b, c, d] = await Promise.all([
        supabase.from('patients').select('*').eq('id', id).maybeSingle(),
        supabase.from('bookings').select('*, medical_records(*)').eq('patient_id', id).eq('clinic_id', clinicId).neq('status', 'cancelled').order('day', { ascending: false }),
        supabase.from('attachments').select('path').eq('patient_id', id).order('created_at'),
        supabase.from('referrals').select('*').eq('patient_id', id).eq('from_clinic', clinicId).order('created_at', { ascending: false }),
      ]);
      setPt(a.data as Patient); setVisits((b.data as Visit[]) ?? []); setPaths((c.data ?? []).map((x) => x.path)); setRefs((d.data as Referral[]) ?? []);
    })();
  }, [id, clinicId]);
  if (!pt) return <Loading />;
  const surg = visits.filter((v) => v.medical_records?.surgery);
  return (
    <>
      <Note>{t('الأرشيف يشوفه الطبيب بس.')}</Note>
      <Card>
        <H size={22}>{pt.name}</H>
        <P mute small>{pt.phone} · {pt.area}{pt.gov ? `، ${pt.gov}` : ''} · {visits.length} {t('زيارة')}{visits.length ? ` · ${t('أول زيارة')} ${fmtDate(visits.at(-1)!.day)}` : ''}</P>
      </Card>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
        <Card style={{ flexGrow: 1, flexBasis: 260 }}>
          <H size={16}>{t('العمليات')}</H>
          {surg.length === 0 ? <P mute>{t('ما سوّى عمليات عند الطبيب')}</P> : surg.map((v) => (
            <View key={v.id} style={{ paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: C.line }}>
              <P style={{ fontWeight: '600' }}>{v.medical_records!.surgery!.name}</P>
              <P small mute>{v.medical_records!.surgery!.date ? fmtDate(v.medical_records!.surgery!.date) : ''} · {v.medical_records!.surgery!.hospital}</P>
            </View>
          ))}
        </Card>
        <Card style={{ flexGrow: 1, flexBasis: 260 }}>
          <H size={16}>{t('الأشعة والنتائج')}</H>
          <Attachments paths={paths} />
          {refs.map((r) => (
            <View key={r.id} style={{ paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: C.line }}>
              <P>{r.what} <Text style={{ color: C.mute, fontSize: 12 }}>· {fmtDate(r.created_at)}</Text></P>
              <P small mute={!r.result}>{r.result ? `${t('النتيجة:')} ${r.result}` : t('بانتظار النتيجة')}</P>
            </View>
          ))}
        </Card>
      </View>
      <H size={17}>{t('سجل الزيارات والمراجعات')}</H>
      {visits.map((v) => {
        const m = v.medical_records;
        return (
          <Card key={v.id}>
            <Row style={{ justifyContent: 'space-between' }}><P style={{ fontWeight: '700' }}>{fmtDate(v.day)}</P><Chip text={t(TYPE_LABEL[v.type])} /></Row>
            {v.complaint ? <P><Text style={{ color: C.mute }}>{t('الحالة:')} </Text>{v.complaint}</P> : null}
            {m?.diagnosis ? <P><Text style={{ color: C.mute }}>{t('التشخيص:')} </Text>{m.diagnosis}</P> : null}
            {m?.prescription ? <P><Text style={{ color: C.mute }}>{t('الوصفة:')} </Text>{m.prescription}</P> : null}
            {m?.surgery ? <Row style={{ marginTop: 4 }}><Chip text={t('عملية')} tone="next" /><P>{m.surgery.name}</P></Row> : null}
            {m?.follow_up ? <P small><Text style={{ fontWeight: '700' }}>{t('المراجعة الجاية:')}</Text> {t(m.follow_up)}</P> : null}
          </Card>
        );
      })}
    </>
  );
}
