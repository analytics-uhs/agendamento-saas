import { LoaderCircle } from "lucide-react";

export default function PublicBookingLoading() {
  return <main className="grid min-h-screen place-items-center bg-surface"><p className="flex items-center gap-2 text-sm text-muted"><LoaderCircle className="h-4 w-4 animate-spin" />Carregando agenda...</p></main>;
}
