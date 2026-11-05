import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";
import ConfirmButton from "@/components/ConfirmButton";
import TicketChat from "@/components/TicketChat";
import { getT } from "@/lib/i18n";
import { getPortal } from "@/lib/i18n-portal";
import type { ChatMessage } from "@/lib/chat-actions";
import TicketFiles from "@/components/TicketFiles";
import { deleteTicketAction, hardDeleteTicketAction } from "@/lib/delete-actions";

async function apply(fd: FormData) {
  "use server";
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  const id = String(fd.get("id"));
  await sb.from("tickets").update({ assigned_to: auth.user!.id, status: "assigned" }).eq("id", id).is("assigned_to", null);
  revalidatePath(`/tickets/${id}`);
}

async function setStatus(fd: FormData) {
  "use server";
  const sb = await supabaseServer();
  const id = String(fd.get("id"));
  const { error } = await sb.rpc("set_device_service_status", { p_ticket: id, p_status: String(fd.get("status")), p_comment: String(fd.get("comment") || "") });
  if (error) redirect(`/tickets/${id}?error=${encodeURIComponent(error.message)}`);
  revalidatePath(`/tickets/${id}`);
}

async function saveManual(fd: FormData) {
  "use server";
  const sb = await supabaseServer();
  const id = String(fd.get("id"));
  const date = (k: string) => (String(fd.get(k) || "") || null);
  const { error } = await sb.rpc("save_manual_device_info", {
    p_ticket: id, p_model: String(fd.get("model") || ""), p_warranty_until: date("warranty"),
    p_sold_date: date("sold"), p_customer_name: String(fd.get("customer") || ""),
  });
  if (error) redirect(`/tickets/${id}?error=${encodeURIComponent(error.message)}`);
  revalidatePath(`/tickets/${id}`);
}

export default async function TicketPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; warn?: string }> }) {
  const { id } = await params;
  const { error, warn } = await searchParams;
  const sb = await supabaseServer();
  const { t: tr } = await getT();
  const { L } = await getPortal();
  const { data: t } = await sb.from("tickets").select("*").eq("id", id).maybeSingle();
  if (!t) notFound();
  const { data: sess } = await sb.auth.getSession();
  const [{ data: isStaff }, { data: canDelete }, { data: isAdmin }, { data: dev }, { data: msgs }] = await Promise.all([
    sb.rpc("is_staff"),
    sb.rpc("has_permission", { p_code: "tickets.delete" }),
    sb.rpc("is_tenant_admin"),
    sb.from("devices").select("serial_number").eq("id", t.device_id).maybeSingle(),
    sb.from("ticket_messages").select("id,sender_kind,body,is_internal,created_at").eq("ticket_id", id).is("deleted_at", null).order("created_at"),
  ]);
  const staff = isStaff === true;
  const chat = (
    <TicketChat ticketId={id} initial={(msgs ?? []) as ChatMessage[]} isStaff={staff}
      labels={{ title: tr("chat"), placeholder: tr("chatPlaceholder"), send: tr("send"), internal: tr("internalNote"), customer: tr("fromCustomer"), staff: tr("fromStaff"), you: tr("you"), empty: tr("noMessages") }} />
  );

  if (!staff) {
    const uid = sess.session!.user.id;
    const [{ data: me }, { data: events }, { data: files }, { data: devFull }] = await Promise.all([
      sb.from("users").select("tenant_id").eq("id", uid).single(),
      sb.from("ticket_customer_events").select("id,kind,status,created_at").eq("ticket_id", id).order("created_at"),
      sb.from("ticket_attachments").select("id,file_name,mime_type,storage_key,kind,created_at").eq("ticket_id", id).order("created_at"),
      sb.from("devices").select("serial_number,device_models(name)").eq("id", t.device_id).maybeSingle(),
    ]);
    const keys = (files ?? []).map((f) => f.storage_key);
    const { data: signed } = keys.length ? await sb.storage.from("ticket-files").createSignedUrls(keys, 3600) : { data: [] };
    const urlOf = new Map((signed ?? []).map((x) => [x.path, x.signedUrl]));
    const cur = t.customer_device_status as string | null;
    const stepLabel = cur ? tr(`st_${cur}` as "st_ready") : null;
    const model = (devFull as { device_models?: { name?: string } | null } | null)?.device_models?.name;
    const steps = [
      { label: tr("st_received"), done: true },
      { label: tr("st_diagnose"), done: !!cur },
      { label: cur && cur !== "diagnose" ? stepLabel! : L.result, done: !!cur && cur !== "diagnose" },
    ];
    return (
      <div>
        <div className="card">
          <p><a href="/tickets">← {tr("tickets")}</a></p>
          <h1>{t.ticket_no} — {t.subject}</h1>
          <div className="row">
            <span>{L.colSn}: <b>{devFull?.serial_number ?? dev?.serial_number ?? "—"}</b></span>
            {model && <span>{L.model}: <b>{model}</b></span>}
            <span><small>{L.created} {new Date(t.created_at).toLocaleString()}</small></span>
          </div>
          {warn && <p className="err">{warn}</p>}
        </div>
        <div className="card">
          <h2>{L.status}</h2>
          <div className="row" style={{ gap: 8 }}>
            {steps.map((st, i) => (
              <span key={i} className="badge" style={{ opacity: st.done ? 1 : 0.45, fontWeight: i === steps.filter((x) => x.done).length - 1 ? 700 : 400 }}>{i + 1}. {st.label}</span>
            ))}
          </div>
          <ul>
            {(events ?? []).map((ev) => (
              <li key={ev.id}>{new Date(ev.created_at).toLocaleString()} — {ev.kind === "created" ? L.ticketCreated : tr(`st_${ev.status}` as "st_ready")}</li>
            ))}
          </ul>
        </div>
        <div className="card">
          <h2>{L.problemDesc}</h2>
          <p style={{ whiteSpace: "pre-wrap" }}>{t.description}</p>
        </div>
        <div className="card">
          <h2>{L.photosFiles}</h2>
          {(files ?? []).length === 0 && <p>{L.noFiles}</p>}
          <div className="row" style={{ alignItems: "flex-start" }}>
            {(files ?? []).map((f) => {
              const u = urlOf.get(f.storage_key);
              if (!u) return null;
              if (f.kind === "video") return <video key={f.id} src={u} controls style={{ maxWidth: 320, borderRadius: 8 }} />;
              if (f.kind === "pdf") return <a key={f.id} href={u} target="_blank" rel="noreferrer">📄 {f.file_name}</a>;
              return <a key={f.id} href={u} target="_blank" rel="noreferrer"><img src={u} alt={f.file_name} style={{ maxWidth: 200, borderRadius: 8 }} /></a>;
            })}
          </div>
          <TicketFiles L={L} tenantId={me!.tenant_id} ticketId={id} userId={uid} />
        </div>
        {chat}
      </div>
    );
  }

  const { data: state } = await sb.from("ticket_service_state").select("status,comment,changed_at").eq("ticket_id", id).maybeSingle();
  const { data: info } = await sb.from("device_external_info").select("model_name,sold_date,warranty_until,customer_name,source").eq("ticket_id", id).maybeSingle();
  const uid = sess.session!.user.id;
  const [{ data: me }, { data: files }, { data: events }, { data: qcLatest }] = await Promise.all([
    sb.from("users").select("tenant_id").eq("id", uid).single(),
    sb.from("ticket_attachments").select("id,file_name,storage_key,kind,created_at,uploaded_by").eq("ticket_id", id).order("created_at"),
    sb.from("ticket_customer_events").select("id,kind,status,created_at").eq("ticket_id", id).order("created_at"),
    dev?.serial_number ? sb.from("qc_checks").select("id,status,created_at").eq("serial_number", dev.serial_number).is("deleted_at", null).order("created_at", { ascending: false }).limit(1) : Promise.resolve({ data: [] }),
  ]);
  const fileKeys = (files ?? []).map((f) => f.storage_key);
  const { data: fileUrls } = fileKeys.length ? await sb.storage.from("ticket-files").createSignedUrls(fileKeys, 3600) : { data: [] };
  const urlOf = new Map((fileUrls ?? []).map((x) => [x.path, x.signedUrl]));
  const qc = (qcLatest ?? [])[0] as { id: string; status: string; created_at: string } | undefined;
  const qcLabel: Record<string, string> = { done: "Done", broken: "Broken", hardware_issue: "Hardware issue" };
  const filesCard = (
    <div className="card">
      <h2>Photos and files</h2>
      {(files ?? []).length === 0 && <p>No files.</p>}
      <div className="row" style={{ alignItems: "flex-start" }}>
        {(files ?? []).map((f) => {
          const u = urlOf.get(f.storage_key);
          if (!u) return null;
          if (f.kind === "video") return <video key={f.id} src={u} controls style={{ maxWidth: 320, borderRadius: 8 }} />;
          if (f.kind === "pdf") return <a key={f.id} href={u} target="_blank" rel="noreferrer">📄 {f.file_name}</a>;
          return <a key={f.id} href={u} target="_blank" rel="noreferrer"><img src={u} alt={f.file_name} style={{ maxWidth: 200, borderRadius: 8 }} /></a>;
        })}
      </div>
      {me && <TicketFiles L={L} tenantId={me.tenant_id} ticketId={id} userId={uid} />}
    </div>
  );
  const timelineCard = (
    <div className="card">
      <h2>What the customer sees</h2>
      <p>Current: <b>{t.customer_device_status ? tr(`st_${t.customer_device_status}` as "st_ready") : tr("st_received")}</b></p>
      <ul>{(events ?? []).map((ev) => <li key={ev.id}>{new Date(ev.created_at).toLocaleString()} — {ev.kind === "created" ? L.ticketCreated : tr(`st_${ev.status}` as "st_ready")}</li>)}</ul>
    </div>
  );
  const qcCard = dev?.serial_number ? (
    <div className="card">
      <h2>Quality Control</h2>
      <p>{qc ? <>Last QC: <span className="badge">{qcLabel[qc.status] ?? qc.status}</span> · {new Date(qc.created_at).toLocaleString()} · <a href={`/qc/${qc.id}`}>open</a></> : "No QC check for this serial number yet."}</p>
      <p><a href={`/qc/new?sn=${encodeURIComponent(dev.serial_number)}&ticket=${id}`}>New QC check</a> · <a href={`/qc?sn=${encodeURIComponent(dev.serial_number)}`}>QC history</a></p>
    </div>
  ) : null;
  return (
    <div>
      <div className="card">
        <h1>{t.ticket_no} — {t.subject}</h1>
        <p>{t.description}</p>
        <p>Serial number: <b>{dev?.serial_number ?? "—"}</b> · Status: {t.status} · Priority: {t.priority}</p>
        {dev?.serial_number && <p><a href={`/qc/new?sn=${encodeURIComponent(dev.serial_number)}&ticket=${id}`}>New QC check for this device</a> · <a href={`/qc?sn=${encodeURIComponent(dev.serial_number)}`}>QC history</a></p>}
        <p>Customer sees: {t.customer_device_status ? tr(`st_${t.customer_device_status}` as "st_ready") : tr("st_received")}</p>
        {error && <p className="err">{error}</p>}
      </div>
      {filesCard}
      {timelineCard}
      {qcCard}
      {!t.assigned_to ? (
        <form action={apply} className="card"><input type="hidden" name="id" value={id} /><button>Apply (take this ticket)</button></form>
      ) : (
        <>
          <form action={setStatus} className="card">
            <h2>Device service status</h2>
            <p>Current: <b>{state?.status ?? "—"}</b></p>
            <input type="hidden" name="id" value={id} />
            <select name="status" defaultValue={state?.status ?? "in_progress"}>
              <option value="in_progress">In progress</option><option value="done">Done</option>
              <option value="rma">RMA</option><option value="repair_not_possible">Repair is not possible</option>
            </select>
            <input name="comment" placeholder="Comment (internal)" />
            <button>Save status</button>
          </form>
          <form action={saveManual} className="card">
            <h2>Device information (staff only)</h2>
            <p>Source: {info?.source ?? "not filled"}</p>
            <input type="hidden" name="id" value={id} />
            <label>Model<input name="model" defaultValue={info?.model_name ?? ""} /></label>
            <label>Sold date<input name="sold" type="date" defaultValue={info?.sold_date ?? ""} /></label>
            <label>Warranty until<input name="warranty" type="date" defaultValue={info?.warranty_until ?? ""} /></label>
            <label>Customer name<input name="customer" defaultValue={info?.customer_name ?? ""} /></label>
            <button>Save device information</button>
          </form>
        </>
      )}
      {chat}
      {canDelete === true && (
        <form action={deleteTicketAction} className="card">
          <h2>Delete ticket</h2>
          <p>The ticket moves to Trash. The reason is saved with who deleted it.</p>
          <input type="hidden" name="id" value={id} /><input type="hidden" name="back" value={`/tickets/${id}`} />
          <input name="reason" placeholder="Reason for deleting" required minLength={5} />
          <ConfirmButton className="btn danger" message="Move this ticket to Trash?">Delete ticket</ConfirmButton>
        </form>
      )}
      {isAdmin === true && (
        <form action={hardDeleteTicketAction} className="card">
          <h2>Delete permanently (administrator)</h2>
          <p>Removes the ticket and its messages, files and history for good. Cannot be undone. Recorded in the audit log.</p>
          <input type="hidden" name="id" value={id} /><input type="hidden" name="back" value={`/tickets/${id}`} />
          <input name="reason" placeholder="Reason" required minLength={5} />
          <ConfirmButton className="btn danger" message="Permanently delete this ticket? This cannot be undone.">Delete permanently</ConfirmButton>
        </form>
      )}
    </div>
  );
}
