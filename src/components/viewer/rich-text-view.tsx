import { Fragment, type ReactNode } from "react";

type Node = {
  type: string;
  content?: Node[];
  text?: string;
  marks?: { type: string }[];
  attrs?: Record<string, unknown>;
};

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
        else if (m.type === "code") el = <code className="rounded bg-black/5 px-1">{el}</code>;
      }
      return el;
    }
    default:
      return n.content ? renderList(n.content) : null;
  }
}
