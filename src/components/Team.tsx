import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useSession } from '@/lib/session';
import { errText, supabase } from '@/lib/supabase';
import { C } from '@/lib/theme';
import { Btn, Card, Chip, Field, H, Note, P, Row, Select, useT } from './ui';

const ROLE_LABEL: Record<string, string> = { doctor: 'طبيب', secretary: 'سكرتير', partner: 'عيادة مرتبطة' };
type Member = { user_id: string; role: string; email: string | null };
type Invite = { id: string; email: string; role: string; accepted_at: string | null };

// فريق العيادة: السكرتير (أو الطبيب) يدعو بالبريد، والمدعو يسوي حساب بنفس البريد وينربط تلقائياً
export function Team({ clinicId }: { clinicId: string }) {
  const t = useT();
  const { userId } = useSession();
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('doctor');
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);

  const load = async () => {
    const [m, i] = await Promise.all([
      supabase.from('staff').select('user_id, role, email').eq('clinic_id', clinicId),
      supabase.from('invites').select('id, email, role, accepted_at').eq('clinic_id', clinicId).is('accepted_at', null),
    ]);
    setMembers((m.data as Member[]) ?? []); setInvites((i.data as Invite[]) ?? []);
  };
  useEffect(() => { load(); }, [clinicId]);

  async function invite() {
    setMsg(null);
    const { error } = await supabase.rpc('invite_staff', { p_clinic: clinicId, p_email: email, p_role: role });
    if (error) { setMsg({ tone: 'err', text: errText(error) }); return; }
    setMsg({ tone: 'ok', text: t('انضافت الدعوة. إذا عنده حساب ينربط هسه، وإذا ما عنده يسوي حساب من «سجّل عيادتك ← عندي دعوة من عيادة» بنفس البريد.') });
    setEmail(''); load();
  }

  return (
    <Card style={{ flexGrow: 1, flexBasis: 320 }}>
      <H size={17}>{t('فريق العيادة')}</H>
      {members.map((m) => (
        <Row key={m.user_id} style={{ justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.line }}>
          <P style={{ flex: 1 }}>{m.email ?? '—'}{m.user_id === userId ? ` (${t('أنت')})` : ''}</P>
          <Chip text={t(ROLE_LABEL[m.role] ?? m.role)} tone="wait" />
          {m.user_id !== userId && (
            <Btn small title={t('إزالة')} onPress={async () => {
              const { error } = await supabase.rpc('remove_staff', { p_clinic: clinicId, p_user: m.user_id });
              setMsg(error ? { tone: 'err', text: errText(error) } : null); load();
            }} />
          )}
        </Row>
      ))}
      {invites.map((i) => (
        <Row key={i.id} style={{ justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.line }}>
          <P style={{ flex: 1 }}>{i.email}</P>
          <Chip text={`${t(ROLE_LABEL[i.role])} · ${t('بانتظار التسجيل')}`} tone="next" />
          <Btn small title={t('إلغاء')} onPress={async () => { await supabase.rpc('cancel_invite', { p_invite: i.id }); load(); }} />
        </Row>
      ))}
      <View style={{ marginTop: 6 }}>
        <Field label={t('بريد الطبيب أو السكرتير الجديد')} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" style={{ textAlign: 'left' }} />
        <Select label={t('الدور')} value={role} options={['doctor', 'secretary']} render={(v) => t(ROLE_LABEL[v])} onChange={setRole} />
        <Btn kind="primary" title={t('أضف للفريق')} onPress={invite} style={{ marginTop: 12 }} disabled={!email.includes('@')} />
      </View>
      {msg && <Note tone={msg.tone}>{msg.text}</Note>}
    </Card>
  );
}
