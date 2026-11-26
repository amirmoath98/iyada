-- تشغيل دالة إرسال الواتساب كل دقيقة.
-- قبل التشغيل: بدّل YOUR-PROJECT و YOUR-CRON-SECRET (نفس قيمة CRON_SECRET بأسرار الدوال).
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule('whatsapp-send', '* * * * *', $$
  select net.http_post(
    url := 'https://YOUR-PROJECT.supabase.co/functions/v1/whatsapp-send',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', 'YOUR-CRON-SECRET'),
    body := '{}'::jsonb)
$$);
