# عيادتي — حجز ودور العيادات

كود واحد يطلع منه **موقع** و**تطبيق آيفون** و**تطبيق أندرويد** (Expo SDK 58 + Expo Router)، وقاعدته **Supabase**.

| المسار | الواجهة |
| --- | --- |
| `/` | الموقع التعريفي |
| `/login` | دخول الطبيب والسكرتير والعيادات المرتبطة |
| `/secretary` | السكرتير: التسلسل الأصلي، ترتيب الشاشة، التالي، التأجيل، التراجع، حجز سريع، رسائل المرضى |
| `/doctor` | الطبيب: مرضى اليوم، ملف المريض، السجل الطبي، الإحالة |
| `/archive` | أرشيف المرضى (للطبيب بس) |
| `/settings` | معلومات العيادة، أسئلة الطبيب، المناطق القريبة، الـ QR، رابط الشاشة، الربط ويا العيادات |
| `/partner` | العيادة المرتبطة: طلبات الربط، المحالين، رفع النتائج |
| `/signup` | تسجيل عيادة جديدة، أو حساب لطبيب عنده دعوة |
| `/admin` | لوحتك: إضافة عيادات وربط الحسابات |
| `/c/[slug]` | صفحة العيادة والحجز (للمريض، بدون حساب) |
| `/q/[token]` | متابعة الدور (الرابط اللي يوصل بالواتساب) |
| `/display/[clinicId]` | شاشة المراجعين (اسم الداخل بس) |

## ١. قاعدة البيانات (Supabase)

1. سوّي مشروع على [supabase.com](https://supabase.com). اختار منطقة قريبة (مثلاً Frankfurt).
2. من **SQL Editor** شغّل الملفات بالترتيب:
   - `supabase/migrations/0001_schema.sql`
   - `supabase/migrations/0002_logic.sql`
   - `supabase/seed.sql` (بيانات تجريبية: عيادة `dr-ahmed` ومركز أشعة `rad-center` مرتبطين)
   - `supabase/migrations/0004_onboarding.sql` (التسجيل الذاتي والدعوات)
3. من **Authentication → URL Configuration** حط **Site URL** رابط الموقع، وضيف `رابط-الموقع/login` بـ Redirect URLs.

**تسجيل العيادات:** السكرتير يفتح «سجّل عيادتك» بالموقع، ويسوي حساب، ويأكد بريده، فتنسوى العيادة ويصير هو مديرها.
من «إعدادات العيادة ← فريق العيادة» يضيف بريد الطبيب، والطبيب يسوي حساب من «عندي دعوة من عيادة» بنفس البريد وينربط تلقائياً.
الطبيب هم يگدر يدير الفريق، حتى ما تنقفل العيادة إذا ترك السكرتير. ولوحة `/admin` تبقى إلك كصاحب التطبيق:
```sql
insert into admins (user_id) select id from auth.users where email = 'بريدك';
```

## ٢. تشغيل الموقع والتطبيق على جهازك

```bash
npm install
cp .env.example .env      # وحط URL و anon key من Supabase → Project Settings → API
npx expo start            # w للمتصفح، أو امسح الـ QR بتطبيق Expo Go
```

## ٣. نشر الموقع

```bash
npx expo export --platform web     # يطلع مجلد dist
```
ارفع `dist` على أي استضافة ثابتة (Netlify أو Vercel أو Cloudflare Pages أو EAS Hosting).
**مهم:** خلي كل المسارات ترجع `index.html` (SPA fallback)، حتى روابط مثل `/c/dr-ahmed` تشتغل.
- Netlify: ملف `public/_redirects` بيه `/* /index.html 200`
- Vercel: `vercel.json` بيه `{"rewrites":[{"source":"/(.*)","destination":"/index.html"}]}`

بعدها ربط الدومين (مثلاً `iyada.iq`) وحطه بـ `EXPO_PUBLIC_SITE_URL`.

## ٤. تطبيق الآيفون والأندرويد

تحتاج حساب Expo، و**Apple Developer** (للآيفون)، و**Google Play Console** (للأندرويد). ما تحتاج جهاز Mac.

```bash
npx eas-cli@latest login
npx eas-cli@latest init
npx eas-cli@latest build --profile preview --platform android   # ملف APK للتجربة
npx eas-cli@latest build --profile production --platform all
npx eas-cli@latest submit --platform ios
npx eas-cli@latest submit --platform android
```
حط متغيرات `.env` بـ EAS (`eas env:create`) قبل البناء. معرّف التطبيق `iq.iyada.app` بملف `app.json`؛ غيّره إذا تريد.

## ٥. الواتساب (WhatsApp Cloud API)

1. من [Meta for Developers](https://developers.facebook.com) سوّي تطبيق Business وفعّل WhatsApp، ووثّق رقم العيادة.
2. سوّي **قالب رسالة** معتمد بيه متغير واحد `{{1}}`، لأن الرسائل اللي يبدأها النظام تحتاج قالب.
3. انشر الدوال:
   ```bash
   npx supabase functions deploy whatsapp-send --no-verify-jwt
   npx supabase functions deploy whatsapp-webhook --no-verify-jwt
   npx supabase secrets set WHATSAPP_TOKEN=... WHATSAPP_PHONE_ID=... WHATSAPP_TEMPLATE=... \
     WHATSAPP_TEMPLATE_LANG=ar WHATSAPP_VERIFY_TOKEN=... WHATSAPP_APP_SECRET=... CRON_SECRET=...
   ```
4. بإعدادات Webhook بـ Meta حط رابط `whatsapp-webhook` ونفس `WHATSAPP_VERIFY_TOKEN`، واشترك بـ `messages`.
5. عدّل وشغّل `supabase/migrations/0003_cron.sql` حتى تندز الرسائل كل دقيقة.

بدون هالخطوة كل شي يشتغل، بس الرسائل تبقى بجدول `messages` وما تنرسل.

## شنو جاهز وشنو باقي

**جاهز:** الحجز من الرابط ومن السكرتير، الملف العائلي، الحد اليومي واقتراح اليوم الجاي، التسلسل الأصلي وترتيب الشاشة المنفصل، التالي (ضغطة وحدة بالثانية) والتأجيل والتراجع والإضافة، شاشة المراجعين، متابعة الدور، واجهة الطبيب والسجل الطبي والعمليات والمراجعة الجاية، الأرشيف، رفع الصور بجودتها الأصلية، الربط بطلب وموافقة، الإحالات والنتائج، رسائل الواتساب (التأكيد بالعنوان، تذكير القريب قبل ساعة والبعيد صباحاً، الوصفة، الإحالة، النتيجة)، رد «١/٢» للتأكيد والإلغاء، كلمات الطوارئ، العربي والكردي والإنكليزي مع RTL، صلاحيات RLS لكل عيادة، لوحة الإدارة.

**باقي (المراحل الجاية):**
- المجيب الذكي اللي يحچي ويا المريض ويحجزله من الواتساب (`whatsapp-webhook` بيه مكان جاهز إله).
- إلغاء يوم كامل ونقل حجوزاته بموافقة المرضى.
- الدفع الإلكتروني (زين كاش أو كي كارد).
- طابور ضغطات بدون نت للسكرتير (هسه يعرض آخر نسخة محفوظة، والأزرار ترجع لما يرجع النت).
- صفحات العيادات بنتائج گوگل (static/server rendering).
- مراجعة الترجمة الكردية من شخص يحچيها.

## فحص

```bash
npm run typecheck
npm run build:web
```
منطق قاعدة البيانات (الحجز، التالي، التأجيل، تعارض النسخ، التذكيرات، الإحالات، الصلاحيات) انفحص على Postgres محلي.
