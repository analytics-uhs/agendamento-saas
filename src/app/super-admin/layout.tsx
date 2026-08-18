import { SuperAdminShell } from "@/components/super-admin/super-admin-shell";
import { requirePlatformAdmin } from "@/lib/auth/platform-admin";

export default async function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  await requirePlatformAdmin();
  return <SuperAdminShell>{children}</SuperAdminShell>;
}
