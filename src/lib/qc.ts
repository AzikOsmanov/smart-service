export const QC_STATUSES = ["done", "broken", "hardware_issue"] as const;
export type QcStatus = (typeof QC_STATUSES)[number];
export const QC_LABEL: Record<QcStatus, string> = { done: "Done", broken: "Broken", hardware_issue: "Hardware issue" };
