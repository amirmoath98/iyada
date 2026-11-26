import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
  type StyleProp, type TextInputProps, type TextStyle, type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { C } from '@/lib/theme';

export function useT() {
  const { t } = useTranslation();
  return t as unknown as (k: string, o?: Record<string, unknown>) => string;
}

export function Screen({ children, scroll = true, max = 1240 }: { children: ReactNode; scroll?: boolean; max?: number }) {
  const inner = <View style={[s.wrap, { maxWidth: max }]}>{children}</View>;
  return (
    <SafeAreaView style={s.screen} edges={['top', 'left', 'right']}>
      {scroll ? <ScrollView contentContainerStyle={{ paddingBottom: 48 }} keyboardShouldPersistTaps="handled">{inner}</ScrollView> : inner}
    </SafeAreaView>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[s.card, style]}>{children}</View>;
}

export function H({ children, size = 20, style }: { children: ReactNode; size?: number; style?: StyleProp<TextStyle> }) {
  return <Text accessibilityRole="header" style={[s.h, { fontSize: size }, style]}>{children}</Text>;
}

export function P({ children, mute, small, style, selectable }: { children: ReactNode; mute?: boolean; small?: boolean; style?: StyleProp<TextStyle>; selectable?: boolean }) {
  return <Text selectable={selectable} style={[s.p, mute && { color: C.mute }, small && { fontSize: 13 }, style]}>{children}</Text>;
}

type BtnKind = 'primary' | 'dark' | 'plain' | 'light' | 'ghostLight';
export function Btn({ title, onPress, kind = 'plain', disabled, busy, small, style, label }: {
  title: string; onPress?: () => void; kind?: BtnKind; disabled?: boolean; busy?: boolean; small?: boolean;
  style?: StyleProp<ViewStyle>; label?: string;
}) {
  const bg = { primary: C.teal, dark: C.ink, plain: C.card, light: '#fff', ghostLight: 'transparent' }[kind];
  const fg = { primary: '#fff', dark: '#fff', plain: C.ink, light: C.teal, ghostLight: '#fff' }[kind];
  const bd = { primary: C.teal, dark: C.ink, plain: C.line, light: '#fff', ghostLight: 'rgba(255,255,255,.6)' }[kind];
  return (
    <Pressable
      accessibilityRole="button" accessibilityLabel={label ?? title} accessibilityState={{ disabled: !!(disabled || busy) }}
      disabled={disabled || busy} onPress={onPress}
      style={({ pressed }) => [s.btn, small && s.btnSm, { backgroundColor: bg, borderColor: bd, opacity: disabled ? 0.5 : pressed ? 0.8 : 1 }, style]}>
      {busy ? <ActivityIndicator color={fg} /> : <Text style={[s.btnT, small && { fontSize: 13 }, { color: fg }]}>{title}</Text>}
    </Pressable>
  );
}

export function Field({ label, error, ...rest }: TextInputProps & { label: string; error?: string }) {
  return (
    <View style={{ marginTop: 10 }}>
      <Text style={s.label}>{label}</Text>
      <TextInput accessibilityLabel={label} placeholderTextColor="#8A948E" style={[s.input, rest.multiline && { minHeight: 84, textAlignVertical: 'top' }]} {...rest} />
      {error ? <Text style={s.err} accessibilityLiveRegion="polite">{error}</Text> : null}
    </View>
  );
}

// قائمة اختيار تشتغل على الويب والموبايل
export function Select({ label, value, options, onChange, render }: {
  label: string; value: string; options: string[]; onChange: (v: string) => void; render?: (v: string) => string;
}) {
  const [open, setOpen] = useState(false);
  const show = render ?? ((v: string) => v);
  return (
    <View style={{ marginTop: 10, flex: 1 }}>
      <Text style={s.label}>{label}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${show(value)}`} onPress={() => setOpen(true)} style={s.input}>
        <Text style={{ color: C.ink, fontSize: 16 }}>{show(value) || '—'} ▾</Text>
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={s.backdrop} onPress={() => setOpen(false)} accessibilityLabel="إغلاق">
          <View style={s.sheet}>
            <Text style={[s.h, { fontSize: 16, padding: 14 }]}>{label}</Text>
            <ScrollView style={{ maxHeight: 420 }}>
              {options.map((o) => (
                <Pressable key={o} accessibilityRole="button" onPress={() => { onChange(o); setOpen(false); }}
                  style={[s.opt, o === value && { backgroundColor: C.tealSoft }]}>
                  <Text style={{ fontSize: 16, color: C.ink }}>{show(o) || '—'}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

export function Chip({ text, tone = 'soft' }: { text: string; tone?: 'soft' | 'in' | 'next' | 'wait' | 'done' | 'ref' | 'warn' }) {
  const m = {
    soft: [C.soft, C.ink], in: [C.teal, '#fff'], next: [C.amber, C.amberInk], wait: [C.tealSoft, C.teal],
    done: [C.soft, C.mute], ref: [C.plum, C.plumInk], warn: [C.warn, C.warnInk],
  }[tone];
  return <View style={[s.chip, { backgroundColor: m[0] }]}><Text style={{ color: m[1], fontSize: 12, fontWeight: '600' }}>{text}</Text></View>;
}

export function Row({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 }, style]}>{children}</View>;
}

export function Note({ children, tone = 'warn' }: { children: ReactNode; tone?: 'warn' | 'ok' | 'err' }) {
  const bg = tone === 'warn' ? C.warn : tone === 'ok' ? C.tealSoft : '#FBE3E3';
  const fg = tone === 'warn' ? C.warnInk : tone === 'ok' ? C.teal : C.danger;
  return <View style={{ backgroundColor: bg, borderRadius: 10, padding: 10, marginTop: 8 }}><Text style={{ color: fg, fontSize: 13 }}>{children}</Text></View>;
}

export function Loading() {
  return <View style={{ padding: 40, alignItems: 'center' }}><ActivityIndicator color={C.teal} /></View>;
}

export const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  wrap: { width: '100%', alignSelf: 'center', padding: 16, gap: 16 },
  card: { backgroundColor: C.card, borderColor: C.line, borderWidth: 1, borderRadius: 14, padding: 16 },
  h: { color: C.ink, fontWeight: '700', marginBottom: 6, textAlign: 'auto' },
  p: { color: C.ink, fontSize: 15, lineHeight: 24, textAlign: 'auto' },
  btn: { minHeight: 44, paddingHorizontal: 16, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  btnSm: { minHeight: 36, paddingHorizontal: 10 },
  btnT: { fontWeight: '600', fontSize: 15 },
  label: { color: C.mute, fontSize: 13, marginBottom: 4, textAlign: 'auto' },
  input: { minHeight: 44, borderWidth: 1, borderColor: C.line, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, fontSize: 16, color: C.ink, backgroundColor: C.card, justifyContent: 'center', textAlign: 'right' },
  err: { color: C.danger, fontSize: 13, marginTop: 4 },
  chip: { paddingHorizontal: 9, paddingVertical: 2, borderRadius: 999, alignSelf: 'flex-start' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,.4)', justifyContent: 'center', padding: 24 },
  sheet: { backgroundColor: C.card, borderRadius: 14, maxWidth: 420, width: '100%', alignSelf: 'center', overflow: 'hidden' },
  opt: { paddingVertical: 12, paddingHorizontal: 16, borderTopWidth: 1, borderTopColor: C.line },
});
