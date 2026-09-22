"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { TriangleAlert } from "lucide-react";
import { saveBranding } from "@/app/app/settings/branding/actions";
import { SaveBar } from "@/components/app/save-bar";
import { FieldLabel } from "@/components/app/settings-ui";
import { slugify } from "@/lib/slug";

/**
 * „Adresse der Hilfe-Seite" (Einstellungen → Adresse & Teilen). Speichert über
 * saveBranding (Name bleibt, Farben unberührt). Die Server-Action slugifiziert selbst
 * und meldet belegte Adressen.
 */
export function SlugForm({
  name,
  initialSlug,
  appUrl,
}: {
  name: string;
  initialSlug: string;
  appUrl: string;
}) {
  const router = useRouter();
  const [saved, setSaved] = useState(initialSlug);
  const [slug, setSlug] = useState(initialSlug);
  const [pending, startTransition] = useTransition();
  const preview = slugify(slug || name);
  const dirty = slug.trim() !== saved;

  function save() {
    startTransition(async () => {
      const res = await saveBranding({ slug });
      if (res.ok) {
        setSaved(res.slug);
        setSlug(res.slug);
        toast.success("Adresse gespeichert");
        router.refresh();
      } else {
        // Server-Text spricht noch vom „Slug" — sichtbar heißt es „Adresse".
        toast.error(/slug/i.test(res.error) ? "Diese Adresse ist bereits vergeben." : res.error);
      }
    });
  }

  return (
    <div className="grid gap-1.5">
      <FieldLabel htmlFor="hub-slug">Adresse</FieldLabel>
      <div className="flex h-10 min-w-0 items-center overflow-hidden rounded-xl border-2 border-line bg-card text-sm font-bold focus-within:border-primary/60 focus-within:ring-3 focus-within:ring-ring/25">
        <span className="hidden shrink-0 border-r-2 border-line bg-line-2 px-3 py-2 text-muted-foreground sm:block">
          {appUrl.replace(/^https?:\/\//, "")}/h/
        </span>
        <input
          id="hub-slug"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && dirty) save();
          }}
          placeholder="muster-gmbh"
          className="h-full min-w-0 flex-1 bg-transparent px-3 text-ink outline-none placeholder:text-faint"
          autoComplete="off"
          spellCheck={false}
        />
      </div>
      <p className="break-all text-xs text-muted-foreground">
        {appUrl}/h/<b className="text-ink-2">{preview}</b>
      </p>
      {dirty && (
        <p className="flex items-start gap-1.5 rounded-xl bg-amber-soft px-3 py-2 text-xs font-bold text-amber-text">
          <TriangleAlert className="mt-px size-3.5 shrink-0" />
          Nach dem Speichern funktionieren bisherige Links und gedruckte QR-Codes nicht mehr.
        </p>
      )}
      <SaveBar dirty={dirty} saving={pending} onSave={save} onDiscard={() => setSlug(saved)} />
    </div>
  );
}
