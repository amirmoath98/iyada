import { useLocalSearchParams } from 'expo-router';
import { useKeepAwake } from 'expo-keep-awake';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useT } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { C } from '@/lib/theme';

type Now = { clinic: string; doctor: string; specialty: string; name: string | null; version: number | null };

// شاشة الصالة: اسم الداخل بس. تحفظ آخر حالة وتكمل إذا انقطع النت.
export default function Display() {
  useKeepAwake();
  const t = useT();
  const { clinicId } = useLocalSearchParams<{ clinicId: string }>();
  const [d, setD] = useState<Now | null>(null);
  const [clock, setClock] = useState('');
  const [stale, setStale] = useState(false);
  const key = `iyada.display.${clinicId}`;

  useEffect(() => {
    AsyncStorage.getItem(key).then((v) => { if (v) try { setD(JSON.parse(v)); } catch {} }).catch(() => {});
    const load = async () => {
      const { data, error } = await supabase.rpc('display_now', { p_clinic: clinicId });
      if (error || !data) { setStale(true); return; }
      setStale(false);
      setD((cur) => (cur && cur.version === (data as Now).version && cur.name === (data as Now).name ? cur : (data as Now)));
      AsyncStorage.setItem(key, JSON.stringify(data)).catch(() => {});
    };
    load();
    const i = setInterval(load, 3000);
    const c = setInterval(() => setClock(new Date().toLocaleTimeString('ar-IQ', { hour: 'numeric', minute: '2-digit' })), 10000);
    setClock(new Date().toLocaleTimeString('ar-IQ', { hour: 'numeric', minute: '2-digit' }));
    return () => { clearInterval(i); clearInterval(c); };
  }, [clinicId, key]);

  return (
    <View style={{ flex: 1, backgroundColor: C.deep, padding: 40, justifyContent: 'space-between' }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View>
          <Text style={{ color: '#fff', fontSize: 30, fontWeight: '700' }}>{d?.doctor ?? ''}</Text>
          <Text style={{ color: '#DDEFEA', fontSize: 20 }}>{d?.specialty ?? ''}</Text>
        </View>
        <Text style={{ color: '#fff', fontSize: 34 }}>{clock}</Text>
      </View>
      <View style={{ alignItems: 'center', gap: 16 }}>
        <Text style={{ color: '#DDEFEA', fontSize: 34 }}>{t('الآن عند الطبيب')}</Text>
        <Text accessibilityLiveRegion="polite" adjustsFontSizeToFit numberOfLines={2}
          style={{ color: '#fff', fontSize: 110, fontWeight: '700', textAlign: 'center' }}>{d?.name ?? '—'}</Text>
      </View>
      <Text style={{ color: '#DDEFEA', fontSize: 20 }}>
        {stale ? t('الاتصال ضعيف، تعرض آخر حالة.') : t('تابع دورك على الواتساب، وراح نذكرك قبل ما يجي دورك.')}
      </Text>
    </View>
  );
}
