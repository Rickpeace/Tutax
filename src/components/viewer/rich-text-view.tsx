import { Fragment, type ReactNode } from "react";

type Mark = { type: string; attrs?: Record<string, unknown> };
type Node = {
  type: string;
  content?: Node[];
  text?: string;
  marks?: Mark[];
  attrs?: Record<string, unknown>;
};

/** Nur echte http/https-Links durchlassen (javascript:/data: etc. verwerfen). */
function safeHref(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const u = new URL(trimmed);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.href;
  } catch {
    return null;
  }
}

/** Rendert Tiptap-JSON read-only (ohne Editor). */
export function RichTextView({ doc }: { doc: unknown }) {
  if (!doc || typeof doc !== "object") return null;
  const content = (doc as Node).content ?? [];
  if (!content.length) return null;
  return <div className="space-y-2 leading-relaxed">{renderList(content)}</div>;
}

function renderList(nodes: Node[]): ReactNode {
  return nodes.map((n, i) => <Fragment key={i}>{renderNode(n)}</Fragment>);
}

function renderNode(n: Node): ReactNode {
  switch (n.type) {
    case "paragraph":
      return <p>{renderList(n.content ?? [])}</p>;
    case "heading": {
      const lvl = Number(n.attrs?.level ?? 3);
      const Tag = (`h${Math.min(4, Math.max(2, lvl))}` as "h2" | "h3" | "h4");
      return <Tag className="font-bold">{renderList(n.content ?? [])}</Tag>;
    }
    case "bulletList":
      return <ul className="list-disc space-y-1 pl-5">{renderList(n.content ?? [])}</ul>;
    case "orderedList":
      return <ol className="list-decimal space-y-1 pl-5">{renderList(n.content ?? [])}</ol>;
    case "listItem":
      return <li>{renderList(n.content ?? [])}</li>;
    case "hardBreak":
      return <br />;
    case "text": {
      let el: ReactNode = n.text ?? "";
      for (const m of n.marks ?? []) {
        if (m.type === "bold") el = <strong>{el}</strong>;
        else if (m.type === "italic") el = <em>{el}</em>;
        else if (m.type === "underline") el = <u>{el}</u>;
        else if (m.type === "strike") el = <s>{el}</s>;
        else if (m.type === "code") el = <code className="rounded bg-black/5 px-1">{el}</code>;
        else if (m.type === "link") {
          const href = safeHref(m.attrs?.href);
          // Nur mit sicherer http(s)-URL als Link rendern; sonst nur den Text zeigen.
          if (href)
            el = (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="underline underline-offset-2 hover:opacity-80"
              >
                {el}
              </a>
            );
        }
      }
      return el;
    }
    default:
      return n.content ? renderList(n.content) : null;
  }
}
