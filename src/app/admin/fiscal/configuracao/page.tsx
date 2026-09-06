import Link from "next/link";
import {PageHeader} from "@/components/ui/page-header";
import {Card} from "@/components/ui/card";
import {FiscalSettingsForm} from "@/components/admin/fiscal-settings-form";
import {getBusinessFiscalSettings} from "@/lib/repositories/fiscal";
export default async function FiscalSettingsPage() {
 const initial=await getBusinessFiscalSettings();
 return <><PageHeader title="Configuração fiscal" description="Cadastre os dados que serão usados na futura emissão de NFC-e." action={<Link className="focus-ring rounded-xl border px-4 py-3 text-sm" href="/admin/fiscal">Documentos fiscais</Link>}/><Card padding="md" className="mt-6"><FiscalSettingsForm initial={initial}/></Card></>;
}
