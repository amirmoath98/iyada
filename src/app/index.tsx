import { Link, router } from 'expo-router';
import { useEffect } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { LangSwitch } from '@/components/Shell';
import { Btn, Card, H, Note, P, Row, Screen, useT } from '@/components/ui';
import { useSession } from '@/lib/session';
import { configured } from '@/lib/supabase';
import { C } from '@/lib/theme';

const FEATURES = [
  ['الحجز بدون تطبيق', 'المريض يحجز من رابط العيادة أو الـ QR أو الواتساب، ويتابع دوره من بيته.'],
  ['شاشة للصالة', 'تعرض اسم المريض الداخل بس، والسكرتير يرتب الدخول بحرية.'],
  ['ملف كامل للطبيب', 'حالة المريض وأجوبته ومرفقاته قبل ما يدخل، وأرشيف بكل زياراته وعملياته.'],
  ['تذكير على الواتساب', 'القريب يتذكر قبل دوره بساعة، والبعيد صباح اليوم.'],
  ['ربط ويا العيادات', 'إحالة للأشعة والمختبر والصيدلية، والنتيجة ترجع لملف المريض.'],
  ['يشتغل على كل جهاز', 'موقع على الكمبيوتر، وتطبيق على الآيفون والأندرويد.'],
];

export default function Landing() {
  const t = useT();
  const { session, active, isAdmin } = useSession();
  // التطبيق على الموبايل يفتح مباشرة على واجهة الحساب
  useEffect(() => {
    if (Platform.OS !== 'web' && session && active) {
      router.replace(active.role === 'doctor' ? '/doctor' : active.role === 'partner' ? '/partner' : '/secretary');
    }
  }, [session, active]);
  const home = active ? (active.role === 'doctor' ? '/doctor' : active.role === 'partner' ? '/partner' : '/secretary') : '/login';
  return (
    <Screen>
      <Row style={{ justifyContent: 'space-between' }}>
        <Row>
          <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: C.teal, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 18 }}>ع</Text>
          </View>
          <Text style={{ fontWeight: '700', fontSize: 18, color: C.ink }}>{t('عيادتي')}</Text>
        </Row>
        <Row><LangSwitch />{isAdmin && <Link href="/admin" asChild><Pressable><Text style={{ color: C.teal }}>{t('الإدارة')}</Text></Pressable></Link>}</Row>
      </Row>
      {!configured && <Note tone="err">{t('التطبيق مو مربوط بقاعدة بيانات. أضف مفاتيح Supabase بملف .env')}</Note>}
      <View style={{ backgroundColor: C.deep, borderRadius: 20, padding: 28, gap: 12 }}>
        <Text accessibilityRole="header" style={{ color: '#fff', fontSize: 34, fontWeight: '700', lineHeight: 44 }}>{t('العيادة بدون زحمة، والدور بدون انتظار')}</Text>
        <Text style={{ color: '#DDEFEA', fontSize: 17, lineHeight: 28, maxWidth: 620 }}>
          {t('نظام حجز ودور للعيادات العراقية: السكرتير ينظم، الطبيب يشوف ملف المريض قبل ما يدخل، والمريض يعرف دوره من بيته.')}
        </Text>
        <Row>
          <Link href={home as never} asChild><Pressable style={{ backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 20, minHeight: 48, justifyContent: 'center' }}><Text style={{ color: C.teal, fontWeight: '700', fontSize: 16 }}>{session ? t('افتح واجهتي') : t('دخول العيادات')}</Text></Pressable></Link>
          <Link href="/c/dr-ahmed" asChild><Pressable style={{ borderColor: 'rgba(255,255,255,.6)', borderWidth: 1, borderRadius: 10, paddingHorizontal: 20, minHeight: 48, justifyContent: 'center' }}><Text style={{ color: '#fff', fontWeight: '600', fontSize: 16 }}>{t('شوف صفحة عيادة تجريبية')}</Text></Pressable></Link>
        </Row>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
        {FEATURES.map(([h, p]) => (
          <Card key={h} style={{ flexGrow: 1, flexBasis: 260 }}><H size={17}>{t(h)}</H><P mute>{t(p)}</P></Card>
        ))}
      </View>
      <Card>
        <H>{t('سجّل عيادتك')}</H>
        <P mute>{t('تواصل ويانا حتى نفتحلك حساب ونجهز صفحة عيادتك وشاشة الصالة. أول ٣ أشهر مجاناً.')}</P>
        <Row style={{ marginTop: 8 }}><Btn kind="primary" title={t('دخول العيادات')} onPress={() => router.push('/login')} /></Row>
      </Card>
    </Screen>
  );
}
