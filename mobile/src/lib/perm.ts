import { useEffect, useState } from "react";
import { sb } from "@/lib/supabase";

// Reads menu permissions (view/edit/delete) from the server; null while loading.
export function usePerms(codes: string[]): Record<string, boolean> | null {
  const [p, setP] = useState<Record<string, boolean> | null>(null);
  const key = codes.join(",");
  useEffect(() => {
    let alive = true;
    Promise.all(codes.map((c) => sb.rpc("has_permission", { p_code: c }))).then((rs) => {
      if (alive) setP(Object.fromEntries(codes.map((c, i) => [c, rs[i].data === true])));
    });
    return () => { alive = false; };
  }, [key]);
  return p;
}
