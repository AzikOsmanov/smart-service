import EditPersonView from "@/app/(app)/admin/edit/[id]/EditPersonView";
import EditDialog from "@/components/EditDialog";
import { supabaseAdmin } from "@/lib/supabase-admin";

// Opened from the Staff users / Customers lists as a pop-up window on top of the list (a direct link still opens the full page).
export default async function EditPopup({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; ok?: string }> }) {
  const { id } = await params;
  const { error, ok } = await searchParams;
  const { data: u } = await supabaseAdmin().from("users").select("kind").eq("id", id).maybeSingle();
  return <EditDialog backHref={u?.kind === "customer" ? "/customers" : "/admin/users"}><EditPersonView id={id} error={error} ok={ok} popup /></EditDialog>;
}
