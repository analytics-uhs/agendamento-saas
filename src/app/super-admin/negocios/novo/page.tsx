import { requirePlatformAdmin } from "@/lib/auth/platform-admin";
import { ProvisionBusinessForm } from "@/components/super-admin/provision-business-form";
import { PageHeader } from "@/components/ui/page-header";
export default async function NewBusinessPage() {
  await requirePlatformAdmin();
  return <><PageHeader title="Preparar novo negócio" description="Configure o negócio antes de convidar seu proprietário." /><ProvisionBusinessForm /></>;
}
