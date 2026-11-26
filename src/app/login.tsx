import { Link, router, useLocalSearchParams } from 'expo-router';
import { Pressable, Text } from 'react-native';
import { C } from '@/lib/theme';
import { useEffect, useState } from 'react';
import { Btn, Card, Field, H, Loading, Note, P, Row, Screen, useT } from '@/components/ui';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import type { Role } from '@/lib/types';

const roles: Role[] = ['doctor', 'secretary', 'partner'];
const labels = { doctor: 'دخول الدكتور', secretary: 'دخول السكرتير', partner: 'دخول الجهات المرتبطة' };
const destination = { doctor: '/doctor', secretary: '/secretary', partner: '/partner' } as const;

export default function Login() {
  const t = useT();
  const { role } = useLocalSearchParams<{ role?: Role }>();
  const { session, loading, memberships, active, setActive, signOut, refresh } = useSession();
  const [selected, setSelected] = useState<Role | null>(roles.find((r) => r === role) ?? null);
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const matching = active?.role === selected ? active : memberships.find((m) => m.role === selected);
  useEffect(() => {
    if (!session || loading || !selected || !matching) return;
    if (active !== matching) setActive(matching);
    else router.replace(destination[selected]);
  }, [session, loading, selected, matching, active, setActive]);

  async function go() {
    setErr('');
    if (!selected) return setErr(t('اختار نوع الدخول'));
    if (!email.includes('@') || pass.length < 6) { setErr(t('اكتب البريد وكلمة السر')); return; }
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: pass });
    setBusy(false);
    if (error) setErr(/confirm/i.test(error.message) ? t('لازم تأكد بريدك أول. افتح الرسالة اللي وصلتك.') : t('البريد أو كلمة السر غلط'));
  }

  return (
    <Screen max={460}>
      <Card>
        <H>{t(selected ? labels[selected] : 'اختار نوع الدخول')}</H>
        <Row>
          {roles.map((r) => <Btn key={r} small kind={r === selected ? 'dark' : 'plain'} title={t(labels[r])} onPress={() => { setSelected(r); setErr(''); }} />)}
        </Row>
        {loading ? <Loading /> : session ? (
          <>
            {selected && !matching && <Note>{t(selected === 'doctor'
              ? 'هذا الحساب ما عنده صلاحية طبيب. إذا سجّلت كطبيب، اطلب من السكرتير يضيف نفس بريدك. وإذا هذا حساب العيادة، بدّل لحساب الدكتور.'
              : 'هذا الحساب ما عنده صلاحية لهذا النوع. اختار دوره أو بدّل الحساب.')}</Note>}
            <Row>
              {selected && !matching && <Btn title={t('تحقّق من الربط')} onPress={refresh} />}
              <Btn title={t('بدّل الحساب')} onPress={signOut} />
            </Row>
          </>
        ) : selected ? (<>
        <Field label={t('البريد الإلكتروني')} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" textContentType="username" style={{ textAlign: 'left' }} />
        <Field label={t('كلمة السر')} value={pass} onChangeText={setPass} secureTextEntry autoComplete="password" textContentType="password" onSubmitEditing={go} />
        {err ? <Note tone="err">{err}</Note> : null}
        <Btn kind="primary" title={t('دخول')} onPress={go} busy={busy} style={{ marginTop: 14 }} />
        </>) : null}
        {!session && <Link href="/signup" asChild><Pressable style={{ marginTop: 12 }}><Text style={{ color: C.teal }}>{t('إنشاء حساب')}</Text></Pressable></Link>}
      </Card>
    </Screen>
  );
}
