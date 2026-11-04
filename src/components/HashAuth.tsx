"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";

// Handles the link from the default Supabase emails: the tokens arrive after the "#" in the address,
// which servers never see. Recovery link -> open "Create new password"; confirmation link -> back to sign in.
export default function HashAuth() {
  const router = useRouter();
  const [msg, setMsg] = useState("");
  useEffect(() => {
    const h = window.location.hash;
    if (!h || h.length < 2) return;
    const p = new URLSearchParams(h.slice(1));
    if (p.get("error")) {
      setMsg(p.get("error_code") === "otp_expired" ? "This link has expired or was already used. Request a new one." : (p.get("error_description") ?? "The link is not valid.").replace(/\+/g, " "));
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
      if (error) { setMsg("The link is invalid or expired. Request a new one."); return; }
      if (type === "recovery") { router.replace("/reset-password"); return; }
      await sb.auth.signOut();
      setMsg("Email confirmed. You can sign in now (new customers still need approval by the service center).");
    })();
  }, [router]);
  return msg ? <p className="err">{msg}</p> : null;
}
