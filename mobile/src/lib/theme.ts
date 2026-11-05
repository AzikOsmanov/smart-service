export type ThemeName = "navy" | "dark" | "light";
export type Palette = { bg: string; card: string; fg: string; muted: string; accent: string; accentFg: string; border: string; danger: string; ok: string; chipBg: string; internal: string };

export const PALETTES: Record<ThemeName, Palette> = {
  navy: { bg: "#0b1a33", card: "#12264a", fg: "#e8eef9", muted: "#9fb0cc", accent: "#3b82f6", accentFg: "#ffffff", border: "#23406f", danger: "#f87171", ok: "#34d399", chipBg: "#1b3561", internal: "#3a2f12" },
  dark: { bg: "#0d0f14", card: "#171a21", fg: "#e7e9ee", muted: "#9aa1ad", accent: "#4f8cff", accentFg: "#ffffff", border: "#2a2f3a", danger: "#f87171", ok: "#34d399", chipBg: "#232835", internal: "#3a3115" },
  light: { bg: "#f4f6fb", card: "#ffffff", fg: "#111827", muted: "#6b7280", accent: "#1d4ed8", accentFg: "#ffffff", border: "#e5e7eb", danger: "#dc2626", ok: "#059669", chipBg: "#e8eefc", internal: "#fff7d6" },
};
