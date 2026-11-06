"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";
import type { StaffLabels } from "@/lib/i18n-staff";

type T = { id: string; title: string; description: string | null; audience: string; source: string; url: string | null };

// "Edit" button + pop-up to change a tutorial's title, description, audience and (for links) the link.
export default function TutorialEdit({ t, S }: { t: T; S: StaffLabels }) {
  const ref = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr("");
    const fd = new FormData(e.currentTarget);
    const link = String(fd.get("url") || "").trim();
    if (t.source === "link" && !/^https:\/\/[^\s]+$/i.test(link)) { setErr(S.tutBadLink); return; }
    setBusy(true);
    const patch: Record<string, unknown> = {
      title: String(fd.get("title") || "").trim(), description: String(fd.get("description") || "").trim() || null,
      audience: String(fd.get("audience") || "all"), updated_at: new Date().toISOString(),
    };
    if (t.source === "link") patch.url = link;
    const { error } = await supabaseBrowser().from("tutorials").update(patch).eq("id", t.id);
    setBusy(false);
    if (error) { setErr(error.message); return; }
    ref.current?.close();
    router.refresh();
  }

  return (
    <>
      <button type="button" className="btn" onClick={() => { setErr(""); ref.current?.showModal(); }}>{S.tutEdit}</button>
      <dialog ref={ref} className="modal" onClick={(e) => { if (e.target === ref.current) ref.current?.close(); }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2 style={{ margin: 0 }}>{S.tutEditTitle}</h2>
          <button type="button" className="btn ghost" onClick={() => ref.current?.close()} aria-label="Close">✕</button>
        </div>
        <form onSubmit={submit}>
          <label>{S.tutName}<input name="title" required maxLength={160} defaultValue={t.title} /></label>
          <label>{S.tutDesc}<textarea name="description" rows={3} maxLength={1000} defaultValue={t.description ?? ""} /></label>
          <label>{S.tutAudience}
            <select name="audience" defaultValue={t.audience}>
              <option value="all">{S.tutAudAll}</option><option value="customers">{S.tutAudCustomers}</option><option value="staff">{S.tutAudStaff}</option>
            </select>
          </label>
          {t.source === "link"
            ? <label>{S.tutLink}<input name="url" type="url" required defaultValue={t.url ?? ""} placeholder="https://" /></label>
            : <p><small>{S.tutFileKept}</small></p>}
          {err && <p className="err">{err}</p>}
          <button disabled={busy}>{busy ? S.tutUploading : S.tutSaveChanges}</button>
        </form>
      </dialog>
    </>
  );
}
