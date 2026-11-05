"use client";
import { useRef, useState } from "react";
import TutorialForm from "@/components/TutorialForm";
import type { StaffLabels } from "@/lib/i18n-staff";

// "Add a tutorial" button + pop-up window with the upload form.
export default function TutorialAdd({ tenantId, S }: { tenantId: string; S: StaffLabels }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [done, setDone] = useState("");
  return (
    <>
      <button onClick={() => { setDone(""); ref.current?.showModal(); }}>＋ {S.tutAdd}</button>
      {done && <span style={{ marginLeft: 12 }}>{done}</span>}
      <dialog ref={ref} className="modal" onClick={(e) => { if (e.target === ref.current) ref.current?.close(); }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2 style={{ margin: 0 }}>{S.tutNewTitle}</h2>
          <button type="button" className="btn ghost" onClick={() => ref.current?.close()} aria-label="Close">✕</button>
        </div>
        <TutorialForm tenantId={tenantId} S={S} onDone={(m) => { setDone(m); ref.current?.close(); }} />
      </dialog>
    </>
  );
}
