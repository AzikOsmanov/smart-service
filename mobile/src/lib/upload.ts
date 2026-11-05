import { Platform } from "react-native";
import { File } from "expo-file-system";
import { sb } from "@/lib/supabase";

export type Picked = { uri: string; name: string; mime: string; size?: number };

async function bytesOf(uri: string): Promise<ArrayBuffer> {
  if (Platform.OS === "web") return await (await fetch(uri)).arrayBuffer();
  return await new File(uri).arrayBuffer();
}
const uuid = () => "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (ch) => { const r = (Math.random() * 16) | 0; return (ch === "x" ? r : (r & 0x3) | 0x8).toString(16); });

export async function uploadTo(bucket: string, folder: string, f: Picked): Promise<{ key?: string; error?: string }> {
  const ext = (f.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "jpg";
  const key = `${folder}/${uuid()}.${ext}`;
  try {
    const body = await bytesOf(f.uri);
    const { error } = await sb.storage.from(bucket).upload(key, body, { contentType: f.mime });
    return error ? { error: error.message } : { key };
  } catch (e: any) { return { error: String(e?.message ?? e) }; }
}

export const TICKET_FILE_MAX = 25 * 1024 * 1024;
export async function uploadTicketFiles(tenantId: string, ticketId: string, userId: string, files: Picked[]): Promise<string[]> {
  const failed: string[] = [];
  for (const f of files) {
    if (f.size && f.size > TICKET_FILE_MAX) { failed.push(`${f.name} (> 25 MB)`); continue; }
    const up = await uploadTo("ticket-files", `${tenantId}/${ticketId}`, f);
    if (!up.key) { failed.push(f.name); continue; }
    const ins = await sb.from("ticket_attachments").insert({
      tenant_id: tenantId, ticket_id: ticketId, uploaded_by: userId, file_name: f.name.slice(0, 200), mime_type: f.mime, size_bytes: f.size ?? null,
      storage_key: up.key, kind: f.mime.startsWith("video/") ? "video" : f.mime === "application/pdf" ? "pdf" : "image",
    });
    if (ins.error) failed.push(f.name);
  }
  return failed;
}
