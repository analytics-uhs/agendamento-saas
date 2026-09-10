import Link from "next/link";
import { notFound } from "next/navigation";
import { requireConfigurationBusiness } from "@/lib/auth/configuration-business";
import { getBusinessConfiguration } from "@/lib/repositories/business-configuration";
import { BusinessPageContent } from "@/components/admin/business-page";
import { ScheduleConfiguration } from "@/components/admin/schedule-configuration";
import { BusinessHours } from "@/components/admin/business-hours";
import { AppearancePageContent } from "@/components/admin/appearance-page";
export default async function ConfigureBusinessPage({ params, searchParams }: { params: Promise<{ businessId: string }>; searchParams: Promise<{ section?: string }> }) {
  const { businessId } = await params;
  const business = await requireConfigurationBusiness(businessId);
  const configuration = await getBusinessConfiguration(business.id);
  const section = (await searchParams).section ?? "negocio";
  const sections = { negocio: "Meu negócio", agenda: "Configuração da agenda", horarios: "Horários", aparencia: "Aparência" };
  if (!Object.hasOwn(sections, section)) notFound();
  return <><div className="mb-6 space-y-3 border-b pb-4"><p className="font-medium">Configurando {business.name} como Super Admin</p><p className="text-sm text-muted">Sua identidade permanece a mesma. Este modo não cria vínculo de membro.</p><Link className="focus-ring inline-flex min-h-11 items-center rounded text-primary" href={`/super-admin/negocios/${businessId}`}>Voltar ao negócio</Link><nav aria-label="Configuração assistida" className="flex flex-wrap gap-2">{Object.entries(sections).map(([key,label]) => <Link key={key} aria-current={key===section ? "page" : undefined} className={`focus-ring inline-flex min-h-11 items-center rounded-lg border px-3 text-sm ${key===section ? "bg-primary text-white" : "bg-background"}`} href={`?section=${key}`}>{label}</Link>)}</nav></div>
    {section === "negocio" && <BusinessPageContent key={businessId} initialBusiness={configuration} platformBusinessId={businessId} />}
    {section === "agenda" && <ScheduleConfiguration key={businessId} initialBusiness={configuration} platformBusinessId={businessId} />}
    {section === "horarios" && <BusinessHours key={businessId} initialHours={configuration.hours} initialNotice={configuration.minimumBookingNoticeMinutes} initialStartOrder={configuration.publicBookingStartOrder} platformBusinessId={businessId} />}
    {section === "aparencia" && <AppearancePageContent key={businessId} initialBusiness={configuration} platformBusinessId={businessId} />}
  </>;
}
