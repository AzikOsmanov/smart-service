"use client";
// Turns the report block on the screen into a one-page A4 PDF and downloads it. Nothing is stored.
export async function downloadReportPdf(el: HTMLElement, fileName: string) {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas"), import("jspdf")]);
  const canvas = await html2canvas(el, { scale: 2, backgroundColor: "#ffffff", useCORS: true });
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = pdf.internal.pageSize.getWidth(), pageH = pdf.internal.pageSize.getHeight(), margin = 10;
  const w = pageW - margin * 2;
  const h = (canvas.height * w) / canvas.width;
  const img = canvas.toDataURL("image/jpeg", 0.92);
  if (h <= pageH - margin * 2) pdf.addImage(img, "JPEG", margin, margin, w, h);
  else {
    // A long report continues on the next pages.
    let y = 0;
    const sliceH = ((pageH - margin * 2) * canvas.width) / w;
    while (y < canvas.height) {
      const part = document.createElement("canvas");
      part.width = canvas.width; part.height = Math.min(sliceH, canvas.height - y);
      part.getContext("2d")!.drawImage(canvas, 0, y, canvas.width, part.height, 0, 0, canvas.width, part.height);
      if (y > 0) pdf.addPage();
      pdf.addImage(part.toDataURL("image/jpeg", 0.92), "JPEG", margin, margin, w, (part.height * w) / canvas.width);
      y += sliceH;
    }
  }
  pdf.save(fileName);
}
