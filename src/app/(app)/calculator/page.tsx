import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getT } from "@/lib/i18n";
import { getStaff } from "@/lib/i18n-staff";
import CalcHub from "@/components/calc/CalcHub";

type Tip = { id: string; kind: "ups" | "hdd"; title: string; body: string };

async function ctx() {
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) redirect("/login");
  const { data: me } = await sb.from("users").select("tenant_id").eq("id", auth.user.id).single();
  const { data: admin } = await sb.rpc("is_tenant_admin");
  return { tenantId: me!.tenant_id as string, uid: auth.user.id, isAdmin: admin === true };
}
async function readTips(tenantId: string): Promise<Tip[]> {
  const { data } = await supabaseAdmin().from("settings").select("value").eq("tenant_id", tenantId).eq("key", "calculator_tips").maybeSingle();
  return Array.isArray(data?.value) ? (data!.value as Tip[]).filter((t) => t && typeof t.id === "string") : [];
}
async function writeTips(tenantId: string, uid: string, tips: Tip[]) {
  await supabaseAdmin().from("settings").upsert({ tenant_id: tenantId, key: "calculator_tips", value: tips, updated_by: uid, updated_at: new Date().toISOString() }, { onConflict: "tenant_id,key" });
  revalidatePath("/calculator");
}

async function addTip(fd: FormData) {
  "use server";
  const { S } = await getStaff();
  const { tenantId, uid, isAdmin } = await ctx();
  if (!isAdmin) redirect("/calculator");
  const kind = fd.get("kind") === "hdd" ? "hdd" : "ups";
  const title = String(fd.get("title") ?? "").trim().slice(0, 120), body = String(fd.get("body") ?? "").trim().slice(0, 2000);
  if (!title || !body) redirect("/calculator?error=" + encodeURIComponent(S.calcTipErr));
  const tips = await readTips(tenantId);
  tips.push({ id: crypto.randomUUID(), kind, title, body });
  await writeTips(tenantId, uid, tips);
  redirect("/calculator?ok=" + encodeURIComponent(S.calcTipSaved));
}
async function deleteTip(fd: FormData) {
  "use server";
  const { tenantId, uid, isAdmin } = await ctx();
  if (!isAdmin) redirect("/calculator");
  const id = String(fd.get("id") ?? "");
  await writeTips(tenantId, uid, (await readTips(tenantId)).filter((t) => t.id !== id));
  redirect("/calculator");
}

export default async function CalculatorPage({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  const { error, ok } = await searchParams;
  const { tenantId, isAdmin } = await ctx();
  const { t } = await getT();
  const { S } = await getStaff();
  const tips = await readTips(tenantId);
  const L = Object.fromEntries(Object.entries(S).filter(([k]) => k.startsWith("calc"))) as Record<string, string>;
  const group = (kind: "ups" | "hdd", title: string) => (
    <div className="card" style={{ flex: "1 1 320px", margin: 0 }}>
      <h2>{title}</h2>
      {tips.filter((x) => x.kind === kind).length === 0 && <p><small>{S.calcTipsNone}</small></p>}
      {tips.filter((x) => x.kind === kind).map((x) => (
        <div key={x.id} style={{ borderTop: "1px solid var(--line)", paddingTop: 8, marginTop: 8 }}>
          <b>{x.title}</b>
          <p style={{ whiteSpace: "pre-wrap", margin: "4px 0" }}>{x.body}</p>
          {isAdmin && <form action={deleteTip}><input type="hidden" name="id" value={x.id} /><button className="btn ghost">{S.calcTipDel}</button></form>}
        </div>
      ))}
    </div>
  );
  return (
    <div>
      <h1>{t("calculator")}</h1>
      <CalcHub L={L} />
      <h2 style={{ marginTop: 24 }}>{S.calcTipsTitle}</h2>
      {error && <p className="err">{error}</p>}
      {ok && <p>{ok}</p>}
      <div className="row" style={{ gap: 12, alignItems: "stretch", flexWrap: "wrap" }}>
        {group("ups", S.calcTipsUps)}
        {group("hdd", S.calcTipsHdd)}
      </div>
      {isAdmin && (
        <form action={addTip} className="card" style={{ maxWidth: 640, marginTop: 12 }}>
          <h2>{S.calcTipAdd}</h2>
          <label>{S.calcTipKind}<select name="kind"><option value="ups">{S.calcTipsUps}</option><option value="hdd">{S.calcTipsHdd}</option></select></label>
          <label>{S.calcTipHead}<input name="title" maxLength={120} required /></label>
          <label>{S.calcTipBody}<textarea name="body" rows={4} maxLength={2000} required /></label>
          <button>{t("save")}</button>
        </form>
      )}
    </div>
  );
}
