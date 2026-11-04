import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { getT } from "@/lib/i18n";

async function createTicket(fd: FormData) {
  "use server";
  const sb = await supabaseServer();
  const { data: sess } = await sb.auth.getSession();
  const uid = sess.session!.user.id;
  const { data: me } = await sb.from("users").select("tenant_id,company_id").eq("id", uid).single();
  const subject = String(fd.get("subject") || "").trim();
  const description = String(fd.get("description") || "").trim();
  if (subject.length < 3 || !description) redirect("/tickets/new?error=" + encodeURIComponent("Please fill in the subject and describe the problem."));
  const { data, error } = await sb.from("tickets").insert({
    tenant_id: me!.tenant_id, customer_id: uid, company_id: me!.company_id, device_id: String(fd.get("device")),
    subject, description, status: "new",
  }).select("id").single();
  if (error) redirect("/tickets/new?error=" + encodeURIComponent(error.message));
  redirect(`/tickets/${data.id}`);
}

export default async function NewTicket({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const sb = await supabaseServer();
  const { t } = await getT();
  const { data: sess } = await sb.auth.getSession();
  const { data: devices } = await sb.from("devices").select("id,serial_number").eq("owner_id", sess.session!.user.id).is("deleted_at", null).order("created_at", { ascending: false });
  return (
    <div>
      <h1>{t("newTicket")}</h1>
      {!devices?.length ? (
        <div className="card"><p>You need a registered device first.</p><p><a href="/devices">Add a device</a></p></div>
      ) : (
        <form action={createTicket} className="card" style={{ maxWidth: 640 }}>
          <label>Device<select name="device" required>{devices.map((d) => <option key={d.id} value={d.id}>{d.serial_number}</option>)}</select></label>
          <label>Subject<input name="subject" required minLength={3} maxLength={160} /></label>
          <label>What is wrong?<textarea name="description" required rows={6} maxLength={4000} /></label>
          {error && <p className="err">{error}</p>}
          <button>Send to the service team</button>
        </form>
      )}
    </div>
  );
}
