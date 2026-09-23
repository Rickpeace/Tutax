import { type NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";
import { createClient } from "@/lib/supabase/server";
import { appBaseUrl } from "@/lib/url";

/**
 * QR-Code-Generator (REVIEW H6): erzeugt einen QR-Code als PNG.
 * Bewusst KEIN offener Generator:
 *  - nur eingeloggte Nutzer (getUser-Guard),
 *  - nur URLs, die auf die eigene Hilfe-Seite zeigen (appBaseUrl()+"/h/").
 * So kann die Route nicht als kostenloser QR-Dienst / Redirect-Verschleierer
 * missbraucht werden.
 */
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });

  const url = req.nextUrl.searchParams.get("url")?.trim() ?? "";
  // Erlaubt: die konfigurierte App-Adresse ODER die Adresse, unter der die App gerade läuft.
  // Die Bibliothek baut den QR-Link aus window.location.origin — lief die App unter einer
  // anderen Adresse als NEXT_PUBLIC_APP_URL (Vorschau-Deploy, zweite Domain, lokal), bekam
  // „QR-Code öffnen“ nur eine rohe JSON-Fehlermeldung. Beides zeigt auf die eigene /h/-Seite.
  const allowedPrefixes = [`${appBaseUrl()}/h/`, `${req.nextUrl.origin}/h/`];
  if (!url || !allowedPrefixes.some((p) => url.startsWith(p))) {
    return NextResponse.json({ error: "Nur Hilfe-Seiten-Links erlaubt." }, { status: 400 });
  }

  try {
    const png = await QRCode.toBuffer(url, { width: 512, margin: 2 });
    return new NextResponse(new Uint8Array(png), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (e) {
    console.error("[api/qr] Fehler:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "QR-Code konnte nicht erzeugt werden." }, { status: 500 });
  }
}
