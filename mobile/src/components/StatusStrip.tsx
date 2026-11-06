import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { sb } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { usePrefs } from "@/lib/prefs";

let cachedBrand: string | null = null;

// Thin bar under the header on every screen: who is signed in, the live clock, the company name (set by the administrator on the website) and "Powered by infraneuro".
export default function StatusStrip() {
  const { c } = usePrefs();
  const { session, profile } = useAuth();
  const [now, setNow] = useState(new Date());
  const [brand, setBrand] = useState(cachedBrand ?? "Acom Smart Service");
  useEffect(() => { const id = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(id); }, []);
  useEffect(() => {
    if (!session) return;
    sb.rpc("get_brand_name").then(({ data }) => { if (typeof data === "string" && data) { cachedBrand = data; setBrand(data); } });
  }, [session?.user.id]);
  if (!session) return null;
  const name = `${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim() || session.user.email || "";
  const date = now.toLocaleDateString([], { day: "2-digit", month: "short", year: "numeric" });
  const time = now.toLocaleTimeString([], { hour12: false });
  return (
    <View style={{ paddingHorizontal: 16, paddingVertical: 6, backgroundColor: c.card, borderBottomWidth: 1, borderBottomColor: c.border }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
        <Text numberOfLines={1} style={{ color: c.fg, fontSize: 13, fontWeight: "600", flexShrink: 1 }}>{name}</Text>
        <Text style={{ color: c.fg, fontSize: 13 }}>{date} · {time}</Text>
      </View>
      <Text numberOfLines={1} style={{ color: c.muted, fontSize: 11 }}>{brand} · Powered by infraneuro</Text>
    </View>
  );
}
