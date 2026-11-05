export function warrantyText(t: (k: "inWarranty" | "outWarranty", v?: Record<string, string>) => string, until?: string | null, note?: string | null): string {
  if (until) return t(until < new Date().toISOString().slice(0, 10) ? "outWarranty" : "inWarranty", { date: until });
  return note?.trim() || "—";
}
