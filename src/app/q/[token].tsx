import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { LangSwitch } from '@/components/Shell';
import { Card, Chip, H, Loading, P, Row, Screen, useT } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { C } from '@/lib/theme';
import { fmtTime, TYPE_LABEL, type VisitType } from '@/lib/types';

type Track = { name: string; seq: number; day: string; type: VisitType; status: string; est: string; ahead: number | null;
  clinic: { name: string; doctor: string; address: string } };

// صفحة متابعة الدور: الرابط اللي يوصل للمريض بالواتساب
export default function TrackPage() {
  const t = useT();
  const { token } = useLocalSearchParams<{ token: string }>();
  const [d, setD] = useState<Track | null | undefined>(undefined);
  useEffect(() => {
    const load = () => supabase.rpc('track_booking', { p_token: token }).then(({ data }) => setD((data as Track) ?? null));
    load();
    const i = setInterval(load, 15000);
    return () => clearInterval(i);
  }, [token]);

  if (d === undefined) return <Screen><Loading /></Screen>;
  if (!d) return <Screen max={560}><Card><H>{t('الحجز مو موجود')}</H><P mute>{t('تأكد من الرابط.')}</P></Card></Screen>;
  const st = d.status === 'in' ? t('هسه دورك، تفضل ادخل.') : d.status === 'done' ? t('انتهت زيارتك. نتمنالك السلامة.') : d.status === 'cancelled' ? t('هذا الحجز ملغي.') : null;
  return (
    <Screen max={560}>
      <Row style={{ justifyContent: 'flex-end' }}><LangSwitch /></Row>
      <Card style={{ gap: 6 }}>
        <Row style={{ justifyContent: 'space-between' }}><H>{d.name}</H><Chip text={t(TYPE_LABEL[d.type])} /></Row>
        <P mute>{t('رقم الحجز')} {d.seq} · {d.day} · {t('الوقت التقريبي')} {fmtTime(d.est)}</P>
        {st ? <Text style={{ fontSize: 20, fontWeight: '700', color: C.teal, marginTop: 8 }}>{st}</Text>
          : d.ahead !== null ? <Text style={{ fontSize: 20, color: C.ink, marginTop: 8 }}>{t('قبلك')} <Text style={{ fontWeight: '700' }}>{d.ahead}</Text> {t('مراجع')}</Text>
          : <P>{t('حجزك بيوم ثاني. راح نذكرك على الواتساب.')}</P>}
      </Card>
      <Card><H size={16}>{d.clinic.doctor}</H><P selectable>{d.clinic.address}</P></Card>
      <P small mute>{t('الصفحة تتحدث وحدها كل ربع دقيقة.')}</P>
    </Screen>
  );
}
