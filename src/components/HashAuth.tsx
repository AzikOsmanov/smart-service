"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";
import type { PortalLabels } from "@/lib/i18n-portal";

// Handles the link from the default Supabase emails: the tokens arrive after the "#" in the address,
// which servers never see. Recovery link -> open "Create new password"; confirmation link -> back to sign in.
export default function HashAuth({ L }: { L: PortalLabels }) {
  const router = useRouter();
  const [msg, setMsg] = useState("");
  useEffect(() => {
    const h = window.location.hash;
    if (!h || h.length < 2) return;
    const p = new URLSearchParams(h.slice(1));
    if (p.get("error")) {
      setMsg(p.get("error_code") === "otp_expired" ? L.linkExpired : L.linkInvalid);
      history.replaceState(null, "", window.location.pathname);
      return;
    }
    const access_token = p.get("access_token");
    const refresh_token = p.get("refresh_token");
    if (!access_token || !refresh_token) return;
    const type = p.get("type");
    history.replaceState(null, "", window.location.pathname);
    (async () => {
      const sb = supabaseBrowser();
      const { error } = await sb.auth.setSession({ access_token, refresh_token });
      if (error) { setMsg(L.linkInvalidShort); return; }
      if (type === "recovery") { router.replace("/reset-password"); return; }
      await sb.auth.signOut();
      setMsg(L.emailConfirmed);
    })();
  }, [router, L]);
  return msg ? <p className="err">{msg}</p> : null;
}
