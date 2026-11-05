import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { loadIeoById, sign } from "@/lib/ieo";

export const dynamic = "force-dynamic";

// IEO calls this address. The body must be signed: header X-Signature = "sha256=" + HMAC-SHA256(body, webhook secret).
//   {"event":"device","serial":"SN123","model":"…","warranty_until":"2027-01-31","sold_date":"2025-02-01","customer":"…"}
//   {"event":"ticket","ticket_no":1042,"external_id":"…","external_number":"…"}
//   {"event":"ping"}
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const raw = await req.text();
  if (raw.length > 200_000) return NextResponse.json({ error: "too_large" }, { status: 413 });
  const conn = /^[0-9a-f-]{36}$/i.test(id) ? await loadIeoById(id) : null;
  if (!conn || !conn.kind.startsWith("ieo_") || !conn.is_enabled || !conn.webhook_secret) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const got = Buffer.from(req.headers.get("x-signature") ?? ""), want = Buffer.from(sign(conn.webhook_secret, raw));
  if (got.length !== want.length || !timingSafeEqual(got, want)) return NextResponse.json({ error: "bad_signature" }, { status: 401 });
  let b: any;
  try { b = JSON.parse(raw); } catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }); }
  const db = supabaseAdmin();
  const asDate = (v: unknown) => { const m = typeof v === "string" ? v.match(/^(\d{4})-(\d{2})-(\d{2})/) : null; return m ? `${m[1]}-${m[2]}-${m[3]}` : null; };
  if (b.event === "ping") return NextResponse.json({ ok: true });
  if (b.event === "device" && typeof b.serial === "string" && b.serial) {
    const { data: dev } = await db.from("devices").select("id").eq("tenant_id", conn.tenant_id).eq("serial_number", b.serial).maybeSingle();
    if (!dev) return NextResponse.json({ ok: true, stored: false, reason: "unknown_serial" });
    const { error } = await db.from("device_external_info").upsert({
      tenant_id: conn.tenant_id, device_id: dev.id, serial_number: b.serial, status: "ok", source: "integration",
      model_name: b.model ?? null, warranty_note: typeof b.warranty_note === "string" ? b.warranty_note : null, warranty_until: asDate(b.warranty_until), sold_date: asDate(b.sold_date), customer_name: b.customer ?? null,
      raw_response: { via: "ieo_webhook", record: b }, error_message: null, fetched_at: new Date().toISOString(),
    }, { onConflict: "tenant_id,device_id" });
    if (error) return NextResponse.json({ error: "store_failed" }, { status: 500 });
    return NextResponse.json({ ok: true, stored: true });
  }
  if (b.event === "ticket" && b.ticket_no != null) {
    const { data: t } = await db.from("tickets").select("id").eq("tenant_id", conn.tenant_id).eq("ticket_no", b.ticket_no).maybeSingle();
    if (!t) return NextResponse.json({ ok: true, stored: false, reason: "unknown_ticket" });
    await db.from("ticket_external_refs").upsert({
      tenant_id: conn.tenant_id, ticket_id: t.id, integration_id: conn.id, source: "integration",
      external_id: b.external_id != null ? String(b.external_id) : String(b.ticket_no), external_number: b.external_number != null ? String(b.external_number) : null,
      sync_status: "synced", last_synced_at: new Date().toISOString(), last_error: null,
    }, { onConflict: "ticket_id" });
    return NextResponse.json({ ok: true, stored: true });
  }
  return NextResponse.json({ error: "unknown_event" }, { status: 400 });
}
