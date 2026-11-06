// Pure calculation for the Calculator menu (disk space for CCTV, UPS battery runtime). Estimates only.

export type Brand = "dahua" | "unv";
export const BRANDS: { id: Brand; name: string }[] = [{ id: "dahua", name: "Dahua" }, { id: "unv", name: "Uniview (UNV)" }];

// Typical bitrate per camera, Mbps at 25 fps with H.264 and a normal scene.
export const RESOLUTIONS: { id: string; label: string; mbps: number }[] = [
  { id: "1", label: "1 MP (720p)", mbps: 2 }, { id: "2", label: "2 MP (1080p)", mbps: 4 }, { id: "3", label: "3 MP", mbps: 5 },
  { id: "4", label: "4 MP", mbps: 6 }, { id: "5", label: "5 MP", mbps: 8 }, { id: "6", label: "6 MP", mbps: 10 }, { id: "8", label: "8 MP (4K)", mbps: 12 },
];
// Compression: share of the H.264 bitrate that is still needed. "smart" is H.265+ (Dahua) / Ultra 265 (UNV).
export const CODEC_FACTOR = { h264: 1, h265: 0.5, smart: 0.4 } as const;
export type Codec = keyof typeof CODEC_FACTOR;
export const SMART_NAME: Record<Brand, string> = { dahua: "H.265+ (Smart Codec)", unv: "Ultra 265" };

export type Nvr = { id: string; brand: Brand; model: string; channels: number; bays: number; maxTb: number; mbps: number; raid: boolean };
// Typical values of common models. Always confirm with the datasheet of the exact version.
export const NVRS: Nvr[] = [
  { id: "d4108", brand: "dahua", model: "NVR4108HS-8P-4KS2/L", channels: 8, bays: 1, maxTb: 10, mbps: 80, raid: false },
  { id: "d4208", brand: "dahua", model: "NVR4208-8P-4KS2/L", channels: 8, bays: 2, maxTb: 10, mbps: 144, raid: false },
  { id: "d4216", brand: "dahua", model: "NVR4216-16P-4KS2/L", channels: 16, bays: 2, maxTb: 10, mbps: 160, raid: false },
  { id: "d4232", brand: "dahua", model: "NVR4232-4KS2/L", channels: 32, bays: 2, maxTb: 10, mbps: 256, raid: false },
  { id: "d5216", brand: "dahua", model: "NVR5216-16P-4KS2E", channels: 16, bays: 2, maxTb: 16, mbps: 320, raid: false },
  { id: "d5232", brand: "dahua", model: "NVR5232-16P-4KS2E", channels: 32, bays: 2, maxTb: 16, mbps: 320, raid: false },
  { id: "u30104", brand: "unv", model: "NVR301-04S3-P4", channels: 4, bays: 1, maxTb: 8, mbps: 80, raid: false },
  { id: "u30108", brand: "unv", model: "NVR301-08S3-P8", channels: 8, bays: 1, maxTb: 8, mbps: 80, raid: false },
  { id: "u30216", brand: "unv", model: "NVR302-16S2-P16", channels: 16, bays: 2, maxTb: 10, mbps: 160, raid: false },
  { id: "u30432", brand: "unv", model: "NVR304-32S", channels: 32, bays: 4, maxTb: 10, mbps: 320, raid: false },
  { id: "u30864", brand: "unv", model: "NVR308-64R-B", channels: 64, bays: 8, maxTb: 10, mbps: 512, raid: true },
];

export type Raid = "none" | "1" | "5" | "6" | "10";
const RAID_MIN: Record<Raid, number> = { none: 1, "1": 2, "5": 3, "6": 4, "10": 4 };
const usableDisks = (r: Raid, n: number) => (r === "none" ? n : r === "1" ? (n % 2 ? 0 : n / 2) : r === "5" ? n - 1 : r === "6" ? n - 2 : n % 2 ? 0 : n / 2);

export type DiskIn = {
  brand: Brand; cameras: number; res: string; codec: Codec; fps: number; bitrate?: number | null;
  mode: "cont" | "motion"; motionPct: number; days: number; raid: Raid; diskTb: number; haveDisks?: number | null;
  nvr: { channels: number; bays: number; maxTb: number; mbps: number; raid: boolean } | null;
};
export type Check = { kind: "channels" | "bays" | "disk" | "bw" | "raid"; a: number; b: number };
export type DiskOut = {
  mbpsPerCam: number; gbPerCamDay: number; needTb: number; disks: number | null; usableTb: number; rawTb: number;
  totalMbps: number; checks: Check[]; haveDays: number | null;
};
export const RESERVE = 1.15;

export function diskCalc(i: DiskIn): DiskOut {
  const base = RESOLUTIONS.find((r) => r.id === i.res)?.mbps ?? 4;
  const mbpsPerCam = i.bitrate && i.bitrate > 0 ? i.bitrate : base * CODEC_FACTOR[i.codec] * (i.fps / 25);
  const share = i.mode === "motion" ? Math.min(100, Math.max(0, i.motionPct)) / 100 : 1;
  const gbPerCamDay = (mbpsPerCam * 86400 / 8 / 1000) * share;   // decimal GB, like disk makers count
  const needTb = (gbPerCamDay * i.cameras * i.days * RESERVE) / 1000;
  let disks: number | null = null;
  if (i.diskTb > 0 && needTb > 0) {
    for (let n = RAID_MIN[i.raid]; n <= 64; n++) { if (usableDisks(i.raid, n) * i.diskTb >= needTb) { disks = n; break; } }
  }
  const n = disks ?? 0;
  const usableTb = usableDisks(i.raid, n) * i.diskTb;
  const totalMbps = mbpsPerCam * i.cameras;
  const checks: Check[] = [];
  if (i.nvr) {
    if (i.cameras > i.nvr.channels) checks.push({ kind: "channels", a: i.cameras, b: i.nvr.channels });
    if (disks && disks > i.nvr.bays) checks.push({ kind: "bays", a: disks, b: i.nvr.bays });
    if (i.diskTb > i.nvr.maxTb) checks.push({ kind: "disk", a: i.diskTb, b: i.nvr.maxTb });
    if (totalMbps > i.nvr.mbps) checks.push({ kind: "bw", a: Math.round(totalMbps * 10) / 10, b: i.nvr.mbps });
    if (i.raid !== "none" && !i.nvr.raid) checks.push({ kind: "raid", a: 0, b: 0 });
  }
  let haveDays: number | null = null;
  if (i.haveDisks && i.haveDisks > 0 && i.diskTb > 0 && gbPerCamDay > 0 && i.cameras > 0) {
    haveDays = (usableDisks(i.raid, i.haveDisks) * i.diskTb * 1000) / (gbPerCamDay * i.cameras * RESERVE);
  }
  return { mbpsPerCam, gbPerCamDay, needTb, disks, usableTb, rawTb: n * i.diskTb, totalMbps, checks, haveDays };
}

export type UpsIn = { loadW: number; volts: number; ah: number; strings: number; effPct: number; dodPct: number; condPct: number; upsW?: number | null; targetMin?: number | null };
export type UpsOut = {
  storedWh: number; usableWh: number; runtimeMin: number; byLoad: { pct: number; watts: number; min: number }[];
  recommendedW: number; needAh: number | null; overload: boolean;
};
export function upsCalc(i: UpsIn): UpsOut {
  const storedWh = i.volts * i.ah * Math.max(1, i.strings);
  const factor = (i.effPct / 100) * (i.dodPct / 100) * (i.condPct / 100);
  const usableWh = storedWh * factor;
  const runtimeMin = i.loadW > 0 ? (usableWh / i.loadW) * 60 : 0;
  const byLoad = i.upsW && i.upsW > 0 ? [25, 50, 75, 100].map((p) => { const watts = (i.upsW! * p) / 100; return { pct: p, watts, min: (usableWh / watts) * 60 }; }) : [];
  const needAh = i.targetMin && i.targetMin > 0 && i.loadW > 0 && i.volts > 0 && factor > 0 ? (i.loadW * (i.targetMin / 60)) / (i.volts * factor) : null;
  return { storedWh, usableWh, runtimeMin, byLoad, recommendedW: i.loadW * 1.25, needAh, overload: !!(i.upsW && i.loadW > i.upsW * 0.8) };
}
