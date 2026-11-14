import { supabaseServer } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getStaff } from "@/lib/i18n-staff";
import { fmt } from "@/lib/fmt";
import { fmtDT } from "@/lib/fmt-time";
import { expiryOf, isCompanyAdmin, loadPrices, seatsInUse, vendorContact, type Lic } from "@/lib/license";
import { requestPayment } from "@/lib/subscription-actions";
import QuoteForm from "@/components/QuoteForm";

// The company administrator's view of the license: users in use, prices, how to pay, payments made, and a request to renew or add seats.
// Also shown on the "license expired" page, so a frozen company can see how to pay.
export default async function SubscriptionPanel() {
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return null;
  const admin = supabaseAdmin();
  const { data: u } = await admin.from("users").select("tenant_id").eq("id", auth.user.id).maybeSingle();
  if (!u || !(await isCompanyAdmin(admin, auth.user.id, u.tenant_id))) return null;
  const { data: l } = await admin.from("tenant_licenses").select("*").eq("tenant_id", u.tenant_id).maybeSingle();
  if (!l || (l as Lic).exempt || (l as Lic).state === "pending") return null;
  const lic = l as Lic;
  const { S } = await getStaff();
  const [prices, used, contact, methods, payments, open] = await Promise.all([
    loadPrices(admin), seatsInUse(admin, u.tenant_id), vendorContact(admin),
    admin.from("payment_methods").select("id,name,instructions").eq("enabled", true).order("sort").order("created_at"),
    admin.from("license_payments").select("id,created_at,amount,currency,method,paid_until").eq("tenant_id", u.tenant_id).order("created_at", { ascending: false }).limit(12),
    admin.from("payment_requests").select("id,created_at,staff_seats,customer_seats,months,amount,currency").eq("tenant_id", u.tenant_id).eq("status", "open").order("created_at", { ascending: false }).limit(1),
  ]);
  const p = prices[lic.currency];
  const exp = expiryOf(lic);
  const day = (d: Date | string | null) => (d ? new Date(d).toISOString().slice(0, 10) : "—");
  const regDue = !lic.reg_fee_paid_at;
  const req = open.data?.[0];
  return (
    <div>
      <div className="card" style={{ marginBottom: 16 }}>
        <table><tbody>
          <tr><td>{lic.state === "trial" ? S.subTrialUntil : S.subPaidUntil}</td><td><strong>{day(exp)}</strong></td></tr>
          <tr><td>{S.subStaffNow}</td><td>{used.staff}</td></tr>
          <tr><td>{S.subCustNow}</td><td>{used.customers}</td></tr>
          <tr><td>{S.subBought}</td><td>{lic.staff_seats} · {lic.customer_seats}</td></tr>
          <tr><td>{S.subPrice}</td><td>{S.subStaff}: {p.staff_seat.toFixed(2)} {lic.currency} · {S.subCust}: {p.customer_seat.toFixed(2)} {lic.currency}</td></tr>
          <tr><td>{S.subRegFee}</td><td>{p.reg_fee.toFixed(2)} {lic.currency} — {regDue ? S.subRegDue : S.subRegPaid}</td></tr>
        </tbody></table>
      </div>
      <div className="card" style={{ marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}>{S.subHowPay}</h2>
        {(methods.data ?? []).length === 0 ? <p>{S.subNoMethods}</p> : (methods.data ?? []).map((m) => (
          <div key={m.id as string} style={{ marginBottom: 12 }}><strong>{m.name as string}</strong><div style={{ whiteSpace: "pre-wrap" }}>{m.instructions as string}</div></div>
        ))}
        {contact && <p style={{ whiteSpace: "pre-wrap" }}><strong>{S.licContactLabel}:</strong> {contact}</p>}
      </div>
      <div className="card" style={{ marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}>{S.subReqTitle}</h2>
        <p>{S.subReqHelp}</p>
        {req && <p><strong>{S.subOpenReq}:</strong> {req.months as number} · {req.staff_seats as number}/{req.customer_seats as number} · {Number(req.amount).toFixed(2)} {req.currency as string} ({fmtDT(req.created_at as string)})</p>}
        <QuoteForm action={requestPayment} currency={lic.currency} prices={p} regDue={regDue} minStaff={used.staff} minCust={used.customers}
          defStaff={Math.max(lic.staff_seats, used.staff)} defCust={Math.max(lic.customer_seats, used.customers)}
          labels={{ staff: S.licStaffSeats, customers: S.licCustSeats, months: S.subMonths, total: S.subTotal, send: S.subSend, note: S.licNotes }} />
      </div>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>{S.subHistory}</h2>
        {(payments.data ?? []).length === 0 ? <p>{S.subNoPayments}</p> : (
          <table><thead><tr><th>{S.subDate}</th><th>{S.subAmount}</th><th>{S.subMethod}</th><th>{S.subPaidUntil}</th></tr></thead>
            <tbody>{(payments.data ?? []).map((r) => (
              <tr key={r.id as string}><td>{fmtDT(r.created_at as string)}</td><td>{Number(r.amount).toFixed(2)} {r.currency as string}</td><td>{(r.method as string) ?? "—"}</td><td>{day(r.paid_until as string | null)}</td></tr>))}</tbody></table>
        )}
      </div>
    </div>
  );
}
