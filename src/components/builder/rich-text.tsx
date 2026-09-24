"use client";

import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useState } from "react";
import { Bold, Italic, List, ListOrdered, Link2, Link2Off } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/** Nur echte http/https-Links zulassen (javascript:/data: etc. verwerfen). */
function safeHttpUrl(raw: string): string | null {
  const trimmed = raw.trim();
  // Leerzeichen sind nie Teil einer Adresse (Chrome würde sie im Hostnamen sonst als %20 annehmen).
  if (!trimmed || /\s/.test(trimmed)) return null;
  // Ohne Schema -> https:// annehmen (der Kunde tippt „example.com").
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const u = new URL(withScheme);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    // Echter Hostname: nur Buchstaben/Ziffern/Punkt/Bindestrich (IDN kommt als Punycode) und
    // mit Punkt (beispiel.de) — „keine adresse“ oder „hallo“ sind kein Link.
    if (!/^[a-z0-9.-]+$/i.test(u.hostname) || !u.hostname.includes(".")) return null;
    return u.href;
  } catch {
    return null;
  }
}

/** Tiptap-Rich-Text für Erklärtexte (§7, body = Tiptap-JSON). */
export function RichText({
  value,
  onChange,
  labelledBy,
}: {
  value: unknown;
  onChange: (json: unknown) => void;
  /** id des sichtbaren Labels („Erklärtext“) — verbindet es für Screenreader mit dem Editor. */
  labelledBy?: string;
}) {
  const editor = useEditor({
    // StarterKit v3 enthält Link/Underline/Strike bereits; Link auf http/https begrenzen
    // und beim Klick im Editor nicht öffnen (stört das Bearbeiten).
    extensions: [
      StarterKit.configure({
        // KEIN `protocols: [...]`: http/https kennt linkify ohnehin, und das Registrieren
        // eigener Schemata bei jedem Editor-Start löste „linkifyjs: already initialized“ aus.
        // Die Begrenzung auf http/https übernimmt isAllowedUri (auch für Autolink/Einfügen).
        link: {
          openOnClick: false,
          autolink: true,
          // Ohne Adresse (kaputt gespeicherter Link) NIE werfen — sonst stürzte der ganze Editor ab
          // und der Schritt ließ sich nicht mehr öffnen (Audit 24.09.).
          isAllowedUri: (url, ctx) =>
            typeof url === "string" &&
            ctx.defaultValidate(url) &&
            (!/^[a-z][a-z0-9+.-]*:/i.test(url.trim()) || /^https?:/i.test(url.trim())),
          HTMLAttributes: { rel: "noopener noreferrer nofollow", target: "_blank" },
        },
      }),
    ],
    content: (value as object | string) || "",
    immediatelyRender: false, // Next.js SSR
    editorProps: {
      attributes: {
        role: "textbox",
        "aria-multiline": "true",
        ...(labelledBy ? { "aria-labelledby": labelledBy } : {}),
        class:
          "min-h-[90px] px-3 py-2 text-sm leading-relaxed text-ink-2 focus:outline-none [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_a]:text-primary [&_a]:underline",
      },
    },
    // Als reines JSON weitergeben: getJSON() liefert attrs-Objekte OHNE Prototyp; die überträgt
    // eine Server-Aktion nicht (kamen leer an → Links ohne Adresse, Überschriften ohne Ebene,
    // Audit 24.09.). Ein JSON-Rundlauf macht daraus normale Objekte.
    onUpdate: ({ editor }) => onChange(JSON.parse(JSON.stringify(editor.getJSON()))),
  });

  // Link-Dialog (statt Browser-prompt): URL-Feld, Prüfung auf http/https bleibt.
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkInput, setLinkInput] = useState("");
  const [linkError, setLinkError] = useState("");

  if (!editor) return null;

  const linkActive = editor.isActive("link");
  function setLink() {
    if (!editor) return;
    if (linkActive) {
      editor.chain().focus().unsetLink().run();
      return;
    }
    setLinkInput((editor.getAttributes("link").href as string) || "");
    setLinkError("");
    setLinkOpen(true);
  }
  function applyLink() {
    if (!editor) return;
    if (!linkInput.trim()) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      setLinkOpen(false);
      return;
    }
    const url = safeHttpUrl(linkInput);
    if (!url) {
      setLinkError("Bitte eine gültige http(s)-Adresse angeben.");
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
    setLinkOpen(false);
  }

  return (
    <div className="overflow-hidden rounded-lg border-2 border-line bg-card">
      <div className="flex items-center gap-0.5 border-b-2 border-line-2 px-1 py-1">
        <ToolBtn editor={editor} label="Fett" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}>
          <Bold className="size-4" />
        </ToolBtn>
        <ToolBtn editor={editor} label="Kursiv" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}>
          <Italic className="size-4" />
        </ToolBtn>
        <ToolBtn editor={editor} label={linkActive ? "Link entfernen" : "Link einfügen"} active={linkActive} pressable={false} onClick={setLink}>
          {linkActive ? <Link2Off className="size-4" /> : <Link2 className="size-4" />}
        </ToolBtn>
        <ToolBtn editor={editor} label="Aufzählung" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}>
          <List className="size-4" />
        </ToolBtn>
        <ToolBtn editor={editor} label="Nummerierte Liste" active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
          <ListOrdered className="size-4" />
        </ToolBtn>
      </div>
      <EditorContent editor={editor} />

      <Dialog open={linkOpen} onOpenChange={(o) => { if (!o) setLinkOpen(false); }}>
        <DialogContent className="sm:max-w-md" data-testid="link-dialog">
          <DialogHeader>
            <DialogTitle>Link einfügen</DialogTitle>
            <DialogDescription>
              Markierter Text wird zum Link. Ohne „https://“ ergänzt Steply das automatisch.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              applyLink();
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="rt-link-url">Link-Adresse</Label>
              <Input
                id="rt-link-url"
                autoFocus
                inputMode="url"
                autoComplete="off"
                spellCheck={false}
                placeholder="z. B. https://beispiel.de/hilfe"
                value={linkInput}
                aria-invalid={linkError ? true : undefined}
                onChange={(e) => {
                  setLinkInput(e.target.value);
                  if (linkError) setLinkError("");
                }}
              />
              {linkError && <p className="text-xs text-destructive">{linkError}</p>}
            </div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="ghost" onClick={() => setLinkOpen(false)}>
                Abbrechen
              </Button>
              <Button type="submit">Link setzen</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ToolBtn({
  active,
  onClick,
  label,
  pressable = true,
  children,
}: {
  editor: Editor;
  active: boolean;
  onClick: () => void;
  label: string;
  /** Umschalter (Fett/Kursiv/Listen) melden ihren Zustand per aria-pressed; der Link-Knopf
   *  wechselt stattdessen seine Beschriftung. */
  pressable?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={pressable ? active : undefined}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`flex size-7 items-center justify-center rounded-md outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 ${
        active ? "bg-accent text-primary" : "text-muted-foreground hover:bg-muted"
      }`}
    >
      {children}
    </button>
  );
}
