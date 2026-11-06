// Pure calculation for the Calculator menu (disk space for CCTV, UPS battery runtime). Estimates only.

export type Brand = "dahua" | "unv";
export const BRANDS: { id: Brand; name: string }[] = [{ id: "dahua", name: "Dahua" }, { id: "unv", name: "Uniview (UNV)" }];

// Dahua: typical bitrate per camera, Kbps at 25 fps with H.264 and a normal scene (estimates, not yet matched to Dahua's own tool).
export const RESOLUTIONS: { id: string; label: string; kbps: number }[] = [
  { id: "1", label: "1 MP (720p)", kbps: 2000 }, { id: "2", label: "2 MP (1080p)", kbps: 4000 }, { id: "3", label: "3 MP", kbps: 5000 },
  { id: "4", label: "4 MP", kbps: 6000 }, { id: "5", label: "5 MP", kbps: 8000 }, { id: "6", label: "6 MP", kbps: 10000 }, { id: "8", label: "8 MP (4K)", kbps: 12000 },
];
// Dahua compression: share of the H.264 bitrate still needed. "smart" is H.265+ (Smart Codec).
export const CODEC_FACTOR = { h264: 1, h265: 0.5, smart: 0.4 } as const;
export type Codec = keyof typeof CODEC_FACTOR;
export const SMART_NAME: Record<Brand, string> = { dahua: "H.265+ (Smart Codec)", unv: "Ultra 265" };

// UNV: taken from the UNV storage tool (H.265, 25 fps, U-Code Advanced Mode, environmental complexity Medium), Kbps per camera.
// The tool uses steps by resolution. U-Code Off doubles the value (seen at 32 MP: 8704 against 4352).
// kbps = H.265 with U-Code Advanced Mode; h264 = H.264 (the tool shows U-Code Off for H.264). H.265 with U-Code Off is exactly twice kbps (seen at 720P, 960P, 1080P, 4MP, 32MP).
// ok264 = the H.264 value was read from the tool (the tool groups resolutions by megapixel class: 3MP, 4MP, 5MP, 6MP ...).
export const UNV_RES: { id: string; label: string; kbps: number; h264: number; ok264: boolean }[] = [
  { id: "720", label: "1280*720 (720P)", kbps: 512, h264: 2048, ok264: true }, { id: "960", label: "1280*960 (960P)", kbps: 512, h264: 2048, ok264: true },
  { id: "1080", label: "1920*1080 (1080P)", kbps: 1024, h264: 4096, ok264: true },
  { id: "3mp", label: "2000*1500 (3MP)", kbps: 1280, h264: 5120, ok264: true }, { id: "3mp2", label: "2304*1296 (3MP)", kbps: 1280, h264: 5120, ok264: true },
  { id: "4mp", label: "3000*1500 (4MP)", kbps: 2176, h264: 6144, ok264: true }, { id: "4mp2", label: "2560*1440 (4MP)", kbps: 2176, h264: 6144, ok264: true },
  { id: "4mp3", label: "2688*1520 (4MP)", kbps: 2176, h264: 6144, ok264: false },
  { id: "5mp", label: "2592*2048 (5MP)", kbps: 2176, h264: 6144, ok264: true }, { id: "6mp", label: "3072*2048 (6MP)", kbps: 2560, h264: 7168, ok264: true },
  { id: "4k", label: "3840*2160 (4K)", kbps: 2944, h264: 8192, ok264: false }, { id: "8mp", label: "4096*2160 (8MP)", kbps: 2944, h264: 8192, ok264: true },
  { id: "9mp", label: "3000*3000 (9MP)", kbps: 2944, h264: 8192, ok264: false }, { id: "12mp", label: "4800*2688 (12MP)", kbps: 4352, h264: 12288, ok264: true },
  { id: "16mp", label: "4000*4000 (16MP)", kbps: 4352, h264: 12288, ok264: true }, { id: "32mp", label: "8640*3840 (32MP)", kbps: 4352, h264: 12288, ok264: true },
];

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
  brand: Brand; cameras: number; res: string; codec: Codec; ucode?: "off" | "basic" | "adv"; cx?: "low" | "med" | "high"; fps: number; bitrate?: number | null;
  mode: "cont" | "motion"; motionPct: number; days: number; raid: Raid; diskTb: number; haveDisks?: number | null;
  nvr: { channels: number; bays: number; maxTb: number; mbps: number; raid: boolean } | null;
};
export type Check = { kind: "channels" | "bays" | "disk" | "bw" | "raid"; a: number; b: number };
export type DiskOut = {
  kbpsPerCam: number; gibPerCamDay: number; gibPerDayAll: number; needTb: number; needTbReserve: number; disks: number | null; usableTb: number; rawTb: number;
  totalKbps: number; totalMbps: number; checks: Check[]; haveDays: number | null; haveDaysReserve: number | null; estimated: boolean;
};
export const RESERVE = 1.15;
const GIB = 1073741824;   // recorders show GB as 1,073,741,824 bytes and Kbps as 1024 bits/s; disks are sold in decimal TB

export function diskCalc(i: DiskIn): DiskOut {
  let base: number, estimated = false;
  if (i.brand === "unv") {
    // Seen in the UNV tool at 1080P: Off = full value; Basic Mode = 0.75 / 0.21875 / 1.0 and Advanced Mode = 0.5 / 0.125 / 0.75 for medium / low / high complexity.
    // The same steps are applied to every resolution (checked for medium complexity and for H.264 and H.265 at several resolutions).
    const r = UNV_RES.find((x) => x.id === i.res) ?? UNV_RES[2];
    const mode = i.ucode ?? "adv", cx = i.cx ?? "med";
    const off = i.codec === "h264" ? r.h264 : r.kbps * 2;
    const F = { off: { low: 1, med: 1, high: 1 }, basic: { low: 0.21875, med: 0.75, high: 1 }, adv: { low: 0.125, med: 0.5, high: 0.75 } }[mode];
    base = off * F[cx];
    estimated = (i.codec === "h264" ? !r.ok264 : r.id === "4mp3") || (mode === "basic" && !(i.codec === "h264" && r.id === "1080")) || (mode !== "off" && cx !== "med" && r.id !== "1080");
  } else {
    base = (RESOLUTIONS.find((r) => r.id === i.res)?.kbps ?? 4000) * CODEC_FACTOR[i.codec];
    estimated = true;
  }
  // The UNV tool gives the same bitrate at 12, 15 and 25 fps, so UNV is not scaled by frame rate; Dahua estimates are scaled.
  const kbpsPerCam = i.bitrate && i.bitrate > 0 ? i.bitrate : base * (i.brand === "unv" ? 1 : i.fps / 25);
  const share = i.mode === "motion" ? Math.min(100, Math.max(0, i.motionPct)) / 100 : 1;
  const bytesPerCamDay = ((kbpsPerCam * 1024 * 86400) / 8) * share;
  const bytesAllDay = bytesPerCamDay * i.cameras;
  const needTb = (bytesAllDay * i.days) / 1e12, needTbReserve = needTb * RESERVE;
  let disks: number | null = null;
  if (i.diskTb > 0 && needTbReserve > 0) {
    for (let n = RAID_MIN[i.raid]; n <= 64; n++) { if (usableDisks(i.raid, n) * i.diskTb >= needTbReserve) { disks = n; break; } }
  }
  const n = disks ?? 0;
  const usableTb = usableDisks(i.raid, n) * i.diskTb;
  const totalKbps = kbpsPerCam * i.cameras, totalMbps = totalKbps / 1024;
  const checks: Check[] = [];
  if (i.nvr) {
    if (i.cameras > i.nvr.channels) checks.push({ kind: "channels", a: i.cameras, b: i.nvr.channels });
    if (disks && disks > i.nvr.bays) checks.push({ kind: "bays", a: disks, b: i.nvr.bays });
    if (i.diskTb > i.nvr.maxTb) checks.push({ kind: "disk", a: i.diskTb, b: i.nvr.maxTb });
    if (totalMbps > i.nvr.mbps) checks.push({ kind: "bw", a: Math.round(totalMbps * 10) / 10, b: i.nvr.mbps });
    if (i.raid !== "none" && !i.nvr.raid) checks.push({ kind: "raid", a: 0, b: 0 });
  }
  let haveDays: number | null = null, haveDaysReserve: number | null = null;
  if (i.haveDisks && i.haveDisks > 0 && i.diskTb > 0 && bytesAllDay > 0) {
    const bytes = usableDisks(i.raid, i.haveDisks) * i.diskTb * 1e12;
    haveDays = bytes / bytesAllDay; haveDaysReserve = haveDays / RESERVE;
  }
  return { kbpsPerCam, gibPerCamDay: bytesPerCamDay / GIB, gibPerDayAll: bytesAllDay / GIB, needTb, needTbReserve, disks, usableTb, rawTb: n * i.diskTb, totalKbps, totalMbps, checks, haveDays, haveDaysReserve, estimated };
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
