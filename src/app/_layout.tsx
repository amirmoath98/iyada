import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { I18nextProvider } from 'react-i18next';
import { Platform, Text, TextInput } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import i18n, { initLang } from '@/i18n';
import { SessionProvider } from '@/lib/session';
import { FONT } from '@/lib/theme';

if (Platform.OS === 'web') {
  // خط عربي واضح على الويب
  const anyText = Text as unknown as { defaultProps?: { style?: unknown } };
  const anyInput = TextInput as unknown as { defaultProps?: { style?: unknown } };
  anyText.defaultProps = { ...(anyText.defaultProps ?? {}), style: { fontFamily: FONT } };
  anyInput.defaultProps = { ...(anyInput.defaultProps ?? {}), style: { fontFamily: FONT } };
  if (typeof document !== 'undefined' && !document.getElementById('plex-font')) {
    const l = document.createElement('link');
    l.id = 'plex-font'; l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;600;700&display=swap';
    document.head.appendChild(l);
  }
}

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  useEffect(() => { initLang().finally(() => setReady(true)); }, []);
  if (!ready) return null;
  return (
    <I18nextProvider i18n={i18n}>
      <SafeAreaProvider>
        <SessionProvider>
          <StatusBar style="dark" />
          <Stack screenOptions={{ headerShown: false }} />
        </SessionProvider>
      </SafeAreaProvider>
    </I18nextProvider>
  );
}
