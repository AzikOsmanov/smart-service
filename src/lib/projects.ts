import { diskCalc, disksFor, type Raid } from "@/lib/calc";

// Project Management: choosing devices for a camera point from the catalog. Rules only, no AI.
export const AI_OPTIONS = ["face_detection", "face_recognition", "plate_recognition", "people_counting", "line_crossing", "intrusion", "heat_map", "smart_motion"] as const;
export const GOALS = ["detect", "observe", "recognize", "identify"] as const;
export type Goal = (typeof GOALS)[number];
// Pixels per metre at the target (EN 62676-4 style): detect 25, observe 62, recognize 125, identify 250.
export const GOAL_PPM: Record<Goal, number> = { detect: 25, observe: 62, recognize: 125, identify: 250 };
export const GOAL_MPX: Record<Goal, number> = { detect: 2, observe: 2, recognize: 4, identify: 5 };
export const FORMS = ["bullet", "dome", "turret", "ptz", "fisheye", "box", "other"] as const;
export const KINDS = ["camera", "nvr", "switch", "hdd", "ups", "accessory", "other"] as const;

export type CatDevice = {
  id: string; brand: string; kind: string; model: string; description: string | null; form: string | null; mpx: number | null; lens_mm: number | null; hfov_deg: number | null;
  ir_range_m: number | null; night_modes: string[]; audio: string; ai: string[]; poe_w: number | null; outdoor: boolean;
  light_range_m: number | null; dori_detect_m: number | null; dori_observe_m: number | null; dori_recognize_m: number | null; dori_identify_m: number | null;
  channels: number | null; bays: number | null; max_tb_per_disk: number | null; throughput_mbps: number | null; ports: number | null; poe_ports: number | null; poe_budget_w: number | null;
};
export const CAT_COLS = "id,brand,kind,model,description,form,mpx,lens_mm,hfov_deg,ir_range_m,night_modes,audio,ai,poe_w,outdoor,light_range_m,dori_detect_m,dori_observe_m,dori_recognize_m,dori_identify_m,channels,bays,max_tb_per_disk,throughput_mbps,ports,poe_ports,poe_budget_w";
export type Point = {
  id: string; name: string; env: string; mount_h_m: number | null; dist_m: number | null; width_m: number | null; goal: string; night_m: number | null; night_type: string;
  min_mpx: number | null; audio: string; ai: string[]; form: string | null; qty: number; chosen_device_id: string | null; notes: string | null;
};

const H_PIXELS: [number, number][] = [[1, 1280], [2, 1920], [3, 2304], [4, 2560], [5, 2592], [6, 3072], [8, 3840], [12, 4000]];
export function hPixels(mpx: number): number {
  const near = H_PIXELS.reduce((a, b) => (Math.abs(b[0] - mpx) < Math.abs(a[0] - mpx) ? b : a));
  return Math.abs(near[0] - mpx) < 0.6 ? near[1] : Math.round(Math.sqrt(mpx * 1e6 * (16 / 9)));
}
// Horizontal angle of view: from the catalog, or worked out from the lens (1/2.8" sensor, 5.37 mm wide).
export function hfov(d: CatDevice): number | null {
  if (d.hfov_deg && d.hfov_deg > 0) return d.hfov_deg;
  if (d.lens_mm && d.lens_mm > 0) return (2 * Math.atan(5.37 / (2 * d.lens_mm)) * 180) / Math.PI;
  return null;
}
const AUDIO_RANK: Record<string, number> = { none: 0, mic: 1, two_way: 2 };

export type Match = { device: CatDevice; ok: boolean; ppm: number | null; needPpm: number; sceneW: number | null; dori: number | null; fails: string[] };

export function matchPoint(p: Point, devices: CatDevice[], brand: string): Match[] {
  const needPpm = GOAL_PPM[(GOALS as readonly string[]).includes(p.goal) ? (p.goal as Goal) : "recognize"];
  const out: Match[] = [];
  for (const d of devices) {
    if (d.kind !== "camera") continue;
    if (brand !== "any" && d.brand !== brand) continue;
    const fails: string[] = [];
    if (p.env === "outdoor" && !d.outdoor) fails.push("outdoor");
    if (p.form && p.form !== "any" && d.form !== p.form) fails.push("form");
    if ((AUDIO_RANK[d.audio] ?? 0) < (AUDIO_RANK[p.audio] ?? 0)) fails.push("audio");
    for (const a of p.ai ?? []) if (!d.ai.includes(a)) { fails.push("ai"); break; }
    if (p.night_type === "color" && !d.night_modes.includes("color")) fails.push("night");
    if (p.night_type === "ir" && !d.night_modes.includes("ir")) fails.push("night");
    if (p.night_m && p.night_m > 0) {
      const reach = p.night_type === "color" ? (d.light_range_m ?? 0) : p.night_type === "ir" ? (d.ir_range_m ?? 0) : Math.max(d.ir_range_m ?? 0, d.light_range_m ?? 0);
      if (reach < p.night_m) fails.push("nightRange");
    }
    let ppm: number | null = null, sceneW: number | null = null, dori: number | null = null;
    const goalKey = (GOALS as readonly string[]).includes(p.goal) ? (p.goal as Goal) : "recognize";
    const dd = { detect: d.dori_detect_m, observe: d.dori_observe_m, recognize: d.dori_recognize_m, identify: d.dori_identify_m }[goalKey];
    if (d.mpx) {
      const px = hPixels(d.mpx), fov = hfov(d);
      if (p.min_mpx && d.mpx < p.min_mpx) fails.push("mpx");
      if (p.dist_m && p.dist_m > 0 && fov) {
        sceneW = 2 * p.dist_m * Math.tan((fov * Math.PI) / 360);
        if (p.width_m && p.width_m > 0 && sceneW < p.width_m * 0.95) fails.push("fov");
        ppm = px / sceneW;
      } else if (p.width_m && p.width_m > 0) { sceneW = p.width_m; ppm = px / p.width_m; }
      // the maker's own DORI distance wins when the catalog has it; otherwise pixels per metre from the lens angle
      if (dd && p.dist_m && p.dist_m > 0) { dori = dd; if (dd < p.dist_m) fails.push("dori"); }
      else if (ppm != null) { if (ppm < needPpm) fails.push("ppm"); }
      else if (d.mpx < GOAL_MPX[(GOALS as readonly string[]).includes(p.goal) ? (p.goal as Goal) : "recognize"]) fails.push("mpx");
    } else fails.push("mpx");
    out.push({ device: d, ok: fails.length === 0, ppm, needPpm, sceneW, dori, fails });
  }
  // working devices first, the least over-specified first; otherwise the ones failing fewest rules
  out.sort((a, b) => (a.ok === b.ok ? (a.ok ? (a.ppm ?? 0) - (b.ppm ?? 0) : a.fails.length - b.fails.length) : a.ok ? -1 : 1));
  return out;
}

// ---- Stage 2: recorder, disks, switch and UPS for the cameras chosen in a project ----
const UNV_ID: [number, string][] = [[1, "720"], [2, "1080"], [3, "3mp"], [4, "4mp"], [5, "5mp"], [6, "6mp"], [8, "8mp"], [9, "9mp"], [12, "12mp"], [16, "16mp"]];
const DAHUA_ID: [number, string][] = [[1, "d720"], [2, "d1080"], [3, "d3"], [4, "d4"], [5, "d5"], [6, "d6"], [8, "d8"], [9, "d9"], [12, "d12"]];
const nearestId = (tbl: [number, string][], mpx: number) => tbl.reduce((a, b) => (Math.abs(b[0] - mpx) < Math.abs(a[0] - mpx) ? b : a))[1];
export const DISK_SIZES = [1, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24];

export type SysIn = { days: number; diskTb: number; raid: Raid; upsMin: number };
export type NvrPick = { device: CatDevice; ok: boolean; fails: string[] };
export type SysPlan = {
  cams: number; mbps: number; needTb: number; disks: number | null; nvr: NvrPick | null; nvrCount: number; fitDiskTb: number | null;
  poeCams: number; poeBudgetW: number; sw: CatDevice | null; swNeeded: boolean; swMissing: boolean; loadW: number; upsW: number; needAh24: number | null; usableWh: number;
};
export function planSystem(chosen: { device: CatDevice; qty: number }[], devices: CatDevice[], s: SysIn): SysPlan {
  const cams = chosen.filter((c) => c.device.kind === "camera");
  const total = cams.reduce((a, c) => a + c.qty, 0);
  let mbps = 0, needTb = 0;
  for (const c of cams) {
    const d = c.device, mpx = d.mpx ?? 4;
    const brand = d.brand === "dahua" ? "dahua" : "unv";
    const r = diskCalc({ brand, cameras: c.qty, res: brand === "unv" ? nearestId(UNV_ID, mpx) : nearestId(DAHUA_ID, mpx), codec: "h265", ucode: "adv", cx: "med", fps: 25, bitrate: null, mode: "cont", motionPct: 100, days: s.days, raid: "none", diskTb: s.diskTb, haveDisks: null, nvr: null });
    mbps += r.totalMbps; needTb += r.needTbReserve;
  }
  const disks = total ? disksFor(needTb, s.diskTb, s.raid) : null;
  // PoE
  const poeList = cams.filter((c) => c.device.poe_w != null);
  const poeCams = poeList.reduce((a, c) => a + c.qty, 0);
  const poeW = poeList.reduce((a, c) => a + (c.device.poe_w ?? 0) * c.qty, 0);
  const poeBudgetW = poeW * 1.2;
  // recorder: same brand as the cameras, smallest one that fits everything
  const brands = new Set(cams.map((c) => c.device.brand));
  const nvrs = devices.filter((d) => d.kind === "nvr" && (brands.size === 0 || brands.has(d.brand)));
  const check = (n: CatDevice): NvrPick => {
    const fails: string[] = [];
    if ((n.channels ?? 0) < total) fails.push("channels");
    if (disks != null && (n.bays ?? 0) < disks) fails.push("bays");
    if (n.max_tb_per_disk != null && n.max_tb_per_disk < s.diskTb) fails.push("diskSize");
    if (n.throughput_mbps != null && n.throughput_mbps < mbps) fails.push("bw");
    return { device: n, ok: fails.length === 0, fails };
  };
  const picks = nvrs.map(check).sort((a, b) => (a.ok === b.ok ? (a.ok ? (a.device.channels ?? 0) - (b.device.channels ?? 0) : a.fails.length - b.fails.length) : a.ok ? -1 : 1));
  const nvr = total ? picks[0] ?? null : null;
  // a disk size that makes the disks fit the recorder's bays
  let fitDiskTb: number | null = null;
  if (nvr && nvr.fails.includes("bays") && nvr.device.bays) {
    fitDiskTb = DISK_SIZES.find((sz) => sz <= (nvr.device.max_tb_per_disk ?? 24) && (disksFor(needTb, sz, s.raid) ?? 99) <= nvr.device.bays!) ?? null;
  }
  const nvrPoeOk = !!nvr && (nvr.device.poe_ports ?? 0) >= poeCams && (nvr.device.poe_budget_w == null || nvr.device.poe_budget_w >= poeBudgetW);
  const swNeeded = poeCams > 0 && !nvrPoeOk;
  const swList = devices.filter((d) => d.kind === "switch" && (d.poe_ports ?? 0) >= poeCams && (d.poe_budget_w == null || d.poe_budget_w >= poeBudgetW) && (brands.size === 0 || brands.has(d.brand) || true))
    .sort((a, b) => (a.poe_ports ?? 0) - (b.poe_ports ?? 0) || (a.poe_budget_w ?? 0) - (b.poe_budget_w ?? 0));
  const sw = swNeeded ? swList[0] ?? null : null;
  // UPS: cameras + recorder (25 W + 6 W per disk, estimate) + switch (10 W, estimate)
  const camW = cams.reduce((a, c) => a + (c.device.poe_w ?? 0) * c.qty, 0);
  const loadW = total ? camW + (nvr ? 25 + 6 * (disks ?? 0) : 0) + (sw || swNeeded ? 10 : 0) : 0;
  const usableWh = (loadW * s.upsMin) / 60;
  const needAh24 = loadW > 0 && s.upsMin > 0 ? usableWh / (0.85 * 0.8) / 24 : null;
  return { cams: total, mbps, needTb, disks, nvr, nvrCount: 1, fitDiskTb, poeCams, poeBudgetW, sw, swNeeded, swMissing: swNeeded && !sw, loadW, upsW: loadW * 1.25, needAh24, usableWh };
}
