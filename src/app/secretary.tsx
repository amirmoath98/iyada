import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Shell } from '@/components/Shell';
import { Btn, Card, Chip, Field, H, Loading, Note, P, Row, Select, useT } from '@/components/ui';
import { estOf } from '@/lib/est';
import { areasOf, GOVS } from '@/lib/geo';
import { useSession } from '@/lib/session';
import { errText, supabase } from '@/lib/supabase';
import { C } from '@/lib/theme';
import { fmtTime, TYPE_LABEL, type Queue, type QueueItem, type VisitType } from '@/lib/types';
import { statusOf, STATUS_LABEL, useClinicDay } from '@/lib/useClinicDay';

const TONE = { done: 'done', in: 'in', next: 'next', wait: 'wait', x: 'warn' } as const;

export default function Secretary() {
  return <Shell need={['secretary']}><Body /></Shell>;
}

function Body() {
  const t = useT();
  const { active } = useSession();
  const clinic = active!.clinic;
  const { queue, setQueue, bookings, loading, offline, reload } = useClinicDay(clinic.id);
  const [toast, setToast] = useState<{ text: string; snap?: Queue } | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  function flash(text: string, snap?: Queue) {
    setToast({ text, snap });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 6000);
  }

  async function setItems(items: QueueItem[], cur: number, msg?: string, snap?: Queue) {
    if (!queue) return;
    setErr('');
    const prev = queue;
    setQueue({ ...queue, items, cur }); // يبين فوراً
    const { data, error } = await supabase.rpc('queue_set', { p_clinic: clinic.id, p_items: items, p_cur: cur, p_version: queue.version });
    if (error) { setQueue(prev); setErr(errText(error)); reload(); return; }
    setQueue(data as Queue);
    if (msg) flash(msg, snap);
  }

  async function next() {
    if (!queue || busy) return;
    setBusy(true); setErr('');
    const snap = queue;
    const { data, error } = await supabase.rpc('queue_next', { p_clinic: clinic.id });
    setTimeout(() => setBusy(false), 1000); // ضغطة وحدة بالثانية
    if (error) { setErr(errText(error)); return; }
    const q = data as Queue;
    setQueue(q);
    if (q.cur !== snap.cur) flash(`${t('دخل الآن:')} ${q.items[q.cur]?.name ?? ''}`, snap);
  }

  function postpone() {
    if (!queue || queue.cur + 2 >= queue.items.length) return;
    const items = [...queue.items];
    const [x] = items.splice(queue.cur + 1, 1);
    items.splice(Math.min(queue.cur + 4, items.length), 0, x);
    setItems(items, queue.cur, `${t('تأجّل')} ${x.name} ${t('٣ أدوار')}`, queue);
  }

  function undo() {
    if (!toast?.snap || !queue) return;
    const snap = toast.snap;
    setToast(null);
    setItems(snap.items, snap.cur);
  }

  function move(i: number, d: -1 | 1) {
    if (!queue) return;
    const j = i + d;
    if (j <= queue.cur || j >= queue.items.length) return;
    const items = [...queue.items];
    [items[i], items[j]] = [items[j], items[i]];
    setItems(items, queue.cur);
  }

  if (loading || !queue) return <Loading />;
  const inside = queue.items[queue.cur];
  const upNext = queue.items[queue.cur + 1];
  const live = bookings.filter((b) => b.status !== 'cancelled');

  return (
    <>
      {offline && <Note>{t('ما في اتصال. تشوف آخر نسخة محفوظة، والأزرار ترجع تشتغل لما يرجع النت.')}</Note>}
      <View style={{ backgroundColor: C.teal, borderRadius: 14, padding: 16, gap: 12 }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Row style={{ gap: 24 }}>
            <View><Text style={{ color: '#DDEFEA', fontSize: 12 }}>{t('داخل عند الطبيب')}</Text><Text style={{ color: '#fff', fontSize: 22, fontWeight: '700' }}>{inside?.name ?? t('لا أحد')}</Text></View>
            <View><Text style={{ color: '#DDEFEA', fontSize: 12 }}>{t('التالي حسب الشاشة')}</Text><Text style={{ color: '#fff', fontSize: 16, fontWeight: '600' }}>{upNext?.name ?? t('لا يوجد')}</Text></View>
          </Row>
          <Row>
            <Btn kind="ghostLight" title={t('تأجيل التالي ٣ أدوار')} onPress={postpone} disabled={offline} />
            <Btn kind="light" title={t('التالي ←')} onPress={next} busy={busy} disabled={offline || !upNext} style={{ minHeight: 52, paddingHorizontal: 28 }} />
          </Row>
        </Row>
      </View>
      {toast && (
        <View accessibilityLiveRegion="polite" style={{ backgroundColor: C.ink, borderRadius: 12, padding: 12, flexDirection: 'row', flexWrap: 'wrap', gap: 10, alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ color: '#fff' }}>{toast.text}</Text>
          {toast.snap && <Btn small title={t('تراجع')} onPress={undo} style={{ backgroundColor: C.amber, borderColor: C.amber }} />}
        </View>
      )}
      {err ? <Note tone="err">{err}</Note> : null}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16, alignItems: 'flex-start' }}>
        <Card style={{ flexGrow: 999, flexBasis: 520, padding: 0, overflow: 'hidden' }}>
          <View style={{ padding: 16 }}>
            <H size={17}>{t('التسلسل الأصلي')}</H>
            <P mute small>{t('ثابت. عليه تنحسب الأوقات ورسائل الواتساب.')} · {live.length} {t('حجز')} / {clinic.daily_limit}</P>
          </View>
          {live.length === 0 && <P mute style={{ padding: 16 }}>{t('ما في حجوزات اليوم بعد.')}</P>}
          {bookings.map((b) => {
            const st = b.status === 'cancelled' ? 'x' : statusOf(queue, b.id);
            return (
              <View key={b.id} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, alignItems: 'center', padding: 12, borderTopWidth: 1, borderTopColor: C.line, opacity: st === 'x' ? 0.5 : 1 }}>
                <Text style={{ width: 30, fontWeight: '700', color: C.teal, fontSize: 16 }}>{b.original_seq}</Text>
                <View style={{ flexGrow: 1, flexBasis: 160 }}>
                  <Text style={{ fontWeight: '600', color: C.ink }}>{b.patients?.name}</Text>
                  <Text style={{ color: C.mute, fontSize: 12 }}>{b.patients?.phone} · {b.patients?.area}{b.patients?.gov && b.patients.gov !== clinic.gov ? `، ${b.patients.gov}` : ''}</Text>
                </View>
                <Chip text={t(TYPE_LABEL[b.type])} />
                <Text style={{ color: C.mute, fontSize: 13 }}>{fmtTime(estOf(clinic, bookings, b))}</Text>
                <Text style={{ color: C.mute, fontSize: 12 }}>{b.near ? (b.reminded ? t('انرسل قبل ساعة ✓') : t('قبل دوره بساعة')) : t('صباح اليوم')}</Text>
                {b.confirmed === true && <Chip text={t('أكّد')} tone="wait" />}
                <Chip text={t(STATUS_LABEL[st])} tone={TONE[st]} />
                {(st === 'wait' || st === 'next') && (
                  <Btn small title={t('إلغاء')} onPress={async () => { const { error } = await supabase.rpc('cancel_booking', { p_booking: b.id }); if (error) setErr(errText(error)); }} />
                )}
              </View>
            );
          })}
        </Card>

        <View style={{ flexGrow: 1, flexBasis: 320, gap: 16 }}>
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            <View style={{ padding: 16 }}>
              <H size={17}>{t('ترتيب شاشة المراجعين')}</H>
              <Note>{t('التقديم والتأخير والإضافة هنا تغيّر الشاشة وترتيب الدخول بس.')}</Note>
              <AddExtra onAdd={(name) => {
                const items = [...queue.items];
                items.splice(queue.cur + 1, 0, { id: `x-${Date.now()}`, booking_id: null, name });
                setItems(items, queue.cur);
              }} />
            </View>
            {queue.items.map((it, i) => i < queue.cur - 1 ? null : (
              <View key={it.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: 1, borderTopColor: C.line, backgroundColor: i === queue.cur ? C.tealSoft : it.booking_id ? C.card : C.warn }}>
                <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: i === queue.cur ? C.teal : C.tealSoft, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: i === queue.cur ? '#fff' : C.teal, fontWeight: '700' }}>{i < queue.cur ? '✓' : i === queue.cur ? '●' : i - queue.cur}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '600', color: C.ink }}>{it.name}</Text>
                  <Text style={{ color: C.mute, fontSize: 12 }}>{it.booking_id ? `${t('حجز رقم')} ${bookings.find((b) => b.id === it.booking_id)?.original_seq ?? ''}` : t('مضاف للشاشة بس')}</Text>
                </View>
                {i > queue.cur && (
                  <>
                    <Btn small title="↑" label={t('تقديم')} onPress={() => move(i, -1)} />
                    <Btn small title="↓" label={t('تأخير')} onPress={() => move(i, 1)} />
                  </>
                )}
              </View>
            ))}
          </Card>
          <QuickBook slug={clinic.slug} gov={clinic.gov} onDone={reload} />
          <Inbox clinicId={clinic.id} />
        </View>
      </View>
    </>
  );
}

function AddExtra({ onAdd }: { onAdd: (n: string) => void }) {
  const t = useT();
  const [v, setV] = useState('');
  return (
    <Row style={{ marginTop: 8, flexWrap: 'nowrap', alignItems: 'flex-end' }}>
      <View style={{ flex: 1 }}><Field label={t('اسم يضاف للشاشة')} value={v} onChangeText={setV} /></View>
      <Btn kind="dark" title={t('إضافة')} onPress={() => { if (v.trim()) { onAdd(v.trim()); setV(''); } }} />
    </Row>
  );
}

function QuickBook({ slug, gov: g0, onDone }: { slug: string; gov: string; onDone: () => void }) {
  const t = useT();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [type, setType] = useState<VisitType>('new');
  const [gov, setGov] = useState(g0 || GOVS[0]);
  const [area, setArea] = useState(areasOf(g0 || GOVS[0])[0]);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err' | 'warn'; text: string } | null>(null);
  const [full, setFull] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function book(day?: string) {
    setBusy(true); setMsg(null);
    const { data, error } = await supabase.rpc('book_appointment', { p_slug: slug, p_name: name, p_phone: phone, p_gov: gov, p_area: area, p_type: type, p_day: day ?? null });
    setBusy(false);
    if (error) { setMsg({ tone: 'err', text: errText(error) }); return; }
    const r = data as { full: boolean; next_day?: string; seq?: number };
    if (r.full) { setFull(r.next_day!); setMsg({ tone: 'warn', text: t('اليوم اكتمل. تحجزه بأقرب يوم؟') }); return; }
    setFull(null); setName(''); setPhone('');
    setMsg({ tone: 'ok', text: `${t('انحجز رقم')} ${r.seq} ✓` });
    onDone();
  }

  return (
    <Card>
      <H size={17}>{t('حجز سريع')}</H>
      <Field label={t('الاسم الكامل')} value={name} onChangeText={setName} />
      <Field label={t('رقم الواتساب')} value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="07XXXXXXXXX" />
      <Select label={t('نوع الزيارة')} value={type} options={Object.keys(TYPE_LABEL)} render={(v) => t(TYPE_LABEL[v as VisitType])} onChange={(v) => setType(v as VisitType)} />
      <Row style={{ flexWrap: 'nowrap' }}>
        <Select label={t('المحافظة')} value={gov} options={GOVS} onChange={(v) => { setGov(v); setArea(areasOf(v)[0]); }} />
        <Select label={t('المنطقة')} value={area} options={areasOf(gov)} onChange={setArea} />
      </Row>
      {msg && <Note tone={msg.tone}>{msg.text}</Note>}
      <Row style={{ marginTop: 12 }}>
        {full ? <Btn kind="primary" title={`${t('احجز يوم')} ${full}`} onPress={() => book(full)} busy={busy} />
          : <Btn kind="primary" title={t('احجز')} onPress={() => book()} busy={busy} />}
      </Row>
    </Card>
  );
}

function Inbox({ clinicId }: { clinicId: string }) {
  const t = useT();
  const [rows, setRows] = useState<{ id: string; phone: string; body: string; created_at: string }[]>([]);
  useEffect(() => {
    const load = () => supabase.from('messages').select('id, phone, body, created_at').eq('clinic_id', clinicId).eq('direction', 'in')
      .order('created_at', { ascending: false }).limit(15).then(({ data }) => setRows(data ?? []));
    load();
    const i = setInterval(load, 20000);
    return () => clearInterval(i);
  }, [clinicId]);
  return (
    <Card>
      <H size={17}>{t('رسائل المرضى على الواتساب')}</H>
      {rows.length === 0 ? <P mute small>{t('ما في رسائل جديدة.')}</P> : rows.map((m) => (
        <Pressable key={m.id} style={{ paddingVertical: 8, borderTopWidth: 1, borderTopColor: C.line }}>
          <Text style={{ color: C.mute, fontSize: 12 }}>{m.phone} · {new Date(m.created_at).toLocaleTimeString('ar-IQ', { hour: 'numeric', minute: '2-digit' })}</Text>
          <Text style={{ color: C.ink }}>{m.body}</Text>
        </Pressable>
      ))}
    </Card>
  );
}
