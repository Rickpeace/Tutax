"use client";

import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Bold, Italic, List, ListOrdered, Link2, Link2Off } from "lucide-react";

/** Nur echte http/https-Links zulassen (javascript:/data: etc. verwerfen). */
function safeHttpUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // Ohne Schema -> https:// annehmen (der Kunde tippt „example.com").
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const u = new URL(withScheme);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.href;
  } catch {
    return null;
  }
}

/** Tiptap-Rich-Text für Erklärtexte (§7, body = Tiptap-JSON). */
export function RichText({
  value,
  onChange,
}: {
  value: unknown;
  onChange: (json: unknown) => void;
}) {
  const editor = useEditor({
    // StarterKit v3 enthält Link/Underline/Strike bereits; Link auf http/https begrenzen
    // und beim Klick im Editor nicht öffnen (stört das Bearbeiten).
    extensions: [
      StarterKit.configure({
        link: {
          openOnClick: false,
          autolink: true,
          protocols: ["http", "https"],
          HTMLAttributes: { rel: "noopener noreferrer nofollow", target: "_blank" },
        },
      }),
    ],
    content: (value as object | string) || "",
    immediatelyRender: false, // Next.js SSR
    editorProps: {
      attributes: {
        class:
          "min-h-[90px] px-3 py-2 text-sm leading-relaxed text-ink-2 focus:outline-none [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_a]:text-primary [&_a]:underline",
      },
    },
    onUpdate: ({ editor }) => onChange(editor.getJSON()),
  });

  if (!editor) return null;

  const linkActive = editor.isActive("link");
  function setLink() {
    if (!editor) return;
    if (linkActive) {
      editor.chain().focus().unsetLink().run();
      return;
    }
    const prev = (editor.getAttributes("link").href as string) || "";
    const input = window.prompt("Link-Adresse (URL):", prev);
    if (input === null) return; // Abbrechen
    if (!input.trim()) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    const url = safeHttpUrl(input);
    if (!url) {
      window.alert("Bitte eine gültige http(s)-Adresse angeben.");
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex items-center gap-0.5 border-b border-line-2 px-1 py-1">
        <ToolBtn editor={editor} active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}>
          <Bold className="size-4" />
        </ToolBtn>
        <ToolBtn editor={editor} active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}>
          <Italic className="size-4" />
        </ToolBtn>
        <ToolBtn editor={editor} active={linkActive} onClick={setLink} title={linkActive ? "Link entfernen" : "Link einfügen"}>
          {linkActive ? <Link2Off className="size-4" /> : <Link2 className="size-4" />}
        </ToolBtn>
        <ToolBtn editor={editor} active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}>
          <List className="size-4" />
        </ToolBtn>
        <ToolBtn editor={editor} active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
          <ListOrdered className="size-4" />
        </ToolBtn>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}

function ToolBtn({
  active,
  onClick,
  title,
  children,
}: {
  editor: Editor;
  active: boolean;
  onClick: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`flex size-7 items-center justify-center rounded-md transition-colors ${
        active ? "bg-accent text-primary" : "text-muted-foreground hover:bg-muted"
      }`}
    >
      {children}
    </button>
  );
}
