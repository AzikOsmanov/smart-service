import { NextResponse } from "next/server";
import { processOutbox } from "@/lib/outbox";

export const dynamic = "force-dynamic";

// Safety net: Vercel Cron calls this once a day (the queue is also sent right after every change).
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json(await processOutbox(100));
}
