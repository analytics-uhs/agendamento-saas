import { AdminShell } from "@/components/admin/admin-shell";
import { redirect } from "next/navigation";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { getPalette } from "@/lib/palettes";
import { getBusinessConfiguration } from "@/lib/repositories/business-configuration";
import { getCurrentBusiness } from "@/lib/repositories/businesses";
import { isPlatformAdmin } from "@/lib/repositories/super-admin";
import { getOwnProfile } from "@/lib/repositories/profiles";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAuthenticatedUser();
  const [currentBusiness, platformAdmin, profile] = await Promise.all([getCurrentBusiness(user.id), isPlatformAdmin(), getOwnProfile(user.id)]);
  if (!currentBusiness) redirect("/onboarding");
  const configuration = await getBusinessConfiguration(currentBusiness.id);
  const email = user.email ?? "Usuário autenticado";
  return <AdminShell currentBusiness={currentBusiness} platformAdmin={platformAdmin} logoUrl={configuration.logoUrl} palette={getPalette(configuration.paletteId)} initialTheme={configuration.themePreference} user={{ name: profile?.name?.trim() || email.split("@")[0], email }}>{children}</AdminShell>;
}
