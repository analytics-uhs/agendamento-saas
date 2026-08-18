import { AdminShell } from "@/components/admin/admin-shell";
import { redirect } from "next/navigation";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { getCurrentBusiness } from "@/lib/repositories/businesses";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAuthenticatedUser();
  const currentBusiness = await getCurrentBusiness(user.id);
  if (!currentBusiness) redirect("/onboarding");
  return <AdminShell currentBusiness={currentBusiness}>{children}</AdminShell>;
}
