import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy-session";

// Next.js 16: ehemals middleware.ts. Hält die Supabase-Session frisch
// und schützt /app optimistisch (echte Autorisierung passiert via RLS + Server-Checks).
export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Auf alle Pfade außer:
     * - _next/static, _next/image
     * - favicon, Bilder (statische Assets)
     * Die öffentliche Hub/Viewer (/h/...) läuft mit durch (Session optional, kein Schutz).
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
