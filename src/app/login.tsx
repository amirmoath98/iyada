import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Btn, Card, Field, H, Note, P, Screen, useT } from '@/components/ui';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

export default function Login() {
  const t = useT();
  const { session, active } = useSession();
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (session && active) router.replace(active.role === 'doctor' ? '/doctor' : active.role === 'partner' ? '/partner' : '/secretary');
  }, [session, active]);

  async function go() {
    setErr('');
    if (!email.includes('@') || pass.length < 6) { setErr(t('اكتب البريد وكلمة السر')); return; }
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: pass });
    setBusy(false);
    if (error) setErr(t('البريد أو كلمة السر غلط'));
  }

  return (
    <Screen max={460}>
      <Card>
        <H>{t('دخول العيادات')}</H>
        <P mute small>{t('للطبيب والسكرتير والعيادات المرتبطة. المرضى ما يحتاجون حساب.')}</P>
        <Field label={t('البريد الإلكتروني')} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" textContentType="username" style={{ textAlign: 'left' }} />
        <Field label={t('كلمة السر')} value={pass} onChangeText={setPass} secureTextEntry autoComplete="password" textContentType="password" onSubmitEditing={go} />
        {err ? <Note tone="err">{err}</Note> : null}
        <Btn kind="primary" title={t('دخول')} onPress={go} busy={busy} style={{ marginTop: 14 }} />
      </Card>
    </Screen>
  );
}
