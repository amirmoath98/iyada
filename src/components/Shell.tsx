import { Link, router, usePathname } from 'expo-router';
import type { ReactNode } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { LANGS, setLang } from '@/i18n';
import { useSession } from '@/lib/session';
import { C } from '@/lib/theme';
import { Btn, Loading, Note, Screen, useT } from './ui';
import i18n from '@/i18n';

const NAV: Record<string, { href: string; label: string }[]> = {
  secretary: [{ href: '/secretary', label: 'الدور اليوم' }, { href: '/settings', label: 'إعدادات العيادة' }],
  doctor: [{ href: '/doctor', label: 'مرضى اليوم' }, { href: '/archive', label: 'أرشيف المرضى' }, { href: '/partner', label: 'الإحالات الواردة' }],
  partner: [{ href: '/partner', label: 'الإحالات' }, { href: '/settings', label: 'إعدادات العيادة' }],
};

export function LangSwitch() {
  return (
    <View style={{ flexDirection: 'row', gap: 6 }}>
      {LANGS.map((l) => (
        <Pressable key={l.code} accessibilityRole="button" onPress={() => setLang(l.code)}
          style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: C.line, backgroundColor: i18n.language === l.code ? C.ink : C.card }}>
          <Text style={{ color: i18n.language === l.code ? '#fff' : C.ink, fontSize: 13 }}>{l.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

// إطار الواجهات الداخلية: يتأكد من تسجيل الدخول والصلاحية
export function Shell({ need, children }: { need: ('doctor' | 'secretary' | 'partner')[]; children: ReactNode }) {
  const t = useT();
  const path = usePathname();
  const { session, loading, memberships, active, setActive, signOut } = useSession();
  if (loading) return <Screen><Loading /></Screen>;
  if (!session) { router.replace('/login'); return null; }
  const ok = active && need.includes(active.role);
  return (
    <Screen>
      <View style={{ backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.line, padding: 12, gap: 10 }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
          <Image source={require('../../assets/mark.png')} style={{ width: 36, height: 36 }} accessibilityLabel={t('عيادة')} />
          <Text style={{ fontWeight: '700', color: C.ink, flexGrow: 1 }}>{active ? `${active.clinic.name}` : t('عيادة')}</Text>
          <LangSwitch />
          <Btn small title={t('خروج')} onPress={signOut} />
        </View>
        {active && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {(NAV[active.role] ?? []).map((n) => (
              <Link key={n.href} href={n.href as never} asChild>
                <Pressable accessibilityRole="link" style={{ paddingHorizontal: 12, minHeight: 40, justifyContent: 'center', borderRadius: 999, borderWidth: 1, borderColor: path === n.href ? C.ink : C.line, backgroundColor: path === n.href ? C.ink : C.card }}>
                  <Text style={{ color: path === n.href ? '#fff' : C.ink, fontSize: 14 }}>{t(n.label)}</Text>
                </Pressable>
              </Link>
            ))}
            {memberships.length > 1 && memberships.filter((m) => m !== active).map((m) => (
              <Btn key={m.clinic.id + m.role} small title={`${t('بدّل إلى')} ${m.clinic.name}`} onPress={() => {
                setActive(m);
                router.replace(m.role === 'doctor' ? '/doctor' : m.role === 'partner' ? '/partner' : '/secretary');
              }} />
            ))}
          </View>
        )}
      </View>
      {!active ? <Note>{t('حسابك مو مربوط بأي عيادة بعد. تواصل ويا إدارة التطبيق.')}</Note>
        : !ok ? <Note>{t('ما عندك صلاحية لهالصفحة.')}</Note> : children}
    </Screen>
  );
}
