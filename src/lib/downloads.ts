import type { SupabaseClient } from "@supabase/supabase-js";

// Links that save the file under its own name (for phone photos/videos this is "<serial number>_<date-time>.jpg"),
// not the random storage name.
export async function downloadUrls(sb: SupabaseClient, bucket: string, items: { path: string; name: string }[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  await Promise.all(items.map(async (i) => {
    const { data } = await sb.storage.from(bucket).createSignedUrl(i.path, 3600, { download: i.name });
    if (data?.signedUrl) out.set(i.path, data.signedUrl);
  }));
  return out;
}
