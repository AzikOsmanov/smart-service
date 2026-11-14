import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { demoTenantId, removeVisitors, seedDemo } from "@/lib/demo";

export const dynamic = "force-dynamic";

// Vercel Cron, once a day: removes the throw-away demo accounts and puts the sample data back.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const admin = supabaseAdmin();
  const tid = await demoTenantId(admin);
  if (!tid) return NextResponse.json({ ok: false, reason: "no demo company" });
  try {
    await seedDemo(admin, tid);   // wipes the working data first (visitors' devices and tickets too)
    const removed = await removeVisitors(admin, tid, 0);
    return NextResponse.json({ ok: true, removed });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "failed" }, { status: 500 });
  }
}
