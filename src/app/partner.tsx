import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { ReferralMedia } from '@/components/ReferralMedia';
import { Shell } from '@/components/Shell';
import { Btn, Card, Chip, Field, H, Note, P, Row, useT } from '@/components/ui';
import { useSession } from '@/lib/session';
import { errText, supabase } from '@/lib/supabase';
import { C } from '@/lib/theme';
import { fmtDate, type Referral } from '@/lib/types';

// واجهة العيادة المرتبطة (أشعة، مختبر، صيدلية): تشوف الإحالة بس، مو ملف المريض كامل
export default function Partner() {
  return <Shell need={['partner', 'doctor', 'secretary']}><Body /></Shell>;
}

type Row = Referral & { from: { name: string; doctor_name: string } };
type Pending = { id: string; from: { name: string } };

function Body() {
  const t = useT();
  const { active } = useSession();
  const id = active!.clinic.id;
  const [refs, setRefs] = useState<Row[]>([]);
  const [pend, setPend] = useState<Pending[]>([]);
  const [msg, setMsg] = useState('');
  const load = async () => {
    const [r, p] = await Promise.all([
      supabase.from('referrals').select('*, from:clinics!referrals_from_clinic_fkey(name, doctor_name)').eq('to_clinic', id).order('created_at', { ascending: false }).limit(100),
      supabase.from('clinic_links').select('id, from:clinics!clinic_links_from_clinic_fkey(name)').eq('to_clinic', id).eq('status', 'pending'),
    ]);
    setRefs((r.data as unknown as Row[]) ?? []); setPend((p.data as unknown as Pending[]) ?? []);
  };
  useEffect(() => {
    load();
    const ch = supabase.channel(`refs-${id}`).on('postgres_changes', { event: '*', schema: 'public', table: 'referrals', filter: `to_clinic=eq.${id}` }, load).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [id]);

  return (
    <>
      {pend.length > 0 && (
        <Card>
          <H size={17}>{t('طلبات ربط')}</H>
          {pend.map((p) => (
            <Row key={p.id} style={{ justifyContent: 'space-between', paddingVertical: 8 }}>
              <P style={{ flex: 1 }}>{p.from?.name}</P>
              <Btn small kind="primary" title={t('موافقة')} onPress={async () => { const { error } = await supabase.rpc('link_respond', { p_link: p.id, p_accept: true }); setMsg(error ? errText(error) : ''); load(); }} />
              <Btn small title={t('رفض')} onPress={async () => { const { error } = await supabase.rpc('link_respond', { p_link: p.id, p_accept: false }); setMsg(error ? errText(error) : ''); load(); }} />
            </Row>
          ))}
        </Card>
      )}
      {msg ? <Note tone="err">{msg}</Note> : null}
      <H size={18}>{t('المرضى المحالين')}</H>
      {refs.length === 0 && <Card><P mute>{t('ما في إحالات بعد.')}</P></Card>}
      {refs.map((r) => <RefCard key={r.id} r={r} onDone={load} />)}
    </>
  );
}

function RefCard({ r, onDone }: { r: Row; onDone: () => void }) {
  const t = useT();
  const { active } = useSession();
  const [v, setV] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  return (
    <Card>
      <Row style={{ justifyContent: 'space-between' }}>
        <H size={17} style={{ marginBottom: 0 }}>{r.patient_name}</H>
        <Chip text={`${t('محال من')} ${r.from?.doctor_name ?? ''}`} tone="ref" />
      </Row>
      <P mute small>{fmtDate(r.created_at)} · {t('المطلوب:')} {r.what}</P>
      {(active?.role === 'doctor' || active?.role === 'partner') && <ReferralMedia referralId={r.id} allowUpload />}
      {r.result ? (
        <View style={{ backgroundColor: C.tealSoft, borderRadius: 10, padding: 10, marginTop: 8 }}><P>{t('النتيجة انرسلت:')} {r.result}</P></View>
      ) : (
        <>
          <Field label={t('النتيجة أو التقرير')} value={v} onChangeText={setV} multiline />
          {err ? <Note tone="err">{err}</Note> : null}
          <Btn kind="primary" title={t('ارفع النتيجة وارجعها للطبيب')} busy={busy} style={{ marginTop: 10 }}
            onPress={async () => {
              if (v.trim().length < 2) return;
              setBusy(true);
              const { error } = await supabase.rpc('referral_result', { p_ref: r.id, p_result: v });
              setBusy(false);
              if (error) setErr(errText(error)); else onDone();
            }} />
        </>
      )}
    </Card>
  );
}
