import { CopaHome } from "@/components/admin/copa-home";
import { getCopa } from "@/lib/repositories/copa";
export default async function CopaPage() { return <CopaHome {...await getCopa()} />; }
