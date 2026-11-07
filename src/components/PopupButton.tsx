"use client";
import { useRef, type ReactNode } from "react";

// A button that opens its content (usually a form) in a pop-up window. Closes with ✕ or right after the form is sent.
export default function PopupButton({ label, title, children }: { label: string; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button type="button" onClick={() => ref.current?.showModal()}>＋ {label}</button>
      <dialog ref={ref} className="modal" onCancel={(e) => e.preventDefault()} onSubmit={() => setTimeout(() => ref.current?.close(), 0)}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2 style={{ margin: 0 }}>{title}</h2>
          <button type="button" className="btn ghost" aria-label="Close" onClick={() => ref.current?.close()}>✕</button>
        </div>
        {children}
      </dialog>
    </>
  );
}
