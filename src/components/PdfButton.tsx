"use client";
import { useState } from "react";
import { downloadReportPdf } from "@/lib/calc-pdf";

export default function PdfButton({ targetId, fileName, label, busyLabel }: { targetId: string; fileName: string; label: string; busyLabel: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <button type="button" disabled={busy} onClick={async () => {
      const el = document.getElementById(targetId);
      if (!el) return;
      setBusy(true);
      try { await downloadReportPdf(el, fileName); } finally { setBusy(false); }
    }}>{busy ? busyLabel : label}</button>
  );
}
