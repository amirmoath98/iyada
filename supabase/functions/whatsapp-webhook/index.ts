// يستقبل رسائل المرضى من الواتساب.
// - «1» أو «2» = تأكيد أو إلغاء حجز اليوم.
// - أي رسالة ثانية تنحفظ وتطلع للسكرتير. المجيب الذكي ينضاف هنا بالمرحلة الخامسة.
// - كلمات الطوارئ: رد فوري «روح للطوارئ» وتنبيه للسكرتير.
//
// متغيرات البيئة: WHATSAPP_VERIFY_TOKEN, WHATSAPP_APP_SECRET
import { createClient } from "npm:@supabase/supabase-js@2";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const EMERGENCY = /(ألم|وجع)\s*(ب|في)?\s*(الصدر|صدري)|ضيق\s*(ب)?\s*(النفس|نفس)|ما\s*دا?\s*(ا)?گدر\s*اتنفس|نزيف|فقد\s*الوعي|إغماء|اغماء/;

async function verifySignature(req: Request, raw: string) {
  const secret = Deno.env.get("WHATSAPP_APP_SECRET");
  if (!secret) return false;
  const sig = req.headers.get("x-hub-signature-256")?.replace("sha256=", "") ?? "";
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw));
  const hex = Array.from(new Uint8Array(mac)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return hex === sig;
}

const local = (waId: string) => "0" + waId.replace(/^964/, "");
const today = () => new Date(Date.now() + 3 * 3600 * 1000).toISOString().slice(0, 10); // توقيت بغداد

Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (req.method === "GET") {
    if (url.searchParams.get("hub.verify_token") === Deno.env.get("WHATSAPP_VERIFY_TOKEN")) {
      return new Response(url.searchParams.get("hub.challenge") ?? "");
    }
    return new Response("forbidden", { status: 403 });
  }
  const raw = await req.text();
  if (!(await verifySignature(req, raw))) return new Response("bad signature", { status: 401 });
  const body = JSON.parse(raw);

  for (const entry of body.entry ?? []) for (const ch of entry.changes ?? []) for (const msg of ch.value?.messages ?? []) {
    const phone = local(msg.from);
    const text: string = msg.text?.body?.trim() ?? (msg.type === "image" || msg.type === "document" ? "[مرفق]" : `[${msg.type}]`);

    // حجوزات اليوم لهالرقم (كل العيادات)
    const { data: pts } = await sb.from("patients").select("id, clinic_id").eq("phone", phone);
    const ids = (pts ?? []).map((p) => p.id);
    const { data: bks } = ids.length
      ? await sb.from("bookings").select("id, clinic_id, patient_id").in("patient_id", ids).eq("day", today()).neq("status", "cancelled")
      : { data: [] };
    const clinicId = bks?.[0]?.clinic_id ?? pts?.[0]?.clinic_id;
    if (!clinicId) continue; // رقم ما إله حجز: المجيب الذكي يتعامل وياه بالمرحلة الخامسة

    await sb.from("messages").insert({ clinic_id: clinicId, patient_id: bks?.[0]?.patient_id ?? null, phone, body: text, direction: "in", status: "received" });

    if (EMERGENCY.test(text)) {
      await sb.from("messages").insert({ clinic_id: clinicId, phone, body: "إذا عندك ألم بالصدر أو ضيق نفس أو نزيف، روح للطوارئ هسه أو اتصل بالإسعاف. السكرتير راح يتواصل وياك." });
      continue;
    }
    if ((text === "1" || text === "2") && bks?.length) {
      if (text === "1") await sb.from("bookings").update({ confirmed: true }).in("id", bks.map((b) => b.id));
      else for (const b of bks) await sb.rpc("cancel_booking_service", { p_booking: b.id });
      await sb.from("messages").insert({ clinic_id: clinicId, phone, body: text === "1" ? "تم تأكيد حضورك ✓" : "انلغى حجزك. نتمنالك السلامة." });
    }
  }
  return new Response("ok");
});
