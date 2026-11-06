import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

type C = { name: string; value: string; options: CookieOptions };

export async function middleware(req: NextRequest) {
  let res = NextResponse.next({ request: req });
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (list: C[]) => {
        list.forEach(({ name, value }) => req.cookies.set(name, value));
        res = NextResponse.next({ request: req });
        list.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
      },
    },
  });
  const { data } = await supabase.auth.getUser();
  const path = req.nextUrl.pathname;
  const open = path.startsWith("/login") || path.startsWith("/register") || path.startsWith("/forgot");
  if (path.startsWith("/auth/") || path.startsWith("/api/cron/") || path.startsWith("/api/webhooks/") || path.startsWith("/api/mobile/") || path.startsWith("/api/push/")) return res;   // these check their own secret/signature
  // Session length: a sign-in older than the limit set by the administrator ends here.
  const exp = Number(req.cookies.get("ss_exp")?.value ?? 0);
  if (data.user && exp > 0 && Date.now() > exp) {
    await supabase.auth.signOut();
    const r = NextResponse.redirect(new URL("/login?e=session", req.url));
    res.cookies.getAll().forEach((c) => r.cookies.set(c));
    r.cookies.delete("ss_exp");
    return r;
  }
  // Inactivity: the browser reports real activity to /api/activity (the online heartbeat does not count); a session idle for longer ends here.
  const idleMin = Number(req.cookies.get("ss_idle")?.value ?? 0);
  const act = Number(req.cookies.get("ss_act")?.value ?? 0);
  if (data.user && idleMin > 0 && act > 0 && Date.now() - act > (idleMin + 1) * 60000) {
    await supabase.auth.signOut();
    const r = NextResponse.redirect(new URL("/login?e=idle", req.url));
    res.cookies.getAll().forEach((c) => r.cookies.set(c));
    r.cookies.delete("ss_exp"); r.cookies.delete("ss_idle"); r.cookies.delete("ss_act");
    r.headers.set("Cache-Control", "no-store");
    return r;
  }
  if (data.user) {
    const activity = path === "/api/activity" || (req.method === "GET" && !req.headers.get("next-router-prefetch") && !path.startsWith("/api/"));
    if (idleMin > 0 && (activity || !act)) res.cookies.set("ss_act", String(Date.now()), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
    res.headers.set("Cache-Control", "no-store");   // signed-in pages are never kept in the browser cache
  }
  // Two-step login: a person who has it switched on must pass the code check before anything else.
  if (data.user && !path.startsWith("/mfa")) {
    const verified = (data.user.factors ?? []).some((f) => f.status === "verified" && f.factor_type === "totp");
    if (verified) {
      const { data: s } = await supabase.auth.getSession();
      let aal = "aal1";
      try { aal = JSON.parse(atob((s.session?.access_token ?? "").split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).aal ?? "aal1"; } catch { /* treated as aal1 */ }
      if (aal !== "aal2") {
        if (path.startsWith("/api/")) return new NextResponse(null, { status: 401 });
        const r = NextResponse.redirect(new URL("/mfa/verify", req.url));
        res.cookies.getAll().forEach((c) => r.cookies.set(c));
        return r;
      }
    }
  }
  if (!data.user && !open) return NextResponse.redirect(new URL("/login", req.url));
  if (data.user && open) return NextResponse.redirect(new URL("/dashboard", req.url));
  return res;
}
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
