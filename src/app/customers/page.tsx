import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase-server";

async function review(fd: FormData) {
  "use server";
  const sb = await supabaseServer();
  await sb.rpc("review_registration", { p_user: String(fd.get("id")), p_approve: fd.get("decision") === "approve", p_note: String(fd.get("note") || "") });
  revalidatePath("/customers");
}

export default async function Customers() {
  const sb = await supabaseServer();
  const { data, error } = await sb.from("users").select("id,first_name,last_name,email,phone,registration,created_at,companies(name,city)").eq("kind", "customer").is("deleted_at", null).order("created_at", { ascending: false });
  return (
    <div>
      <p><a href="/tickets">← Tickets</a></p>
      <h1>Customers</h1>
      <div className="card">
        {error && <p className="err">{error.message}</p>}
        <table><thead><tr><th>Name</th><th>Company / city</th><th>Contact</th><th>Status</th><th></th></tr></thead>
          <tbody>{(data ?? []).map((u: any) => (
            <tr key={u.id}>
              <td>{u.first_name} {u.last_name}</td>
              <td>{u.companies?.name} / {u.companies?.city}</td>
              <td>{u.email}<br />{u.phone}</td>
              <td>{u.registration}</td>
              <td>{u.registration === "pending" && (
                <form action={review}><input type="hidden" name="id" value={u.id} />
                  <input name="note" placeholder="Note" />
                  <button name="decision" value="approve">Approve</button> <button name="decision" value="reject">Reject</button></form>)}</td>
            </tr>))}</tbody></table>
      </div>
    </div>
  );
}
