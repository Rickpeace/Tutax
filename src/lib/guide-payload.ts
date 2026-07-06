import "server-only";

// GETEILTER Payload-Bauer für die Führungs-Routen (Welle 31 + Welle 35):
//   • /api/recorder/tutorials/[id]  — Konto-Tutorials (Token-Auth, signierte Bild-URLs)
//   • /api/guide/steply(/[slug])    — öffentliche Steply-Doku (kein Auth, public Bild-URLs)
// Beide liefern DIESELBE Payload-FORM (tutorial/steps/branches; body = Whitelist-HTML). Damit
// der Tiptap→HTML-Konverter NICHT dupliziert wird, lebt er hier an EINER Stelle und wird von
// beiden Routen genutzt. Der einzige Unterschied ist die Bild-URL-Quelle (signiert vs. public)
// — deshalb bekommt buildGuidePayload eine fertige Map stepId→imageUrl übergeben.

// CORS für die ÖFFENTLICHE Doku-Route: reines GET/OPTIONS, KEINE Authorization-Pflicht (die
// Route ist ungeschützt und liest nur die öffentliche Steply-Doku). `Origin: *` ist unkritisch,
// weil kein Cookie/keine Session mitgeschickt wird (keine ambient authority). Spiegelt den
// Aufbau von RECORDER_ME_CORS, lässt aber den Authorization-Header weg.
export const GUIDE_PUBLIC_CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
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

export function tiptapToHtml(doc: unknown): string {
  if (!doc || typeof doc !== "object") return "";
  const content = (doc as TNode).content;
  if (!Array.isArray(content) || !content.length) return "";
  return blockHtml(content);
}

// ── Payload-Formen (identisch für beide Routen) ─────────────────────────────
export type GuideTutorialRow = {
  id: string;
  title: string | null;
  slug: string | null;
  status: string | null;
  visibility: string | null;
  root_step_id: string | null;
};

export type GuideStepRow = {
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

export type GuideBranchRow = {
  id: string;
  step_id: string;
  label: string | null;
  target_step_id: string | null;
  position: number;
};

export type GuidePayload = {
  tutorial: {
    id: string;
    title: string;
    slug: string | null;
    status: string;
    visibility: string | null;
    root_step_id: string | null;
  };
  steps: {
    id: string;
    title: string | null;
    body: string;
    imageUrl: string | null;
    imageWidth: number | null;
    imageHeight: number | null;
    highlights: unknown[];
    selector: unknown;
    page_url: string | null;
    is_decision: boolean;
    question: string | null;
  }[];
  branches: {
    id: string;
    step_id: string;
    label: string | null;
    target_step_id: string | null;
    position: number;
  }[];
};

/**
 * Baut die Führungs-Payload (tutorial/steps/branches). Die Bild-URL je Schritt kommt als
 * fertige Map herein — so bleibt DIESES Modul quellen-agnostisch: die Recorder-Route füllt
 * sie mit signierten URLs (privater Bucket), die öffentliche Doku-Route mit publicImageUrl.
 */
export function buildGuidePayload(
  tutorial: GuideTutorialRow,
  steps: GuideStepRow[],
  branches: GuideBranchRow[],
  imageUrlByStep: Map<string, string>,
): GuidePayload {
  return {
    tutorial: {
      id: tutorial.id,
      title: tutorial.title ?? "",
      slug: tutorial.slug ?? null,
      status: tutorial.status ?? "draft",
      visibility: tutorial.visibility ?? null,
      root_step_id: tutorial.root_step_id ?? null,
    },
    steps: steps.map((s) => ({
      id: s.id,
      title: s.title ?? null,
      body: tiptapToHtml(s.body),
      imageUrl: imageUrlByStep.get(s.id) ?? null,
      imageWidth: s.image_width ?? null,
      imageHeight: s.image_height ?? null,
      highlights: Array.isArray(s.highlights) ? s.highlights : [],
      selector: s.selector ?? null,
      page_url: s.page_url ?? null,
      is_decision: !!s.is_decision,
      // Kein eigenes question-Feld in der DB: bei Entscheidungen ist der Schritt-Titel die
      // Frage (so rendert es auch der Web-Viewer). Sonst null.
      question: s.is_decision ? (s.title ?? null) : null,
    })),
    branches: branches.map((b) => ({
      id: b.id,
      step_id: b.step_id,
      label: b.label ?? null,
      target_step_id: b.target_step_id ?? null,
      position: Number(b.position) || 0,
    })),
  };
}
