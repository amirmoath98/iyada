import { useEffect, useState } from 'react';
import { Image, Linking, Pressable, Text, View } from 'react-native';
import { supabase } from '@/lib/supabase';
import { C } from '@/lib/theme';
import { P, useT } from './ui';

// صور المريض مثل ما وصلت، بروابط موقّعة تنتهي بعد ساعة
export function Attachments({ paths }: { paths: string[] }) {
  const t = useT();
  const [urls, setUrls] = useState<string[]>([]);
  useEffect(() => {
    if (!paths.length) { setUrls([]); return; }
    supabase.storage.from('attachments').createSignedUrls(paths, 3600)
      .then(({ data }) => setUrls((data ?? []).map((d) => d.signedUrl).filter(Boolean) as string[]));
  }, [paths.join('|')]);
  if (!paths.length) return <P mute>{t('ما في مرفقات')}</P>;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {urls.map((u, i) => (
        <Pressable key={u} accessibilityRole="imagebutton" accessibilityLabel={`${t('مرفق')} ${i + 1}`} onPress={() => Linking.openURL(u)}>
          <Image source={{ uri: u }} style={{ width: 120, height: 90, borderRadius: 10, borderWidth: 1, borderColor: C.line }} />
        </Pressable>
      ))}
    </View>
  );
}

export function QA({ q, a }: { q: string; a?: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: C.line }}>
      <Text style={{ color: C.mute, flexShrink: 1 }}>{q}</Text>
      <Text style={{ color: C.ink, fontWeight: '600', flexShrink: 1, textAlign: 'auto' }}>{a || '—'}</Text>
    </View>
  );
}
