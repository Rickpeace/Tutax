"use client";

import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Bold, Italic, List, ListOrdered } from "lucide-react";

/** Tiptap-Rich-Text für Erklärtexte (§7, body = Tiptap-JSON). */
export function RichText({
  value,
  onChange,
}: {
  value: unknown;
  onChange: (json: unknown) => void;
}) {
  const editor = useEditor({
    extensions: [StarterKit],
    content: (value as object | string) || "",
    immediatelyRender: false, // Next.js SSR
    editorProps: {
      attributes: {
        class:
          "min-h-[90px] px-3 py-2 text-sm leading-relaxed text-ink-2 focus:outline-none [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5",
      },
    },
    onUpdate: ({ editor }) => onChange(editor.getJSON()),
  });

  if (!editor) return null;

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex items-center gap-0.5 border-b border-line-2 px-1 py-1">
        <ToolBtn editor={editor} active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}>
          <Bold className="size-4" />
        </ToolBtn>
        <ToolBtn editor={editor} active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}>
          <Italic className="size-4" />
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
  children,
}: {
  editor: Editor;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
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
