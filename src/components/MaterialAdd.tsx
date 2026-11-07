"use client";
import { useRef, useState } from "react";
import MaterialForm from "@/components/MaterialForm";
import type { StaffLabels } from "@/lib/i18n-staff";

// "Add new material" button + pop-up window with the form.
export default function MaterialAdd({ tenantId, creator, S }: { tenantId: string; creator: string; S: StaffLabels }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [done, setDone] = useState("");
  return (
    <>
      <button onClick={() => { setDone(""); ref.current?.showModal(); }}>＋ {S.matAdd}</button>
      {done && <span style={{ marginLeft: 12 }}>{done}</span>}
      <dialog ref={ref} className="modal" onCancel={(e) => e.preventDefault()}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2 style={{ margin: 0 }}>{S.matNewTitle}</h2>
          <button type="button" className="btn ghost" onClick={() => ref.current?.close()} aria-label="Close">✕</button>
        </div>
        <MaterialForm tenantId={tenantId} creator={creator} S={S} onDone={(m) => { setDone(m); ref.current?.close(); }} />
      </dialog>
    </>
  );
}
