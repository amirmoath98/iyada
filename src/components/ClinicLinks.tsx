import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Btn, Card, Chip, Field, H, Note, P, Row, useT } from '@/components/ui';
import { errText, supabase } from '@/lib/supabase';
import { C } from '@/lib/theme';

type L = { id: string; status: string; from_clinic: string; to_clinic: string; from: { name: string }; to: { name: string } };
export function ClinicLinks({ clinicId }: { clinicId: string }) {
  const t = useT();
  const [rows, setRows] = useState<L[]>([]);
  const [slug, setSlug] = useState('');
  const [msg, setMsg] = useState('');
  const load = () => supabase.from('clinic_links')
    .select('id, status, from_clinic, to_clinic, from:clinics!clinic_links_from_clinic_fkey(name), to:clinics!clinic_links_to_clinic_fkey(name)')
    .or(`from_clinic.eq.${clinicId},to_clinic.eq.${clinicId}`).then(({ data }) => setRows((data as unknown as L[]) ?? []));
  useEffect(() => { load(); }, [clinicId]);
  const call = async (fn: string, args: Record<string, unknown>) => { const { error } = await supabase.rpc(fn, args); setMsg(error ? errText(error) : ''); load(); };
  const label = { pending: 'بانتظار الموافقة', accepted: 'مرتبطة', rejected: 'مرفوض' } as Record<string, string>;
  return (
    <Card style={{ flexGrow: 1, flexBasis: 320 }}>
      <H size={17}>{t('الربط مع العيادات')}</H>
      <P mute small>{t('كل ربط يحتاج موافقة العيادة الثانية، وأي طرف يگدر يفكه.')}</P>
      {rows.map((r) => {
        const mine = r.from_clinic === clinicId;
        return (
          <Row key={r.id} style={{ justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.line }}>
            <P style={{ flex: 1 }}>{mine ? `→ ${r.to?.name}` : `← ${r.from?.name}`}</P>
            <Chip text={t(label[r.status])} tone={r.status === 'accepted' ? 'wait' : r.status === 'pending' ? 'next' : 'warn'} />
            {!mine && r.status === 'pending' && (<>
              <Btn small kind="primary" title={t('موافقة')} onPress={() => call('link_respond', { p_link: r.id, p_accept: true })} />
              <Btn small title={t('رفض')} onPress={() => call('link_respond', { p_link: r.id, p_accept: false })} />
            </>)}
            {r.status === 'accepted' && <Btn small title={t('فك الربط')} onPress={() => call('link_remove', { p_link: r.id })} />}
          </Row>
        );
      })}
      <Row style={{ flexWrap: 'nowrap', alignItems: 'flex-end' }}>
        <View style={{ flex: 1 }}><Field label={t('معرّف العيادة الثانية (من رابطها)')} value={slug} onChangeText={setSlug} autoCapitalize="none" placeholder="rad-center" /></View>
        <Btn title={t('طلب ربط')} onPress={() => { if (slug.trim()) { call('link_request', { p_from: clinicId, p_to_slug: slug.trim() }); setSlug(''); } }} />
      </Row>
      {msg ? <Note tone="err">{msg}</Note> : null}
    </Card>
  );
}
