import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAccount } from "@/lib/account";
import { aiConfigured } from "@/lib/ai";
import { textToDraftArticles } from "@/lib/kb-import";

// Datei-Extraktion (PDF via pdf.js) + ein KI-Call können über den Default laufen.
export const maxDuration = 60;

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_TEXT_CHARS = 60_000;

// PDF: erste Bytes müssen %PDF sein — sonst „kaputt/kein PDF“ statt kryptischem Parser-Fehler.
function looksLikePdf(buf: Uint8Array): boolean {
  return buf.length > 4 && buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46;
}

/**
 * Dokumenten-Import für die Wissensdatenbank: nimmt eine Datei (PDF/DOCX/TXT/MD),
 * extrahiert Klartext und legt daraus KI-Wissens-ENTWÜRFE an (nie auto-publish).
 */
export async function POST(req: NextRequest) {
  // requireAccount() macht /login-Redirect bei fehlender Auth — für eine API-Route wollen
  // wir sauberes 401/403 statt eines Redirects. Deshalb selbst prüfen und Redirect abfangen.
  let account: { id: string };
  try {
    ({ account } = await requireAccount());
  } catch {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }
  if (!account?.id) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });

  if (!aiConfigured()) {
    return NextResponse.json({ error: "Die KI ist nicht aktiviert (OPENAI_API_KEY fehlt)." }, { status: 400 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Keine Datei übermittelt." }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "Die Datei ist leer." }, { status: 400 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: "Die Datei ist zu groß (max. 10 MB)." }, { status: 400 });
  }

  const name = file.name || "Dokument";
  const lower = name.toLowerCase();
  const type = (file.type || "").toLowerCase();
  const buf = new Uint8Array(await file.arrayBuffer());

  // Text je nach Dateityp extrahieren.
  let text = "";
  try {
    if (lower.endsWith(".pdf") || type.includes("pdf")) {
      if (!looksLikePdf(buf)) {
        return NextResponse.json({ error: "Die PDF-Datei ist beschädigt oder kein gültiges PDF." }, { status: 400 });
      }
      const { extractText, getDocumentProxy } = await import("unpdf");
      const pdf = await getDocumentProxy(buf);
      const { text: pdfText } = await extractText(pdf, { mergePages: true });
      text = Array.isArray(pdfText) ? pdfText.join("\n") : pdfText;
    } else if (lower.endsWith(".docx") || type.includes("officedocument.wordprocessingml")) {
      const mammothNs = await import("mammoth");
      const mammoth = mammothNs.default ?? mammothNs;
      const res = await mammoth.extractRawText({ buffer: Buffer.from(buf) });
      text = res.value ?? "";
    } else if (lower.endsWith(".txt") || lower.endsWith(".md") || type.startsWith("text/")) {
      text = new TextDecoder("utf-8", { fatal: false }).decode(buf);
    } else {
      return NextResponse.json(
        { error: "Nicht unterstützter Dateityp. Erlaubt sind PDF, DOCX, TXT und MD." },
        { status: 400 },
      );
    }
  } catch (e) {
    console.error("[kb-import] Extraktion fehlgeschlagen:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Der Text konnte aus der Datei nicht gelesen werden." }, { status: 400 });
  }

  text = text.trim();
  if (text.length < 50) {
    return NextResponse.json(
      { error: "Das Dokument enthält keinen lesbaren Text — ist es ein Scan?" },
      { status: 422 },
    );
  }
  text = text.slice(0, MAX_TEXT_CHARS);

  try {
    const result = await textToDraftArticles(createAdminClient(), account.id, name, text);
    revalidatePath("/app/assistent/wissen");
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Import fehlgeschlagen." },
      { status: 500 },
    );
  }
}
