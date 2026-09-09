import { pendingInviteToken } from "@/lib/auth/invite-session";
import { inspectBusinessInvite } from "@/lib/repositories/business-invites";
import { createClient } from "@/lib/supabase/server";
import { BusinessInviteView } from "@/components/auth/business-invite-view";
export default async function InvitePage() {
  const token = await pendingInviteToken();
  const invite = await inspectBusinessInvite(token);
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return <BusinessInviteView invite={invite} authenticated={Boolean(data.user)} entryToken={data.user ? undefined : token ?? undefined} />;
}
