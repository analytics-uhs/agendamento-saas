import { AdminShell } from "@/components/admin/admin-shell";
import { redirect } from "next/navigation";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { getPalette } from "@/lib/palettes";
import { getBusinessConfiguration } from "@/lib/repositories/business-configuration";
import { getCurrentBusiness } from "@/lib/repositories/businesses";
import { isPlatformAdmin } from "@/lib/repositories/super-admin";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAuthenticatedUser();
  const [currentBusiness, platformAdmin] = await Promise.all([getCurrentBusiness(user.id), isPlatformAdmin()]);
  if (!currentBusiness) redirect("/onboarding");
  const configuration = await getBusinessConfiguration(currentBusiness.id);
  return <AdminShell currentBusiness={currentBusiness} platformAdmin={platformAdmin} logoUrl={configuration.logoUrl} palette={getPalette(configuration.paletteId)} initialTheme={configuration.themePreference}>{children}</AdminShell>;
}
