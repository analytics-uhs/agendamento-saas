import { AdminShell } from "@/components/admin/admin-shell";
import { redirect } from "next/navigation";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { getPalette } from "@/lib/palettes";
import { getBusinessConfiguration } from "@/lib/repositories/business-configuration";
import { getCurrentBusiness } from "@/lib/repositories/businesses";
import { isPlatformAdmin } from "@/lib/repositories/super-admin";
import { getOwnProfile } from "@/lib/repositories/profiles";
import { getAdminNotificationFeed } from "@/lib/repositories/admin-notifications";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAuthenticatedUser();
  const [currentBusiness, platformAdmin, profile] = await Promise.all([getCurrentBusiness(user.id), isPlatformAdmin(), getOwnProfile(user.id)]);
  if (!currentBusiness) redirect("/onboarding");
  const [configuration, notificationFeed] = await Promise.all([
    getBusinessConfiguration(currentBusiness.id),
    getAdminNotificationFeed(currentBusiness.id),
  ]);
  const email = user.email ?? "Usuário autenticado";
  return <AdminShell currentBusiness={currentBusiness} platformAdmin={platformAdmin} logoUrl={configuration.logoUrl} palette={getPalette(configuration.paletteId)} initialTheme={configuration.themePreference} notificationFeed={notificationFeed} vapidPublicKey={process.env.VAPID_PUBLIC_KEY ?? null} user={{ id: user.id, name: profile?.name?.trim() || email.split("@")[0], email }}>{children}</AdminShell>;
}
