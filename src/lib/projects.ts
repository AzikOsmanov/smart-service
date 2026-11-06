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
};
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

export type Match = { device: CatDevice; ok: boolean; ppm: number | null; needPpm: number; sceneW: number | null; fails: string[] };

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
    if (p.night_m && p.night_m > 0 && p.night_type !== "color" && (d.ir_range_m ?? 0) < p.night_m) fails.push("nightRange");
    let ppm: number | null = null, sceneW: number | null = null;
    if (d.mpx) {
      const px = hPixels(d.mpx), fov = hfov(d);
      if (p.min_mpx && d.mpx < p.min_mpx) fails.push("mpx");
      if (p.dist_m && p.dist_m > 0 && fov) {
        sceneW = 2 * p.dist_m * Math.tan((fov * Math.PI) / 360);
        if (p.width_m && p.width_m > 0 && sceneW < p.width_m * 0.95) fails.push("fov");
        ppm = px / sceneW;
      } else if (p.width_m && p.width_m > 0) { sceneW = p.width_m; ppm = px / p.width_m; }
      if (ppm != null) { if (ppm < needPpm) fails.push("ppm"); }
      else if (d.mpx < GOAL_MPX[(GOALS as readonly string[]).includes(p.goal) ? (p.goal as Goal) : "recognize"]) fails.push("mpx");
    } else fails.push("mpx");
    out.push({ device: d, ok: fails.length === 0, ppm, needPpm, sceneW, fails });
  }
  // working devices first, the least over-specified first; otherwise the ones failing fewest rules
  out.sort((a, b) => (a.ok === b.ok ? (a.ok ? (a.ppm ?? 0) - (b.ppm ?? 0) : a.fails.length - b.fails.length) : a.ok ? -1 : 1));
  return out;
}
