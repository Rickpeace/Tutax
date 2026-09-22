import { NextResponse, type NextRequest } from "next/server";

// TEMPORÄR (Diagnose 22.09.2026, wird wieder entfernt): Lädt die Module, an denen die
// Server-Aktionen unter /app hängen, und meldet Lade-Fehler. Nur mit Einmal-Schlüssel.
export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get("k") !== "1063786fc6d70f5fd4b6f30f0e6dfdb1") return new NextResponse(null, { status: 404 });
  const out: Record<string, string> = { node: process.version, platform: process.platform + "/" + process.arch };
  const tryLoad = async (name: string, fn: () => Promise<unknown>) => {
    try {
      await fn();
      out[name] = "ok";
    } catch (e) {
      out[name] = "FEHLER: " + (e instanceof Error ? e.message + " | " + (e.stack ?? "").split("\n").slice(1, 4).join(" / ") : String(e));
    }
  };
  await tryLoad("sharp", () => import("sharp"));
  await tryLoad("lib/redact", () => import("@/lib/redact"));
  await tryLoad("lib/tts", () => import("@/lib/tts"));
  await tryLoad("lib/kb", () => import("@/lib/kb"));
  await tryLoad("lib/translate-jobs", () => import("@/lib/translate-jobs"));
  await tryLoad("app/app/actions", () => import("@/app/app/actions"));
  await tryLoad("app/app/account-actions", () => import("@/app/app/account-actions"));
  await tryLoad("settings/branding/actions", () => import("@/app/app/settings/branding/actions"));
  await tryLoad("tutorials/[id]/actions", () => import("@/app/app/tutorials/[id]/actions"));
  await tryLoad("search-actions", () => import("@/app/app/search-actions"));
  return NextResponse.json(out);
}
