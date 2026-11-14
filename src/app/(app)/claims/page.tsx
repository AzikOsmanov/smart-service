import { redirect } from "next/navigation";
import { fmtDT } from "@/lib/fmt-time";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import { getStaff } from "@/lib/i18n-staff";
import { fmt } from "@/lib/fmt";

// Which button was pressed is decided by the button's own action (not by a submitted value), so approve can never turn into reject.
async function reviewAs(fd: FormData, approve: boolean) {
  const { S } = await getStaff();
  const sb = await supabaseServer();
  const note = String(fd.get("note") || "").trim();
  if (!approve && note.length < 3) redirect("/claims?error=" + encodeURIComponent(S.errClaimReason));
  const { error } = await sb.rpc("review_device_claim", { p_claim: String(fd.get("id")), p_approve: approve, p_note: note || null });
  if (error) redirect("/claims?error=" + encodeURIComponent(error.message));
  revalidatePath("/claims");
  redirect("/claims?ok=" + encodeURIComponent(approve ? S.okClaimApproved : S.okClaimRejected));
}
async function approveClaim(fd: FormData) { "use server"; await reviewAs(fd, true); }
async function rejectClaim(fd: FormData) { "use server"; await reviewAs(fd, false); }

export default async function Claims({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  const { error: msgErr, ok } = await searchParams;
  const sb = await supabaseServer();
  const { S } = await getStaff();
  const stLabel: Record<string, string> = { pending: S.regPending, approved: S.regApproved, rejected: S.regRejected };
  const [{ data: canView }, { data: canEdit }] = await Promise.all([
    sb.rpc("has_permission", { p_code: "devices.claims.view" }), sb.rpc("has_permission", { p_code: "devices.claims.edit" }),
  ]);
  if (canView !== true) redirect("/tickets");
  const { data: claims, error } = await sb.from("device_claims").select("id,device_id,claimant_id,previous_owner_id,label_photo_key,status,review_note,created_at,reviewed_at").order("created_at", { ascending: false }).limit(100);
  const rows = claims ?? [];
  const userIds = Array.from(new Set(rows.flatMap((c) => [c.claimant_id, c.previous_owner_id]).filter(Boolean))) as string[];
  const devIds = Array.from(new Set(rows.map((c) => c.device_id)));
  const photoKeys = rows.map((c) => c.label_photo_key).filter(Boolean) as string[];
  const [{ data: users }, { data: devs }, { data: signed }] = await Promise.all([
    userIds.length ? sb.from("users").select("id,first_name,last_name,email,phone,companies(name,city)").in("id", userIds) : Promise.resolve({ data: [] }),
    devIds.length ? sb.from("devices").select("id,serial_number").in("id", devIds) : Promise.resolve({ data: [] }),
    photoKeys.length ? sb.storage.from("device-labels").createSignedUrls(photoKeys, 3600) : Promise.resolve({ data: [] }),
  ]);
  const who = new Map((users ?? []).map((u: any) => [u.id, u]));
  const sn = new Map((devs ?? []).map((d) => [d.id, d.serial_number]));
  const photo = new Map((signed ?? []).map((s: any) => [s.path, s.signedUrl]));
  const person = (id: string | null) => {
    const u: any = id ? who.get(id) : null;
    if (!u) return "—";
    return <>{u.first_name} {u.last_name}<br /><small>{u.companies?.name}{u.companies?.city ? ` / ${u.companies.city}` : ""}<br />{u.email} {u.phone}</small></>;
  };
  const pending = rows.filter((c) => c.status === "pending");
  const done = rows.filter((c) => c.status !== "pending");
  return (
    <div>
      <h1>{S.ownershipRequests}</h1>
      {msgErr && <p className="err">{msgErr}</p>}
      {ok && <p>{ok}</p>}
      {error && <p className="err">{error.message}</p>}
      <div className="card">
        <h2>{fmt(S.waitingReview, { n: String(pending.length) })}</h2>
        {pending.length === 0 && <p>{S.noRequestsWaiting}</p>}
        {pending.map((c) => {
          const url = c.label_photo_key ? photo.get(c.label_photo_key) : null;
          return (
            <div key={c.id} className="card" style={{ marginTop: 12 }}>
              <div className="row" style={{ alignItems: "flex-start" }}>
                <div style={{ minWidth: 220 }}>
                  <p>{S.serialNumber}: <b>{sn.get(c.device_id) ?? "—"}</b></p>
                  <p><small>{S.sentAt} {fmtDT(c.created_at)}</small></p>
                  <p>{S.newOwnerRequester}<br />{person(c.claimant_id)}</p>
                  <p>{S.currentOwner}<br />{person(c.previous_owner_id)}</p>
                </div>
                <div>{url ? <a href={url} target="_blank" rel="noreferrer"><img src={url} alt="SN label" style={{ maxWidth: 320, borderRadius: 8 }} /></a> : <p>{S.noLabelPhoto}</p>}</div>
              </div>
              {canEdit === true && (
                <form className="row">
                  <input type="hidden" name="id" value={c.id} />
                  <input name="note" placeholder={S.noteRejectPh} style={{ flex: 1 }} />
                  <button formAction={approveClaim}>{S.approveTransfer}</button>
                  <button className="btn danger" formAction={rejectClaim}>{S.reject}</button>
                </form>
              )}
            </div>
          );
        })}
      </div>
      <div className="card">
        <h2>{S.reviewed}</h2>
        <table><thead><tr><th>{S.serialNumber}</th><th>{S.newOwner}</th><th>{S.result}</th><th>{S.note}</th><th>{S.reviewed}</th></tr></thead><tbody>
          {done.map((c) => (
            <tr key={c.id}><td>{sn.get(c.device_id) ?? "—"}</td><td>{person(c.claimant_id)}</td><td><span className="badge">{stLabel[c.status] ?? c.status}</span></td><td>{c.review_note ?? ""}</td><td>{c.reviewed_at ? fmtDT(c.reviewed_at) : ""}</td></tr>
          ))}
          {done.length === 0 && <tr><td colSpan={5}>{S.nothingReviewed}</td></tr>}
        </tbody></table>
      </div>
    </div>
  );
}
