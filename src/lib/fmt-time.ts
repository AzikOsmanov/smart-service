// All times are shown in the service center's time zone (Azerbaijan, UTC+4), whatever the server's or browser's clock says.
const TZ = "Asia/Baku";
export const fmtDT = (v: string | number | Date) =>
  new Date(v).toLocaleString("en-GB", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).replace(",", "");
export const fmtD = (v: string | number | Date) =>
  new Date(v).toLocaleDateString("en-GB", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric" });
