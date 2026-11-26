import { Link, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, Text } from 'react-native';
import { Btn, Card, Field, H, Note, P, Row, Screen, Select, useT } from '@/components/ui';
import { areasOf, GOVS } from '@/lib/geo';
import { useSession } from '@/lib/session';
import { SITE_URL, supabase } from '@/lib/supabase';
import { C } from '@/lib/theme';

const KINDS = ['clinic', 'radiology', 'lab', 'pharmacy'];
const KIND_LABEL: Record<string, string> = { clinic: 'عيادة طبيب', radiology: 'أشعة أو سونار', lab: 'مختبر', pharmacy: 'صيدلية' };

// تسجيل عيادة جديدة: اللي يسجّل (عادةً السكرتير) يصير مدير العيادة، ويدعو الطبيب بعدين
export default function Signup() {
  const t = useT();
  const { session, active } = useSession();
  const [f, setF] = useState({ email: '', pass: '', name: '', doctor: '', specialty: '', phone: '', slug: '', kind: 'clinic', gov: 'بغداد', area: areasOf('بغداد')[0] });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [join, setJoin] = useState(false); // عنده دعوة: حساب بس، بدون عيادة جديدة
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));

  useEffect(() => { if (session && active) router.replace(active.role === 'doctor' ? '/doctor' : active.role === 'partner' ? '/partner' : '/secretary'); }, [session, active]);

  async function go() {
    setErr('');
    const slug = f.slug.trim().toLowerCase();
    if (!f.email.includes('@') || f.pass.length < 8) return setErr(t('اكتب بريد صحيح وكلمة سر ٨ أحرف أو أكثر'));
    if (!join) {
      if (f.name.trim().length < 2) return setErr(t('اكتب اسم العيادة'));
      if (!/^[a-z0-9-]{3,40}$/.test(slug)) return setErr(t('رابط العيادة لازم يكون حروف إنكليزية صغيرة وأرقام وشرطة، من ٣ لـ ٤٠ حرف'));
    }
    setBusy(true);
    if (!join) {
      const { data: taken } = await supabase.from('clinics').select('id').eq('slug', slug).maybeSingle();
      if (taken) { setBusy(false); return setErr(t('هذا الرابط محجوز لعيادة ثانية، اختار غيره')); }
    }
    const pending = { p_slug: slug, p_kind: f.kind, p_name: f.name.trim(), p_doctor_name: f.doctor.trim(), p_specialty: f.specialty.trim(), p_phone: f.phone.trim(), p_gov: f.gov, p_area: f.area };
    const base = SITE_URL || (typeof window !== 'undefined' && window.location ? window.location.origin : '');
    const { data, error } = await supabase.auth.signUp({
      email: f.email.trim(), password: f.pass,
      options: { data: join ? {} : { pending_clinic: pending }, emailRedirectTo: base ? `${base}/login` : undefined },
    });
    setBusy(false);
    if (error) return setErr(/registered/i.test(error.message) ? t('هذا البريد مسجّل. ادخل من صفحة الدخول.') : t('ما گدرنا نسوي الحساب، جرّب مرة ثانية.'));
    if (!data.session) setSent(true); // لازم يأكد بريده أول
  }

  if (sent) return (
    <Screen max={520}>
      <Card style={{ gap: 8 }}>
        <H>{t('تأكد بريدك')}</H>
        <P>{t('دزينالك رسالة على')} <Text style={{ fontWeight: '700' }}>{f.email}</Text>. {join ? t('افتحها واضغط الرابط، وبعدها ادخل وتنربط بالعيادة.') : t('افتحها واضغط الرابط، وبعدها ادخل وتنفتح عيادتك.')}</P>
        <P mute small>{t('ما وصلت؟ شوف مجلد الرسائل غير المرغوبة.')}</P>
        <Btn kind="primary" title={t('دخول')} onPress={() => router.push('/login')} />
      </Card>
    </Screen>
  );

  return (
    <Screen max={620}>
      <Card>
        <H>{join ? t('انضم لعيادة') : t('سجّل عيادتك')}</H>
        <Row style={{ gap: 6, marginBottom: 6 }}>
          <Btn small kind={!join ? 'dark' : 'plain'} title={t('عيادة جديدة')} onPress={() => setJoin(false)} />
          <Btn small kind={join ? 'dark' : 'plain'} title={t('عندي دعوة من عيادة')} onPress={() => setJoin(true)} />
        </Row>
        <P mute small>{join ? t('سوّي حساب بنفس البريد اللي انضافت بيه الدعوة، وتنربط بالعيادة تلقائياً.') : t('اللي يسجّل يصير مدير العيادة: يضيف الطبيب، ويرتب الإعدادات، ويربط ويا العيادات الثانية.')}</P>
        {!join && (<>
        <Select label={t('النوع')} value={f.kind} options={KINDS} render={(v) => t(KIND_LABEL[v])} onChange={(v) => set('kind', v)} />
        <Field label={t('اسم العيادة')} value={f.name} onChangeText={(v) => set('name', v)} />
        <Field label={t('اسم الطبيب أو المسؤول')} value={f.doctor} onChangeText={(v) => set('doctor', v)} />
        <Field label={t('الاختصاص')} value={f.specialty} onChangeText={(v) => set('specialty', v)} />
        <Field label={t('تلفون العيادة')} value={f.phone} onChangeText={(v) => set('phone', v)} keyboardType="phone-pad" />
        <Row style={{ flexWrap: 'nowrap' }}>
          <Select label={t('المحافظة')} value={f.gov} options={GOVS} onChange={(v) => setF((x) => ({ ...x, gov: v, area: areasOf(v)[0] }))} />
          <Select label={t('المنطقة')} value={f.area} options={areasOf(f.gov)} onChange={(v) => set('area', v)} />
        </Row>
        <Field label={t('رابط العيادة (حروف إنكليزية صغيرة)')} value={f.slug} onChangeText={(v) => set('slug', v.toLowerCase().replace(/[^a-z0-9-]/g, ''))} autoCapitalize="none" placeholder="dr-ali" style={{ textAlign: 'left' }} />
        {f.slug ? <P small mute>{`${SITE_URL || ''}/c/${f.slug}`}</P> : null}
        </>)}
        <H size={16} style={{ marginTop: 16 }}>{t('حسابك')}</H>
        <Field label={t('البريد الإلكتروني')} value={f.email} onChangeText={(v) => set('email', v)} autoCapitalize="none" keyboardType="email-address" autoComplete="email" style={{ textAlign: 'left' }} />
        <Field label={t('كلمة السر (٨ أحرف أو أكثر)')} value={f.pass} onChangeText={(v) => set('pass', v)} secureTextEntry autoComplete="new-password" textContentType="newPassword" />
        {err ? <Note tone="err">{err}</Note> : null}
        <Btn kind="primary" title={join ? t('سوّي الحساب') : t('سجّل العيادة')} onPress={go} busy={busy} style={{ marginTop: 14 }} />
        <Link href="/login" asChild><Pressable style={{ marginTop: 12 }}><Text style={{ color: C.teal }}>{t('عندك حساب؟ ادخل')}</Text></Pressable></Link>
      </Card>
    </Screen>
  );
}
