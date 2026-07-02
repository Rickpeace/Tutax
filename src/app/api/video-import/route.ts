import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { activeAccountId, getCurrentUser } from "@/lib/account";
import { safeFetch } from "@/lib/ssrf";

// Import per direktem Video-Link (MP4/WebM). Lädt selbst herunter (SSRF-geschützt),
// prüft Typ + Größe, legt Video im privaten Bucket ab und reiht einen video_job ein.
// Kann groß/langsam sein -> längeres Zeitbudget.
export const maxDuration = 120;

const MAX_BYTES = 200 * 1024 * 1024; // 200 MB

// content-type / URL-Endung -> Datei-Endung. Fallback mp4.
function pickExt(contentType: string, url: string): string {
  const ct = contentType.toLowerCase();
  if (ct.includes("webm")) return "webm";
  if (ct.includes("quicktime") || ct.includes("mov")) return "mov";
  if (ct.includes("x-matroska") || ct.includes("mkv")) return "mkv";
  if (ct.includes("mp4") || ct.includes("mpeg4")) return "mp4";
  const m = /\.([a-z0-9]{2,4})(?:[?#]|$)/i.exec(url);
  const fromUrl = m?.[1]?.toLowerCase();
  if (fromUrl && ["mp4", "webm", "mov", "mkv", "m4v"].includes(fromUrl)) return fromUrl;
  return "mp4";
}

// Titel aus Dateiname der URL ableiten (ohne Endung), sonst Host, sonst „Video".
function titleFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const last = decodeURIComponent(u.pathname.split("/").filter(Boolean).pop() || "");
    const name = last.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
    if (name) return name.slice(0, 120);
    return u.hostname.replace(/^www\./, "").slice(0, 120) || "Video";
  } catch {
    return "Video";
  }
}

const LINK_HINT =
  "Nur direkte Video-Links (MP4/WebM). Loom: über Teilen → Video herunterladen und hier hochladen.";

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });

  const active = await activeAccountId();
  if (!active) return NextResponse.json({ error: "Keine aktive Organisation" }, { status: 403 });
  const accountId = active.accountId;

  const body = await req.json().catch(() => ({}));
  let url = String(body?.url ?? "").trim();
  if (!url) return NextResponse.json({ error: "URL fehlt" }, { status: 400 });
  if (!/^https?:\/\//i.test(url)) url = "https://" + url;
  try {
    new URL(url);
  } catch {
    return NextResponse.json({ error: LINK_HINT }, { status: 400 });
  }

  // Herunterladen – safeFetch blockt interne/private Ziele (SSRF).
  let resp: Response;
  try {
    resp = await safeFetch(url, {
      signal: AbortSignal.timeout(90_000),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; TutaxBot/1.0)" },
    });
  } catch {
    return NextResponse.json(
      { error: "Der Link konnte nicht geladen werden (blockiert oder nicht erreichbar). " + LINK_HINT },
      { status: 400 },
    );
  }
  if (!resp.ok || !resp.body) {
    return NextResponse.json({ error: `Der Link antwortete mit Fehler ${resp.status}. ` + LINK_HINT }, { status: 400 });
  }

  // Typ prüfen: nur echte Videos oder octet-stream (viele CDNs liefern das für MP4).
  const contentType = (resp.headers.get("content-type") ?? "").toLowerCase();
  const typeOk = contentType.startsWith("video/") || contentType.includes("application/octet-stream") || contentType === "";
  if (!typeOk) {
    return NextResponse.json({ error: LINK_HINT }, { status: 400 });
  }

  // Größe vorab prüfen (content-length), sofern gemeldet.
  const declaredLen = Number(resp.headers.get("content-length") ?? "");
  if (Number.isFinite(declaredLen) && declaredLen > MAX_BYTES) {
    return NextResponse.json({ error: "Video ist zu groß (max. 200 MB)." }, { status: 400 });
  }

  // Streamen + beim Lesen bei 200 MB kappen (Server ohne content-length können lügen).
  let buf: Buffer;
  try {
    const chunks: Uint8Array[] = [];
    let total = 0;
    const reader = resp.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        total += value.byteLength;
        if (total > MAX_BYTES) {
          await reader.cancel().catch(() => {});
          return NextResponse.json({ error: "Video ist zu groß (max. 200 MB)." }, { status: 400 });
        }
        chunks.push(value);
      }
    }
    buf = Buffer.concat(chunks);
  } catch {
    return NextResponse.json({ error: "Das Video konnte nicht vollständig geladen werden. " + LINK_HINT }, { status: 400 });
  }
  if (buf.length < 1000) {
    return NextResponse.json({ error: "Der Link enthält kein gültiges Video. " + LINK_HINT }, { status: 400 });
  }

  const ext = pickExt(contentType, url);
  const vpath = `${accountId}/${crypto.randomUUID()}.${ext}`;
  const admin = createAdminClient();

  const { error: upErr } = await admin.storage
    .from("tutorial-videos")
    .upload(vpath, buf, { contentType: contentType.startsWith("video/") ? contentType : `video/${ext === "mov" ? "quicktime" : ext}`, upsert: false });
  if (upErr) {
    return NextResponse.json({ error: "Video konnte nicht gespeichert werden." }, { status: 500 });
  }

  const { data: job, error: jErr } = await admin
    .from("video_jobs")
    .insert({ account_id: accountId, video_path: vpath, title: titleFromUrl(url), status: "queued", created_by: user.id })
    .select("id")
    .single();
  if (jErr || !job) {
    // Verwaistes Video entfernen, wenn der Job nicht angelegt werden konnte.
    await admin.storage.from("tutorial-videos").remove([vpath]).catch(() => {});
    return NextResponse.json({ error: "Der Import-Auftrag konnte nicht angelegt werden." }, { status: 500 });
  }

  return NextResponse.json({ jobId: job.id });
}
