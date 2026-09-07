import { redirect } from "next/navigation";
import { requireBusinessModule } from "@/lib/auth/business-module";
export default async function PosPage() { await requireBusinessModule("management"); redirect("/admin/copa/venda-rapida"); }
