"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";

// Pop-up window over the list. It closes only with its Close button (not by clicking outside or pressing Esc).
export default function EditDialog({ backHref, children }: { backHref: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  useEffect(() => { const d = ref.current; if (d && !d.open) d.showModal(); }, []);
  return (
    <dialog ref={ref} className="modal" onCancel={(e) => e.preventDefault()}>
      <div className="row" style={{ justifyContent: "flex-end" }}>
        <button type="button" className="btn ghost" aria-label="Close" onClick={() => { router.push(backHref); router.refresh(); }}>✕</button>
      </div>
      {children}
    </dialog>
  );
}
