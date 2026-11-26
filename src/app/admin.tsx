import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Btn, Card, Field, H, Loading, Note, P, Row, Screen, Select, useT } from '@/components/ui';
import { useSession } from '@/lib/session';
import { errText, supabase } from '@/lib/supabase';
import { C } from '@/lib/theme';
import type { Clinic } from '@/lib/types';

const KINDS = ['clinic', 'radiology', 'lab', 'pharmacy'];
const KIND_LABEL: Record<string, string> = { clinic: 'عيادة طبيب', radiology: 'أشعة', lab: 'مختبر', pharmacy: 'صيدلية' };
const ROLES = ['doctor', 'secretary', 'partner'];
const ROLE_LABEL: Record<string, string> = { doctor: 'طبيب', secretary: 'سكرتير', partner: 'عيادة مرتبطة' };

// لوحة صاحب التطبيق: يفتح العيادات ويربط الحسابات بيها
export default function Admin() {
  const t = useT();
  const { session, isAdmin, loading } = useSession();
  const [list, setList] = useState<Clinic[]>([]);
  const [f, setF] = useState({ slug: '', name: '', doctor_name: '', kind: 'clinic' });
  const [st, setSt] = useState({ user: '', clinic: '', role: 'doctor' });
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  const load = () => supabase.from('clinics').select('*').order('created_at', { ascending: false }).then(({ data }) => setList((data as Clinic[]) ?? []));
  useEffect(() => { if (isAdmin) load(); }, [isAdmin]);

  if (loading) return <Screen><Loading /></Screen>;
  if (!session) { router.replace('/login'); return null; }
  if (!isAdmin) return <Screen><Note tone="err">{t('ما عندك صلاحية لهالصفحة.')}</Note></Screen>;

  return (
    <Screen>
      <H size={24}>{t('لوحة الإدارة')}</H>
      {msg && <Note tone={msg.tone}>{msg.text}</Note>}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16, alignItems: 'flex-start' }}>
        <Card style={{ flexGrow: 1, flexBasis: 320 }}>
          <H size={17}>{t('عيادة جديدة')}</H>
          <Field label={t('المعرّف (حروف إنكليزية صغيرة، يطلع بالرابط)')} value={f.slug} onChangeText={(v) => setF({ ...f, slug: v.toLowerCase().replace(/[^a-z0-9-]/g, '') })} autoCapitalize="none" placeholder="dr-ali" />
          <Field label={t('اسم العيادة')} value={f.name} onChangeText={(v) => setF({ ...f, name: v })} />
          <Field label={t('اسم الطبيب أو المسؤول')} value={f.doctor_name} onChangeText={(v) => setF({ ...f, doctor_name: v })} />
          <Select label={t('النوع')} value={f.kind} options={KINDS} render={(v) => t(KIND_LABEL[v])} onChange={(v) => setF({ ...f, kind: v })} />
          <Btn kind="primary" title={t('إنشاء')} style={{ marginTop: 12 }} onPress={async () => {
            const { error } = await supabase.from('clinics').insert(f);
            setMsg(error ? { tone: 'err', text: errText(error) } : { tone: 'ok', text: t('انحفظ ✓') });
            if (!error) { setF({ slug: '', name: '', doctor_name: '', kind: 'clinic' }); load(); }
          }} />
        </Card>
        <Card style={{ flexGrow: 1, flexBasis: 320 }}>
          <H size={17}>{t('ربط حساب بعيادة')}</H>
          <P mute small>{t('سوّي الحساب أولاً من Supabase ← Authentication ← Add user، وانسخ الـ User UID.')}</P>
          <Field label="User UID" value={st.user} onChangeText={(v) => setSt({ ...st, user: v.trim() })} autoCapitalize="none" />
          <Select label={t('العيادة')} value={st.clinic} options={list.map((c) => c.id)} render={(v) => list.find((c) => c.id === v)?.name ?? '—'} onChange={(v) => setSt({ ...st, clinic: v })} />
          <Select label={t('الدور')} value={st.role} options={ROLES} render={(v) => t(ROLE_LABEL[v])} onChange={(v) => setSt({ ...st, role: v })} />
          <Btn kind="primary" title={t('ربط')} style={{ marginTop: 12 }} onPress={async () => {
            const { error } = await supabase.from('staff').insert({ user_id: st.user, clinic_id: st.clinic, role: st.role });
            setMsg(error ? { tone: 'err', text: errText(error) } : { tone: 'ok', text: t('انحفظ ✓') });
          }} />
        </Card>
      </View>
      <Card style={{ padding: 0 }}>
        <View style={{ padding: 16 }}><H size={17}>{t('العيادات')} ({list.length})</H></View>
        {list.map((c) => (
          <Row key={c.id} style={{ padding: 12, borderTopWidth: 1, borderTopColor: C.line, justifyContent: 'space-between' }}>
            <P style={{ flex: 1 }}>{c.name} · {c.doctor_name}</P>
            <P mute small>{t(KIND_LABEL[c.kind])} · /c/{c.slug}</P>
          </Row>
        ))}
      </Card>
    </Screen>
  );
}
