import SettingsNav from "@/components/SettingsNav";
import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getStaff } from "@/lib/i18n-staff";
import { fmt } from "@/lib/fmt";

const ONLINE_SECONDS = 150; // heartbeat is every 60 s

export const dynamic = "force-dynamic";

export default async function Online({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const { kind } = await searchParams;
  const sb = await supabaseServer();
  const { S } = await getStaff();
  const { data: isAdmin } = await sb.rpc("is_tenant_admin");
  if (isAdmin !== true) notFound();
  const { data: auth } = await sb.auth.getUser();
  const { data: me } = await sb.from("users").select("tenant_id").eq("id", auth.user!.id).single();
  const since = new Date(Date.now() - ONLINE_SECONDS * 1000).toISOString();
  const admin = supabaseAdmin();
  let q = admin.from("users").select("id,first_name,last_name,email,kind,last_seen_at,last_seen_client,companies(name,city)").eq("tenant_id", me!.tenant_id).gt("last_seen_at", since).order("last_seen_at", { ascending: false });
  if (kind === "staff" || kind === "customer") q = q.eq("kind", kind);
  const { data: rows, error } = await q;
  const ids = (rows ?? []).map((r) => r.id);
  const [{ data: roles }, { data: urs }, { data: events }] = await Promise.all([
    admin.from("roles").select("id,name"),
    ids.length ? admin.from("user_roles").select("user_id,role_id").in("user_id", ids) : Promise.resolve({ data: [] }),
    ids.length ? admin.from("login_events").select("user_id,ip_address,created_at").eq("event", "login_success").in("user_id", ids).order("created_at", { ascending: false }).limit(300) : Promise.resolve({ data: [] }),
  ]);
  const rn = new Map((roles ?? []).map((r) => [r.id, r.name]));
  const roleOf = (uid: string) => (urs ?? []).filter((x) => x.user_id === uid).map((x) => rn.get(x.role_id)).filter(Boolean).join(", ");
  const ipOf = new Map<string, { ip: string | null; at: string }>();
  for (const e of events ?? []) if (!ipOf.has(e.user_id as string)) ipOf.set(e.user_id as string, { ip: e.ip_address ? String(e.ip_address) : null, at: e.created_at });
  const staffN = (rows ?? []).filter((r) => r.kind === "staff").length;
  const custN = (rows ?? []).filter((r) => r.kind === "customer").length;
  const ago = (iso: string) => { const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000)); return s < 60 ? fmt(S.agoSec, { n: String(s) }) : fmt(S.agoMin, { n: String(Math.round(s / 60)) }); };
  return (
    <div>
      <SettingsNav active="online" />
      <h1>{S.onlineUsers}</h1>
      <div className="card row">
        <a className="btn" href="/admin/online" style={{ textDecoration: "none" }}>{fmt(S.allWithCount, { n: String(staffN + custN) })}</a>
        <a className="btn" href="/admin/online?kind=staff" style={{ textDecoration: "none" }}>{S.staffWord}</a>
        <a className="btn" href="/admin/online?kind=customer" style={{ textDecoration: "none" }}>{S.customersWord}</a>
        <small>{S.onlineHint}</small>
      </div>
      <div className="card">
        {error && <p className="err">{error.message}</p>}
        <table><thead><tr><th>{S.name}</th><th>{S.typeWord}</th><th>{S.roleCompany}</th><th>{S.emailWord}</th><th>{S.platformWord}</th><th>{S.ipAddress}</th><th>{S.lastActivity}</th></tr></thead><tbody>
          {(rows ?? []).map((u: any) => (
            <tr key={u.id}>
              <td><b>{u.first_name} {u.last_name}</b></td>
              <td><span className="badge">{u.kind === "staff" ? S.staffOne : S.customerOne}</span></td>
              <td>{u.kind === "staff" ? roleOf(u.id) || "—" : `${u.companies?.name ?? ""}${u.companies?.city ? " / " + u.companies.city : ""}`}</td>
              <td>{u.email}</td>
              <td><span className="badge">{u.last_seen_client === "mobile" ? S.platformMobile : S.platformWeb}</span></td>
              <td>{ipOf.get(u.id)?.ip ?? "—"}</td>
              <td>{ago(u.last_seen_at)}</td>
            </tr>
          ))}
          {(rows ?? []).length === 0 && <tr><td colSpan={7}>{S.nobodyOnline}</td></tr>}
        </tbody></table>
      </div>
    </div>
  );
}
