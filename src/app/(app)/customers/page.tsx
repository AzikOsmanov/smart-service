import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { getT } from "@/lib/i18n";
import ConfirmButton from "@/components/ConfirmButton";
import { hardDeleteUserAction } from "@/lib/delete-actions";

async function review(fd: FormData) {
  "use server";
  const sb = await supabaseServer();
  const { error } = await sb.rpc("review_registration", { p_user: String(fd.get("id")), p_approve: fd.get("decision") === "approve", p_note: String(fd.get("note") || "") });
  if (error) redirect("/customers?error=" + encodeURIComponent(error.message === "reason_required" ? "Please type a reason (at least 3 characters) to reject." : error.message));
  revalidatePath("/customers");
}

export default async function Customers({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  const { error: msgErr, ok } = await searchParams;
  const sb = await supabaseServer();
  const { t } = await getT();
  const { data: isAdmin } = await sb.rpc("is_tenant_admin");
  const { data, error } = await sb.from("users").select("id,first_name,last_name,email,phone,registration,registration_note,created_at,companies(name,city)").eq("kind", "customer").is("deleted_at", null).order("created_at", { ascending: false });
  return (
    <div>
      <h1>{t("customers")}</h1>
      {msgErr && <p className="err">{msgErr}</p>}
      {ok && <p>{ok}</p>}
      <div className="card">
        {error && <p className="err">{error.message}</p>}
        <table><thead><tr><th>{t("name")}</th><th>{t("companyCity")}</th><th>{t("contact")}</th><th>{t("status")}</th><th></th></tr></thead>
          <tbody>{(data ?? []).map((u: any) => (
            <tr key={u.id}>
              <td>{u.first_name} {u.last_name}</td>
              <td>{u.companies?.name} / {u.companies?.city}</td>
              <td>{u.email}<br />{u.phone}</td>
              <td>{u.registration}{u.registration === "rejected" && u.registration_note ? <><br /><small>{u.registration_note}</small></> : null}</td>
              <td>{u.registration === "pending" && (
                <form action={review}><input type="hidden" name="id" value={u.id} />
                  <input name="note" placeholder="Reason (required to reject)" />
                  <button name="decision" value="approve">{t("approve")}</button>{" "}
                  <ConfirmButton className="btn danger" name="decision" value="reject" message={`Reject ${u.email}? The customer will not be able to use the portal.`}>{t("reject")}</ConfirmButton></form>)}
                {u.registration === "rejected" && (
                  <form action={review} style={{ display: "inline" }}><input type="hidden" name="id" value={u.id} />
                    <button name="decision" value="approve">Approve now</button></form>)}
                {isAdmin === true && (
                  <form action={hardDeleteUserAction} style={{ display: "inline", marginLeft: 8 }}>
                    <input type="hidden" name="id" value={u.id} /><input type="hidden" name="back" value="/customers" />
                    <ConfirmButton className="btn danger" name="mode" value="plain" message={`Permanently delete ${u.email}? This cannot be undone.`}>Delete</ConfirmButton>
                    <ConfirmButton className="btn danger" name="mode" value="all" message={`Permanently delete ${u.email} TOGETHER WITH all their tickets and devices? This cannot be undone.`}>Delete with tickets and devices</ConfirmButton>
                  </form>)}</td>
            </tr>))}</tbody></table>
      </div>
    </div>
  );
}
