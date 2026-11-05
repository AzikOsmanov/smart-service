import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { notifText } from "@/lib/notif-text";

export const dynamic = "force-dynamic";

// Called by the database (trigger on notifications) for every new notification: sends it to the user's phones via Expo.
export async function POST(req: Request) {
  const secret = process.env.PUSH_SECRET ?? "";
  const got = Buffer.from(req.headers.get("x-push-secret") ?? "");
  if (!secret || got.length !== Buffer.byteLength(secret) || !timingSafeEqual(got, Buffer.from(secret))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  let id = "";
  try { id = String((await req.json()).id ?? ""); } catch { /* bad body */ }
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "bad_id" }, { status: 400 });

  const db = supabaseAdmin();
  const { data: n } = await db.from("notifications").select("id,user_id,kind,ticket_id,data").eq("id", id).maybeSingle();
  if (!n) return NextResponse.json({ ok: true, sent: 0 });
  const { data: tokens } = await db.from("push_tokens").select("token,lang").eq("user_id", n.user_id);
  if (!tokens?.length) return NextResponse.json({ ok: true, sent: 0 });
  const { count: unread } = await db.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", n.user_id).is("read_at", null);

  const d = (n.data ?? {}) as Record<string, any>;
  const messages = tokens.map((t) => {
    const ann = n.kind === "announcement";
    return {
      to: t.token, sound: "default", channelId: "default", badge: unread ?? undefined,
      title: ann ? String(d.title ?? "Smart Service") : "Smart Service",
      body: ann ? String(d.body ?? "") : notifText(t.lang, { kind: n.kind, data: d }),
      data: { notification_id: n.id, ticket_id: n.ticket_id, link: ann ? d.link ?? null : null },
    };
  });
  const res = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(messages),
  });
  const json: any = await res.json().catch(() => null);
  // Forget tokens of uninstalled apps / signed-out devices.
  const dead = (json?.data ?? []).map((r: any, i: number) => (r?.details?.error === "DeviceNotRegistered" ? messages[i].to : null)).filter(Boolean);
  if (dead.length) await db.from("push_tokens").delete().in("token", dead);
  return NextResponse.json({ ok: res.ok, sent: messages.length, removed: dead.length });
}
