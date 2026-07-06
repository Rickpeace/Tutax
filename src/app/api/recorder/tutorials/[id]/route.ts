import { type NextRequest, NextResponse } from "next/server";
import {
  accountForRecorderToken,
  bearerToken,
  RECORDER_ME_CORS,
} from "@/lib/recorder";
import { createAdminClient } from "@/lib/supabase/admin";

// Live-Führung (Welle 31), Schritt 1b: GET /api/recorder/tutorials/[id].
//
// Liefert ALLES, was die Extension für den Durchlauf EINES Tutorials braucht: Schritte
// (mit Rich-Text als HTML, signierter Screenshot-URL, Highlights, Selektor, Seiten-URL,
// Entscheidungs-Flag/Frage) und den Verzweigungs-Graph (Kanten mit Label = Antwort bzw.
// null = linear). AUTH wie /api/recorder/me (Bearer-Token, Admin-Client). 404, wenn das
// Tutorial nicht dem Token-Konto gehört. Bilder liegen im PRIVATEN Bucket -> signierte
// URLs (1 h) via Admin-Client, parallel signiert (kein Wasserfall). CORS: RECORDER_ME_CORS.

const IMAGE_BUCKET = "tutorial-images";
const SIGNED_URL_TTL = 3600; // 1 h

type TutorialRow = {
  id: string;
  account_id: string | null;
  title: string | null;
  slug: string | null;
  status: string | null;
  visibility: string | null;
  root_step_id: string | null;
};

type StepRow = {
  id: string;
  title: string | null;
  body: unknown;
  image_path: string | null;
  image_width: number | null;
  image_height: number | null;
  highlights: unknown;
  selector: unknown;
  page_url: string | null;
  is_decision: boolean | null;
  position: number;
};

type BranchRow = {
  id: string;
  step_id: string;
  label: string | null;
  target_step_id: string | null;
  position: number;
};

// ── Tiptap-JSON -> einfaches, sicheres HTML ─────────────────────────────────
// Die Extension rendert nur einfache Tags (b/i/ul/li/p/br) und escapt den Rest. Deshalb
// erzeugen wir hier bewusst NUR diese Tags: fremde Marks (underline/strike/code/link)
// werden als reiner Text ausgegeben, damit nichts als literaler Tag beim Nutzer landet.
// Text wird streng escaped. Robust gegen kaputtes/leeres body-JSON (-> leerer String).
type TNode = { type?: string; text?: string; content?: TNode[]; marks?: { type?: string }[] };

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function inlineHtml(nodes: TNode[] | undefined): string {
  if (!Array.isArray(nodes)) return "";
  let out = "";
  for (const n of nodes) {
    if (!n || typeof n !== "object") continue;
    if (n.type === "text") {
      let t = esc(String(n.text ?? ""));
      for (const m of n.marks ?? []) {
        if (m?.type === "bold") t = `<b>${t}</b>`;
        else if (m?.type === "italic") t = `<i>${t}</i>`;
        // underline/strike/code/link: als reiner Text (kein Tag) — die Extension würde
        // unbekannte Tags ohnehin escapen; so bleibt der Text lesbar statt „<u>…".
      }
      out += t;
    } else if (n.type === "hardBreak") {
      out += "<br>";
    } else if (n.content) {
      out += inlineHtml(n.content);
    }
  }
  return out;
}

// Inhalt eines <li>: Absätze inline (durch <br> getrennt), verschachtelte Listen als <ul>.
function listItemInner(nodes: TNode[] | undefined): string {
  if (!Array.isArray(nodes)) return "";
  const parts: string[] = [];
  for (const n of nodes) {
    if (!n || typeof n !== "object") continue;
    if (n.type === "bulletList" || n.type === "orderedList") {
      parts.push(`<ul>${blockHtml(n.content)}</ul>`);
    } else if (n.type === "listItem") {
      parts.push(`<li>${listItemInner(n.content)}</li>`);
    } else {
      parts.push(inlineHtml(n.content));
    }
  }
  return parts.filter(Boolean).join("<br>");
}

function blockHtml(nodes: TNode[] | undefined): string {
  if (!Array.isArray(nodes)) return "";
  let out = "";
  for (const n of nodes) {
    if (!n || typeof n !== "object") continue;
    switch (n.type) {
      case "paragraph":
        out += `<p>${inlineHtml(n.content)}</p>`;
        break;
      case "heading":
        // Überschriften als fetter Absatz (kein h2/h3 im Extension-Whitelist).
        out += `<p><b>${inlineHtml(n.content)}</b></p>`;
        break;
      case "bulletList":
      case "orderedList":
        out += `<ul>${blockHtml(n.content)}</ul>`;
        break;
      case "listItem":
        out += `<li>${listItemInner(n.content)}</li>`;
        break;
      case "hardBreak":
        out += "<br>";
        break;
      default:
        if (n.content) out += blockHtml(n.content);
    }
  }
  return out;
}

function tiptapToHtml(doc: unknown): string {
  if (!doc || typeof doc !== "object") return "";
  const content = (doc as TNode).content;
  if (!Array.isArray(content) || !content.length) return "";
  return blockHtml(content);
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: RECORDER_ME_CORS });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const token = bearerToken(req.headers.get("authorization"));
  const account = await accountForRecorderToken(token);
  if (!account) {
    return NextResponse.json(
      { error: "Ungültiger oder unbekannter Verbindungs-Token." },
      { status: 401, headers: RECORDER_ME_CORS },
    );
  }

  const admin = createAdminClient();

  const { data: tutorial } = await admin
    .from("tutorials")
    .select("id, account_id, title, slug, status, visibility, root_step_id")
    .eq("id", id)
    .maybeSingle<TutorialRow>();
  // 404 auch bei fremdem Konto (kein Existenz-Orakel für fremde Tutorials).
  if (!tutorial || tutorial.account_id !== account.id) {
    return NextResponse.json(
      { error: "Tutorial nicht gefunden." },
      { status: 404, headers: RECORDER_ME_CORS },
    );
  }

  const { data: stepsData } = await admin
    .from("steps")
    .select(
      "id, title, body, image_path, image_width, image_height, highlights, selector, page_url, is_decision, position",
    )
    .eq("tutorial_id", id)
    .order("position", { ascending: true })
    .returns<StepRow[]>();
  const steps = stepsData ?? [];
  const stepIds = steps.map((s) => s.id);

  const { data: branchesData } = stepIds.length
    ? await admin
        .from("step_branches")
        .select("id, step_id, label, target_step_id, position")
        .in("step_id", stepIds)
        .returns<BranchRow[]>()
    : { data: [] as BranchRow[] };
  const branches = branchesData ?? [];

  // Screenshots liegen im PRIVATEN Bucket -> signierte URLs (1 h), parallel (kein Wasserfall).
  const withImage = steps.filter((s) => s.image_path);
  const signed = await Promise.all(
    withImage.map((s) =>
      admin.storage.from(IMAGE_BUCKET).createSignedUrl(s.image_path as string, SIGNED_URL_TTL),
    ),
  );
  const urlByStep = new Map<string, string>();
  withImage.forEach((s, i) => {
    const u = signed[i].data?.signedUrl;
    if (u) urlByStep.set(s.id, u);
  });

  const outSteps = steps.map((s) => ({
    id: s.id,
    title: s.title ?? null,
    body: tiptapToHtml(s.body),
    imageUrl: urlByStep.get(s.id) ?? null,
    imageWidth: s.image_width ?? null,
    imageHeight: s.image_height ?? null,
    highlights: Array.isArray(s.highlights) ? s.highlights : [],
    selector: s.selector ?? null,
    page_url: s.page_url ?? null,
    is_decision: !!s.is_decision,
    // Kein eigenes question-Feld in der DB: bei Entscheidungen ist der Schritt-Titel die
    // Frage (so rendert es auch der Web-Viewer). Sonst null.
    question: s.is_decision ? (s.title ?? null) : null,
  }));

  const outBranches = branches.map((b) => ({
    id: b.id,
    step_id: b.step_id,
    label: b.label ?? null,
    target_step_id: b.target_step_id ?? null,
    position: Number(b.position) || 0,
  }));

  return NextResponse.json(
    {
      tutorial: {
        id: tutorial.id,
        title: tutorial.title ?? "",
        slug: tutorial.slug ?? null,
        status: tutorial.status ?? "draft",
        visibility: tutorial.visibility ?? null,
        root_step_id: tutorial.root_step_id ?? null,
      },
      steps: outSteps,
      branches: outBranches,
    },
    { status: 200, headers: RECORDER_ME_CORS },
  );
}
