// اللغات: عربي (الأساس)، كردي سوراني (ckb)، إنكليزي.
// المفاتيح هي النص العربي نفسه، فأي نص ما إله ترجمة يطلع بالعربي.
// ترجمة السوراني تحتاج مراجعة من شخص يحچيها قبل الإطلاق.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocales } from 'expo-localization';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { I18nManager, Platform } from 'react-native';
import { ckb } from './ckb';
import { en } from './en';

export type Lang = 'ar' | 'ckb' | 'en';
export const LANGS: { code: Lang; label: string }[] = [
  { code: 'ar', label: 'العربية' },
  { code: 'ckb', label: 'کوردی' },
  { code: 'en', label: 'English' },
];
const KEY = 'iyada.lang';
export const isRTL = (l: string) => l !== 'en';

function applyDir(l: Lang) {
  if (Platform.OS === 'web') {
    if (typeof document !== 'undefined') {
      document.documentElement.dir = isRTL(l) ? 'rtl' : 'ltr';
      document.documentElement.lang = l;
    }
  } else {
    I18nManager.allowRTL(true);
    I18nManager.forceRTL(isRTL(l)); // بالموبايل يتطبق بعد إعادة فتح التطبيق
  }
}

i18n.use(initReactI18next).init({
  resources: { ar: { translation: {} }, ckb: { translation: ckb }, en: { translation: en } },
  lng: 'ar',
  fallbackLng: 'ar',
  keySeparator: false,
  nsSeparator: false,
  interpolation: { escapeValue: false },
  returnEmptyString: false,
});

export async function initLang() {
  let l = (await AsyncStorage.getItem(KEY).catch(() => null)) as Lang | null;
  if (!l) {
    // الافتراضي عربي؛ الكردي إذا الجهاز بالكردي. الإنكليزي بس إذا المستخدم اختاره.
    const sys = getLocales()[0]?.languageCode ?? 'ar';
    l = sys === 'ckb' || sys === 'ku' ? 'ckb' : 'ar';
  }
  await i18n.changeLanguage(l);
  applyDir(l);
}

export async function setLang(l: Lang) {
  await AsyncStorage.setItem(KEY, l).catch(() => {});
  await i18n.changeLanguage(l);
  applyDir(l);
}

export default i18n;
