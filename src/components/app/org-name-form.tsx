"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { saveBranding } from "@/app/app/settings/branding/actions";
import { SaveBar } from "@/components/app/save-bar";
import { FieldLabel, settingsInputClass } from "@/components/app/settings-ui";
import { ORG_NAME_MAX, ORG_NAME_TOO_LONG } from "@/lib/text-limits";

/**
 * „Name der Organisation" (Einstellungen → Allgemein). Speichert über dieselbe
 * Server-Action wie früher das Branding-Formular (saveBranding) — Adresse bleibt
 * unverändert, Farben werden nicht angefasst (leeres colors-Objekt = nichts mergen).
 */
export function OrgNameForm({ initialName }: { initialName: string }) {
  const router = useRouter();
  const [saved, setSaved] = useState(initialName);
  const [name, setName] = useState(initialName);
  const [pending, startTransition] = useTransition();
  const dirty = name.trim() !== saved.trim();

  function save() {
    if (!name.trim()) {
      toast.error("Der Name darf nicht leer sein.");
      return;
    }
    // maxLength greift nur beim Tippen — Einfügen aus der Zwischenablage nicht immer.
    if (name.trim().length > ORG_NAME_MAX) {
      toast.error(ORG_NAME_TOO_LONG);
      return;
    }
    startTransition(async () => {
      const res = await saveBranding({ name });
      if (res.ok) {
        setSaved(name.trim());
        setName(name.trim());
        toast.success("Name gespeichert");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <div className="grid gap-1.5">
      <FieldLabel htmlFor="org-name">Name der Organisation</FieldLabel>
      <input
        id="org-name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && dirty) save();
        }}
        maxLength={ORG_NAME_MAX}
        className={settingsInputClass}
        autoComplete="organization"
      />
      <p className="text-xs text-muted-foreground">
        Erscheint oben auf Ihrer Hilfe-Seite und in Einladungen an Ihr Team. Höchstens{" "}
        {ORG_NAME_MAX} Zeichen.
      </p>
      <SaveBar dirty={dirty} saving={pending} onSave={save} onDiscard={() => setName(saved)} />
    </div>
  );
}
