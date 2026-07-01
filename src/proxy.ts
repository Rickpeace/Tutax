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
     * - h/... : die ÖFFENTLICHE Hub/Viewer-Seite braucht keine Session (admin-Reads,
     *   Chat ist public) -> spart getUser bei jedem Endkunden-Besuch + dessen Prefetches.
     */
    "/((?!_next/static|_next/image|favicon.ico|h/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
