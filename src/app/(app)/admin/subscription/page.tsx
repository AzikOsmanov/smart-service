import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { getStaff } from "@/lib/i18n-staff";
import SubscriptionPanel from "@/components/SubscriptionPanel";

export default async function Subscription() {
  const sb = await supabaseServer();
  const { data } = await sb.rpc("is_tenant_admin");
  if (data !== true) notFound();
  const { S } = await getStaff();
  return (
    <div>
      <h1>{S.subTitle}</h1>
      <SubscriptionPanel />
    </div>
  );
}
