"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { fmt } from "@/lib/fmt";
import type { PortalLabels } from "@/lib/i18n-portal";

const HEADERS = new Set(["SERIAL", "SERIALNUMBER", "SERIAL_NUMBER", "SN", "S/N", "NO", "MODEL", "NAME", "DEVICE"]);

export default function BulkAdd({ L }: { L: PortalLabels }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (f) setText((prev) => (prev ? prev + "\n" : "") + (await f.text()));
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(""); setMsg("");
    const tokens = Array.from(new Set(text.split(/[\s,;]+/).map((x) => x.trim().toUpperCase()).filter((x) => x && !HEADERS.has(x))));
    if (!tokens.length) { setErr(L.bulkNone); return; }
    const noDigit = tokens.filter((t) => !/\d/.test(t));
    const candidates = tokens.filter((t) => /\d/.test(t));
    setBusy(true);
    const { data, error } = await supabaseBrowser().rpc("register_devices_bulk", { p_serials: candidates });
    setBusy(false);
    if (error) { setErr(error.message === "too_many" ? "Max 500 serial numbers at a time." : error.message); return; }
    const r = data as { added: number; existing: string[]; invalid: string[] };
    setMsg(fmt(L.bulkResult, { added: String(r.added), existing: r.existing.join(", ") || "0", invalid: [...r.invalid, ...noDigit].join(", ") || "0" }));
    setText("");
    router.refresh();
  }
  return (
    <form onSubmit={submit} className="card" style={{ maxWidth: 640 }}>
      <h2>{L.bulkTitle}</h2>
      <p><small>{L.bulkHint}</small></p>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} placeholder={L.bulkPlaceholder} />
      <div className="row">
        <label className="btn" style={{ cursor: "pointer" }}>{L.bulkFile}<input type="file" accept=".txt,.csv,text/plain,text/csv" onChange={onFile} hidden /></label>
        <button disabled={busy}>{busy ? L.bulkWorking : L.bulkButton}</button>
      </div>
      {err && <p className="err">{err}</p>}
      {msg && <p>{msg}</p>}
    </form>
  );
}
