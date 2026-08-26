import { NextResponse, type NextRequest } from "next/server";
import { resolveUserDestination } from "@/lib/auth/destination";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data.user) {
      const destination = await resolveUserDestination(data.user.id);
      return NextResponse.redirect(new URL(destination, request.url));
    }
  }

  return NextResponse.redirect(new URL("/login?error=auth_callback", request.url));
}
