import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { getStaff } from "@/lib/i18n-staff";
import { buildWorkbook } from "@/lib/catalog-io";
import { loadFunctions, fnName, fnBrand } from "@/lib/functions";
import { CAT_COLS, type CatDevice } from "@/lib/projects";

export const runtime = "nodejs";

// GET /api/catalog/export            -> all catalog devices as an Excel file
// GET /api/catalog/export?template=1 -> the same sheet with no devices (header, drop-down lists and the Help sheet)
export async function GET(req: Request) {
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return new NextResponse("Unauthorized", { status: 401 });
  const [{ data: canView }, { data: me }] = await Promise.all([sb.rpc("has_permission", { p_code: "catalog.view" }), sb.from("users").select("kind,tenant_id").eq("id", auth.user.id).single()]);
  if (me?.kind !== "staff" || canView !== true) return new NextResponse("Forbidden", { status: 403 });
  const template = new URL(req.url).searchParams.get("template") === "1";
  const { data } = template ? { data: [] } : await sb.from("catalog_devices").select(`${CAT_COLS},notes`).is("deleted_at", null).order("brand").order("kind").order("model").limit(5000);
  const { S, lang } = await getStaff();
  const fns = (await loadFunctions(sb, me.tenant_id as string)).filter((f) => f.kind === "function").map((f) => ({ key: f.key, grp: f.grp, name: fnName(f, lang), dahua: fnBrand(f, "dahua"), unv: fnBrand(f, "unv") }));
  const buf = await buildWorkbook((data ?? []) as unknown as CatDevice[], S, template, fns);
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return new NextResponse(new Uint8Array(buf), { headers: {
    "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "Content-Disposition": `attachment; filename="${template ? "catalog-template" : "device-catalog"}-${stamp}.xlsx"`,
    "Cache-Control": "no-store",
  } });
}
