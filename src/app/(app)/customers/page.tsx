import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { getT } from "@/lib/i18n";
import { getStaff } from "@/lib/i18n-staff";
import { fmt } from "@/lib/fmt";
import ConfirmButton from "@/components/ConfirmButton";
import { adminSendResetAction } from "@/lib/reset-actions";
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
  const { S } = await getStaff();
  const regLabel: Record<string, string> = { pending: S.regPending, approved: S.regApproved, rejected: S.regRejected };
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
              <td>{regLabel[u.registration] ?? u.registration}{u.registration === "rejected" && u.registration_note ? <><br /><small>{u.registration_note}</small></> : null}</td>
              <td>{u.registration === "pending" && (
                <form action={review}><input type="hidden" name="id" value={u.id} />
                  <input name="note" placeholder={S.reasonRejectPh} />
                  <button name="decision" value="approve">{t("approve")}</button>{" "}
                  <ConfirmButton className="btn danger" name="decision" value="reject" message={fmt(S.rejectQ, { email: u.email })}>{t("reject")}</ConfirmButton></form>)}
                {u.registration === "rejected" && (
                  <form action={review} style={{ display: "inline" }}><input type="hidden" name="id" value={u.id} />
                    <button name="decision" value="approve">{S.approveNow}</button></form>)}
                {isAdmin === true && <a className="btn" href={`/admin/edit/${u.id}`} style={{ marginLeft: 8, textDecoration: "none" }}>{S.edit}</a>}
                {isAdmin === true && (
                  <form action={adminSendResetAction} style={{ display: "inline", marginLeft: 8 }}><input type="hidden" name="id" value={u.id} /><input type="hidden" name="back" value="/customers" /><button>{S.sendPwReset}</button></form>)}
                {isAdmin === true && (
                  <form action={hardDeleteUserAction} style={{ display: "inline", marginLeft: 8 }}>
                    <input type="hidden" name="id" value={u.id} /><input type="hidden" name="back" value="/customers" />
                    <ConfirmButton className="btn danger" name="mode" value="plain" message={fmt(S.deleteUserQ, { email: u.email })}>{S.delete}</ConfirmButton>
                    <ConfirmButton className="btn danger" name="mode" value="all" message={fmt(S.deleteUserAllQ, { email: u.email })}>{S.deleteWithAll}</ConfirmButton>
                  </form>)}</td>
            </tr>))}</tbody></table>
      </div>
    </div>
  );
}
