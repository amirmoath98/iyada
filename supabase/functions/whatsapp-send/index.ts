// يدز رسائل الواتساب المنتظرة بصندوق messages عن طريق WhatsApp Cloud API من Meta.
// يشتغل كل دقيقة (pg_cron) — شوف README.
//
// متغيرات البيئة (supabase secrets set ...):
//   WHATSAPP_TOKEN            توكن دائم من Meta
//   WHATSAPP_PHONE_ID         Phone number ID من لوحة WhatsApp Business
//   WHATSAPP_TEMPLATE         اسم قالب معتمد بيه متغير واحد {{1}} (للرسائل خارج نافذة ٢٤ ساعة)
//   WHATSAPP_TEMPLATE_LANG    لغة القالب، مثلاً ar
//   CRON_SECRET               سر يطابق اللي بأمر pg_cron
import { createClient } from "npm:@supabase/supabase-js@2";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const TOKEN = Deno.env.get("WHATSAPP_TOKEN")!;
const PHONE_ID = Deno.env.get("WHATSAPP_PHONE_ID")!;
const TEMPLATE = Deno.env.get("WHATSAPP_TEMPLATE") ?? "";
const LANG = Deno.env.get("WHATSAPP_TEMPLATE_LANG") ?? "ar";

// 07XXXXXXXXX -> 9647XXXXXXXXX
const intl = (p: string) => "964" + p.replace(/^0/, "");

async function lastInbound(phone: string): Promise<Date | null> {
  const { data } = await sb.from("messages").select("created_at").eq("phone", phone).eq("direction", "in")
    .order("created_at", { ascending: false }).limit(1);
  return data?.[0] ? new Date(data[0].created_at) : null;
}

async function send(phone: string, body: string) {
  const last = await lastInbound(phone);
  const inWindow = last && Date.now() - last.getTime() < 23 * 3600 * 1000;
  const payload = inWindow || !TEMPLATE
    ? { messaging_product: "whatsapp", to: intl(phone), type: "text", text: { body } }
    : {
        messaging_product: "whatsapp", to: intl(phone), type: "template",
        template: {
          name: TEMPLATE, language: { code: LANG },
          // متغيرات القوالب ما تقبل أسطر جديدة
          components: [{ type: "body", parameters: [{ type: "text", text: body.replace(/\s*\n\s*/g, " · ").slice(0, 1000) }] }],
        },
      };
  const r = await fetch(`https://graph.facebook.com/v21.0/${PHONE_ID}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 300)}`);
}

Deno.serve(async (req) => {
  if (req.headers.get("x-cron-secret") !== Deno.env.get("CRON_SECRET")) return new Response("forbidden", { status: 403 });
  const { data: batch, error } = await sb.from("messages").select("id, phone, body")
    .eq("status", "queued").eq("direction", "out").lte("send_after", new Date().toISOString())
    .order("created_at").limit(50);
  if (error) return new Response(error.message, { status: 500 });
  let sent = 0, failed = 0;
  for (const m of batch ?? []) {
    try {
      await send(m.phone, m.body);
      await sb.from("messages").update({ status: "sent" }).eq("id", m.id);
      sent++;
    } catch (e) {
      await sb.from("messages").update({ status: "failed", error: String(e).slice(0, 500) }).eq("id", m.id);
      failed++;
    }
  }
  return Response.json({ sent, failed });
});
