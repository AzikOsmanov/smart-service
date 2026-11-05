// Dev helper: screenshots of the web build of the app (used to check layouts). Not part of the app.
// usage: node shot.mjs <baseUrl> <outDir> [email] [password]
import { chromium } from "playwright";
const [base, out, email, password] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
const snap = async (name) => { await page.waitForTimeout(2500); await page.screenshot({ path: `${out}/${name}.png` }); };
await page.goto(base, { waitUntil: "networkidle" });
await snap("01-login");
if (email && password) {
  await page.getByPlaceholder("").first().fill(email).catch(() => {});
  const inputs = page.locator("input");
  await inputs.nth(0).fill(email);
  await inputs.nth(1).fill(password);
  await page.getByRole("button").first().click();
  await snap("02-tickets");
  const first = page.locator("text=/^#\\d+/").first();
  if (await first.count()) { await first.click(); await snap("03-ticket"); await page.goBack(); }
  await page.goto(base + "/tickets/new", { waitUntil: "networkidle" }); await snap("04-new");
  await page.goto(base + "/notifications", { waitUntil: "networkidle" }); await snap("05-notifications");
  await page.goto(base + "/settings", { waitUntil: "networkidle" }); await snap("06-settings");
}
console.log(JSON.stringify(errors.slice(0, 20), null, 1));
await browser.close();
