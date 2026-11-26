import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useState } from 'react';
import { Linking, View } from 'react-native';
import { Btn, Note, P, Row, useT } from '@/components/ui';
import { supabase } from '@/lib/supabase';

const MAX_BYTES = 30 * 1024 * 1024;
const MIME_BY_EXTENSION = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
  gif: 'image/gif', heic: 'image/heic', heif: 'image/heif',
  mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', '3gp': 'video/3gpp',
} as const;
type Extension = keyof typeof MIME_BY_EXTENSION;
type MediaRow = { name: string; video: boolean };

function extensionOf(name: string): Extension | undefined {
  const extension = name.split('.').pop()?.toLowerCase();
  return extension && Object.prototype.hasOwnProperty.call(MIME_BY_EXTENSION, extension)
    ? extension as Extension
    : undefined;
}

export function ReferralMedia({ referralId, allowUpload = false }: { referralId: string; allowUpload?: boolean }) {
  const t = useT();
  const bucket = supabase.storage.from('referral-media');
  const [files, setFiles] = useState<MediaRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [listing, setListing] = useState(true);
  const [opening, setOpening] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);

  const load = useCallback(async () => {
    setListing(true);
    const rows: MediaRow[] = [];
    for (let offset = 0; ; offset += 100) {
      const { data, error } = await supabase.storage.from('referral-media')
        .list(referralId, { limit: 100, offset, sortBy: { column: 'name', order: 'desc' } });
      if (error) {
        setMessage({ tone: 'err', text: 'تعذّر تحميل مرفقات الإحالة. حدّث القائمة وجرّب مرة ثانية.' });
        break;
      }
      rows.push(...data.flatMap((file) => {
        const ext = extensionOf(file.name);
        return file.id && ext && MIME_BY_EXTENSION[ext]
          ? [{ name: file.name, video: MIME_BY_EXTENSION[ext].startsWith('video/') }]
          : [];
      }));
      if (data.length < 100) {
        setFiles(rows);
        break;
      }
    }
    setListing(false);
  }, [referralId]);

  useEffect(() => { void load(); }, [load]);

  async function pick() {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images', 'videos'],
        allowsEditing: false,
        quality: 1,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset) return;
      const ext = Object.keys(MIME_BY_EXTENSION).find((key) => MIME_BY_EXTENSION[key as Extension] === asset.mimeType) as Extension | undefined
        ?? extensionOf(asset.fileName ?? asset.uri.split('?')[0]);
      const mime = ext && MIME_BY_EXTENSION[ext];
      if (!mime) {
        setMessage({ tone: 'err', text: 'اختار صورة أو فيديو بصيغة مدعومة مثل JPG أو PNG أو MP4 أو MOV.' });
        return;
      }
      if ((asset.fileSize ?? 0) > MAX_BYTES) {
        setMessage({ tone: 'err', text: 'حجم الملف لازم يكون ٣٠ ميغابايت أو أقل.' });
        return;
      }
      const body = await (await fetch(asset.uri)).arrayBuffer();
      if (body.byteLength > MAX_BYTES) {
        setMessage({ tone: 'err', text: 'حجم الملف لازم يكون ٣٠ ميغابايت أو أقل.' });
        return;
      }
      if (!body.byteLength) throw Error('Empty media file');
      const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 12)}.${ext}`;
      const { error } = await bucket.upload(`${referralId}/${filename}`, body, { contentType: mime, upsert: false, cacheControl: '0' });
      if (error) throw error;
      setMessage({ tone: 'ok', text: 'انرسل الملف للطبيب المحيل وظهر ضمن الإحالة.' });
      await load();
    } catch {
      setMessage({ tone: 'err', text: 'ما گدرنا نرفع الملف. تأكد من اتصالك وحاول مرة ثانية.' });
    } finally {
      setBusy(false);
    }
  }

  async function open(file: MediaRow) {
    if (opening) return;
    setOpening(file.name);
    setMessage(null);
    try {
      const { data, error } = await bucket.createSignedUrl(`${referralId}/${file.name}`, 300);
      if (error || !data?.signedUrl) throw Error('Media link unavailable');
      await Linking.openURL(data.signedUrl);
    } catch {
      setMessage({ tone: 'err', text: 'ما گدرنا نفتح الملف. حدّث القائمة وحاول مرة ثانية.' });
    } finally {
      setOpening(null);
    }
  }

  return (
    <View style={{ gap: 6, marginTop: 8 }}>
      <Row>
        {allowUpload && <Btn small title={t('أرسل صورة أشعة أو فيديو')} onPress={pick} busy={busy} />}
        <Btn small title={t('حدّث المرفقات')} onPress={() => { setMessage(null); void load(); }} disabled={listing || busy} />
      </Row>
      {allowUpload && <P mute small>{t('الحد الأقصى للملف ٣٠ ميغابايت.')}</P>}
      {!listing && files.length === 0 && <P mute small>{t('ماكو صور أو فيديوهات مرفقة.')}</P>}
      {files.length > 0 && <Row>{files.map((file, i) => (
        <Btn key={file.name} small title={`${t(file.video ? 'افتح الفيديو' : 'افتح الصورة')} ${i + 1}`}
          onPress={() => open(file)} busy={opening === file.name} />
      ))}</Row>}
      {message && <Note tone={message.tone}>{t(message.text)}</Note>}
    </View>
  );
}
