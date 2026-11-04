import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";

async function signOut() { "use server"; const sb = await supabaseServer(); await sb.auth.signOut(); redirect("/login"); }

export default async function Tickets() {
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  const { data: me } = await sb.from("users").select("first_name,last_name,kind,registration").eq("id", auth.user!.id).maybeSingle();
  if (me && me.kind === "customer" && me.registration !== "approved") {
    return <div className="card"><h1>Waiting for approval</h1><p>Your account is {me.registration}. The service center must approve it first.</p><form action={signOut}><button>Sign out</button></form></div>;
  }
  const { data: isAdmin } = await sb.rpc("is_tenant_admin");
  const { data: tickets, error } = await sb.from("tickets").select("id,ticket_no,subject,status,priority,created_at").is("deleted_at", null).order("created_at", { ascending: false }).limit(100);
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>Tickets</h1>
        <div>{me?.kind === "staff" && <a href="/customers" style={{ marginRight: 16 }}>Customers</a>}{isAdmin === true && <a href="/admin/users" style={{ marginRight: 16 }}>Staff users</a>}<a href="/account" style={{ marginRight: 16 }}>Account</a><form action={signOut} style={{ display: "inline" }}><button>Sign out{me ? ` (${me.first_name})` : ""}</button></form></div>
      </div>
      <div className="card">
        {error && <p className="err">{error.message}</p>}
        <table><thead><tr><th>No</th><th>Subject</th><th>Status</th><th>Priority</th><th>Created</th></tr></thead>
          <tbody>{(tickets ?? []).map((t) => (
            <tr key={t.id}><td><a href={`/tickets/${t.id}`}>{t.ticket_no}</a></td><td>{t.subject}</td><td>{t.status}</td><td>{t.priority}</td><td>{new Date(t.created_at).toLocaleString()}</td></tr>
          ))}</tbody></table>
        {!tickets?.length && <p>No tickets yet.</p>}
      </div>
    </div>
  );
}
