import { NextResponse, after } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { lookupForTicket } from "@/lib/onec-tools";
import { lookupForTicketIeo } from "@/lib/ieo-tools";
import { processOutbox } from "@/lib/outbox";

export const dynamic = "force-dynamic";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
export function OPTIONS() { return new NextResponse(null, { status: 204, headers: CORS }); }

// Called by the mobile app after a change that needs server work (1C / IEP queue, device lookup).
// The caller is identified by its own Supabase token; every read goes through row-level security as that user.
export async function POST(req: Request) {
  const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!jwt) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: CORS });
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${jwt}` } }, auth: { persistSession: false, autoRefreshToken: false },
  });
  const getUser = sb.auth.getUser.bind(sb.auth);
  (sb.auth as any).getUser = (token?: string) => getUser(token ?? jwt);   // the lookup helpers ask for "the signed-in user"
  const { data: u } = await sb.auth.getUser();
  if (!u.user) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: CORS });

  let body: any = {};
  try { body = await req.json(); } catch { /* empty */ }
  const ticketId = String(body.ticket_id ?? "");
  const action = String(body.action ?? "");
  const { data: t } = await sb.from("tickets").select("id,sync_target").eq("id", ticketId).maybeSingle();
  if (!t) return NextResponse.json({ error: "not_found" }, { status: 404, headers: CORS });

  let lookup: { code: string; detail?: string } | null = null;
  if (action === "lookup" || action === "apply") {
    try { lookup = await (t.sync_target === "ieo" ? lookupForTicketIeo(sb, t.id) : lookupForTicket(sb, t.id)); }
    catch (e: any) { lookup = { code: "unavailable", detail: String(e?.message ?? e).slice(0, 200) }; }
  }
  if (action === "apply" || action === "status" || action === "fee") after(() => processOutbox());
  return NextResponse.json({ ok: true, lookup: lookup?.code, detail: lookup?.detail }, { headers: CORS });
}
