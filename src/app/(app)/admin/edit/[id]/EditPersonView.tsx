import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getStaff } from "@/lib/i18n-staff";
import { getT } from "@/lib/i18n";
import { save, resetMfa } from "./actions";

async function requireAdmin() {
  const sb = await supabaseServer();
  const { data } = await sb.rpc("is_tenant_admin");
  if (data !== true) notFound();
  const { data: auth } = await sb.auth.getUser();
  const { data: me } = await sb.from("users").select("tenant_id").eq("id", auth.user!.id).single();
  return { sb, tenantId: me!.tenant_id as string, myId: auth.user!.id };
}

export default async function EditPersonView({ id, error, ok, popup }: { id: string; error?: string; ok?: string; popup?: boolean }) {
  const { sb, tenantId, myId } = await requireAdmin();
  const { S } = await getStaff();
  const { t } = await getT();
  const { data: u } = await sb.from("users").select("*").eq("id", id).eq("tenant_id", tenantId).is("deleted_at", null).maybeSingle();
  if (!u) notFound();
  const customer = u.kind === "customer";
  const [{ data: company }, { data: roles }, { data: cur }] = await Promise.all([
    customer && u.company_id ? sb.from("companies").select("name,city,address,tax_id").eq("id", u.company_id).maybeSingle() : Promise.resolve({ data: null }),
    !customer ? sb.from("roles").select("id,name,is_admin").is("deleted_at", null).order("name") : Promise.resolve({ data: [] }),
    !customer ? sb.from("user_roles").select("role_id,roles(is_admin)").eq("user_id", id) : Promise.resolve({ data: [] }),
  ]);
  const isAdminUser = (cur ?? []).some((x: any) => x.roles?.is_admin);
  const curRole = (cur ?? [])[0]?.role_id ?? "";
  const back = customer ? "/customers" : "/admin/users";
  const { data: mf } = await supabaseAdmin().auth.admin.mfa.listFactors({ userId: id });
  const mfaOn = (mf?.factors ?? []).some((f) => f.status === "verified");
  return (
    <div>
      {!popup && <p><Link href={back}>← {customer ? t("customers") : t("staffUsers")}</Link></p>}
      <form action={save} className={popup ? "" : "card"} style={popup ? undefined : { maxWidth: 620 }}>
        <h1>{customer ? S.editCustomer : S.editStaff}</h1>
        <input type="hidden" name="id" value={id} />
        {error && <p className="err">{error}</p>}
        {ok && <p>{ok}</p>}
        <label>{S.firstName}<input name="first_name" defaultValue={u.first_name ?? ""} required /></label>
        <label>{S.lastName}<input name="last_name" defaultValue={u.last_name ?? ""} required /></label>
        <label>{S.phone}<input name="phone" defaultValue={u.phone ?? ""} /></label>
        <label>{S.emailLogin}<input name="email" type="email" defaultValue={u.email} required /></label>
        {customer && (
          <>
            <label>{S.customerType}
              <select name="customer_type" defaultValue={u.customer_type ?? "company"}>
                <option value="reseller">{S.reseller}</option><option value="installer">{S.installer}</option><option value="company">{S.companyWord}</option>
              </select></label>
            <label>{S.companyName}<input name="company_name" defaultValue={company?.name ?? ""} required /></label>
            <label>{S.city}<input name="city" defaultValue={company?.city ?? ""} required /></label>
            <label>{S.address}<input name="address" defaultValue={company?.address ?? ""} /></label>
            <label>{S.taxId}<input name="tax_id" defaultValue={company?.tax_id ?? ""} /></label>
          </>
        )}
        {!customer && (isAdminUser || id === myId ? (
          <p><small>{S.roleFixedNote}</small></p>
        ) : (
          <label>{S.roleWord}
            <select name="role" defaultValue={curRole}>
              {(roles ?? []).filter((r) => !r.is_admin).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select></label>
        ))}
        <button>{S.saveChanges}</button>
        <p><small>{S.auditNote}</small></p>
      </form>
      <form action={resetMfa} className={popup ? "" : "card"} style={popup ? undefined : { maxWidth: 620 }}>
        <input type="hidden" name="id" value={id} />
        <p>{S.mfaAdminStatus}: <b>{mfaOn ? S.mfaStatusOn : S.mfaStatusOff}</b></p>
        {mfaOn && <button>{S.mfaAdminReset}</button>}
      </form>
    </div>
  );
}
