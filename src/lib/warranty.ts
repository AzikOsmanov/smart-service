// Warranty text for the customer screens. A date gives in/out of warranty; without a date the text from the other system is shown as is.
export function warrantyText(L: { inWarranty: string; outWarranty: string }, until: string | null | undefined, note: string | null | undefined): string {
  if (until) {
    const past = until < new Date().toISOString().slice(0, 10);
    return (past ? L.outWarranty : L.inWarranty).replace("{date}", until);
  }
  return note?.trim() || "—";
}
