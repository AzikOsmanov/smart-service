"use client";
import { useState } from "react";

type L = { staff: string; customers: string; months: string; total: string; send: string; note: string };

// Renew / add seats: the total follows what the administrator types.
export default function QuoteForm({ action, currency, prices, regDue, minStaff, minCust, defStaff, defCust, labels }: {
  action: (fd: FormData) => void | Promise<void>; currency: string; prices: { reg_fee: number; staff_seat: number; customer_seat: number };
  regDue: boolean; minStaff: number; minCust: number; defStaff: number; defCust: number; labels: L;
}) {
  const [staff, setStaff] = useState(defStaff), [cust, setCust] = useState(defCust), [months, setMonths] = useState(1);
  const total = Math.round(((regDue ? prices.reg_fee : 0) + months * (Math.max(minStaff, staff) * prices.staff_seat + Math.max(minCust, cust) * prices.customer_seat)) * 100) / 100;
  return (
    <form action={action}>
      <label>{labels.staff}<input name="staff_seats" type="number" min={minStaff} value={staff} onChange={(e) => setStaff(Number(e.target.value) || 0)} /></label>
      <label>{labels.customers}<input name="customer_seats" type="number" min={minCust} value={cust} onChange={(e) => setCust(Number(e.target.value) || 0)} /></label>
      <label>{labels.months}<select name="months" value={months} onChange={(e) => setMonths(Number(e.target.value))}>{[1, 2, 3, 6, 12, 24].map((m) => <option key={m} value={m}>{m}</option>)}</select></label>
      <label>{labels.note}<input name="note" maxLength={300} /></label>
      <p><strong>{labels.total}: {total.toFixed(2)} {currency}</strong></p>
      <button>{labels.send}</button>
    </form>
  );
}
