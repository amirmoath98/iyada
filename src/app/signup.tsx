import { Link, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, Text } from 'react-native';
import { Btn, Card, Field, H, Note, P, Row, Screen, Select, useT } from '@/components/ui';
import { areasOf, GOVS } from '@/lib/geo';
import { useSession } from '@/lib/session';
import { SITE_URL, supabase } from '@/lib/supabase';
import { C } from '@/lib/theme';

const KINDS = ['clinic', 'doctor', 'lab', 'radiology', 'pharmacy'];
const KIND_LABEL: Record<string, string> = { clinic: 'سكرتير', doctor: 'دكتور', radiology: 'أشعة وسونار', lab: 'مختبر طبي', pharmacy: 'صيدلية' };

// تسجيل عيادة جديدة: اللي يسجّل (عادةً السكرتير) يصير مدير العيادة، ويدعو الطبيب بعدين
export default function Signup() {
  const t = useT();
  const { session, active } = useSession();
  const [f, setF] = useState({ email: '', pass: '', name: '', specialty: '', phone: '', slug: '', kind: '', gov: 'بغداد', area: areasOf('بغداد')[0] });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const join = f.kind === 'doctor';
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));

  useEffect(() => { if (session && active) router.replace(active.role === 'doctor' ? '/doctor' : active.role === 'partner' ? '/partner' : '/secretary'); }, [session, active]);

  async function go() {
    setErr('');
    if (!f.kind) return setErr(t('اختار نوع الحساب'));
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
    const pending = { p_slug: slug, p_kind: f.kind, p_name: f.name.trim(), p_doctor_name: '', p_specialty: f.specialty.trim(), p_phone: f.phone.trim(), p_gov: f.gov, p_area: f.area };
    const base = SITE_URL || (typeof window !== 'undefined' && window.location ? window.location.origin : '');
    const { data, error } = await supabase.auth.signUp({
      email: f.email.trim(), password: f.pass,
      options: { data: { account_kind: f.kind, ...(join ? {} : { pending_clinic: pending }) }, emailRedirectTo: base ? `${base}/login?role=${join ? 'doctor' : f.kind === 'clinic' ? 'secretary' : 'partner'}` : undefined },
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
        <Btn kind="primary" title={t('دخول')} onPress={() => router.push({ pathname: '/login', params: { role: join ? 'doctor' : f.kind === 'clinic' ? 'secretary' : 'partner' } })} />
      </Card>
    </Screen>
  );

  return (
    <Screen max={620}>
      <Card>
        <H>{t('إنشاء حساب')}</H>
        <Select label={t('نوع الحساب')} value={f.kind} options={KINDS} render={(v) => v ? t(KIND_LABEL[v]) : t('اختار نوع الحساب')} onChange={(v) => set('kind', v)} />
        {join && <P mute small>{t('سجّل ببريدك الخاص. السكرتير يضيف اسمك ويدعوك بنفس البريد حتى تظهر عندك مراجعات العيادة.')}</P>}
        {f.kind === 'clinic' && <P mute small>{t('السكرتير ينشئ العيادة ويدير فريقها والربط مع الجهات الأخرى.')}</P>}
        {f.kind && !join ? (<>
        <Field label={t('اسم العيادة')} value={f.name} onChangeText={(v) => set('name', v)} />
        <Field label={t('الاختصاص')} value={f.specialty} onChangeText={(v) => set('specialty', v)} />
        <Field label={t('تلفون العيادة')} value={f.phone} onChangeText={(v) => set('phone', v)} keyboardType="phone-pad" />
        <Row style={{ flexWrap: 'nowrap' }}>
          <Select label={t('المحافظة')} value={f.gov} options={GOVS} onChange={(v) => setF((x) => ({ ...x, gov: v, area: areasOf(v)[0] }))} />
          <Select label={t('المنطقة')} value={f.area} options={areasOf(f.gov)} onChange={(v) => set('area', v)} />
        </Row>
        <Field label={t('رابط العيادة (حروف إنكليزية صغيرة)')} value={f.slug} onChangeText={(v) => set('slug', v.toLowerCase().replace(/[^a-z0-9-]/g, ''))} autoCapitalize="none" placeholder="dr-ali" style={{ textAlign: 'left' }} />
        {f.slug ? <P small mute>{`${SITE_URL || ''}/c/${f.slug}`}</P> : null}
        </>) : null}
        <H size={16} style={{ marginTop: 16 }}>{t('حسابك')}</H>
        <Field label={t('البريد الإلكتروني')} value={f.email} onChangeText={(v) => set('email', v)} autoCapitalize="none" keyboardType="email-address" autoComplete="email" style={{ textAlign: 'left' }} />
        <Field label={t('كلمة السر (٨ أحرف أو أكثر)')} value={f.pass} onChangeText={(v) => set('pass', v)} secureTextEntry autoComplete="new-password" textContentType="newPassword" />
        {err ? <Note tone="err">{err}</Note> : null}
        <Btn kind="primary" title={t('إنشاء حساب')} onPress={go} busy={busy} style={{ marginTop: 14 }} />
        <Link href="/login" asChild><Pressable style={{ marginTop: 12 }}><Text style={{ color: C.teal }}>{t('عندك حساب؟ ادخل')}</Text></Pressable></Link>
      </Card>
    </Screen>
  );
}
