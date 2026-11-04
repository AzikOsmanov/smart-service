import { createServerClient } from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

type C = { name: string; value: string; options: CookieOptions };

export async function supabaseServer() {
  const store = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list: C[]) => {
        try { list.forEach(({ name, value, options }) => store.set(name, value, options)); } catch {}
      },
    },
  });
}
