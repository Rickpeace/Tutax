"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Globe, Plus, X } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  normalizeDomain,
  mergeDomains,
  MAX_SITE_DOMAINS,
} from "@/lib/site-domains";
import { setTutorialSiteDomains } from "@/app/app/tutorials/[id]/actions";

// „Gilt für Website" (Welle 31c): dezentes Element neben der Kategorie im Builder-Kopf.
// Zeigt die Basis-Domains, für die dieses Tutorial gilt; im Popover editierbar (Chips +
// Eingabe). Optimistisch nach Header-Muster (State sofort, Server persistiert im
// Hintergrund, Rollback bei Fehler) — dieselbe Optik wie CategoryPicker.
export function SiteDomainsPicker({
  tutorialId,
  initialDomains,
}: {
  tutorialId: string;
  initialDomains: string[];
}) {
  const [domains, setDomains] = useState<string[]>(initialDomains ?? []);
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Trigger-Beschriftung: „datev.de", „datev.de +1", … oder Leer-Aufforderung.
  const summary =
    domains.length === 0
      ? null
      : domains.length === 1
        ? domains[0]
        : `${domains[0]} +${domains.length - 1}`;

  // Die VOLLSTÄNDIGE gewünschte Liste optimistisch setzen und persistieren; bei Fehler
  // zurückrollen. Der Server liefert die normalisierte Endliste (dedup/sort/cap) zurück.
  async function save(next: string[]) {
    const prev = domains;
    setDomains(next);
    setBusy(true);
    try {
      const saved = await setTutorialSiteDomains(tutorialId, next);
      setDomains(saved);
    } catch {
      setDomains(prev);
      toast.error("Website konnte nicht gespeichert werden");
    } finally {
      setBusy(false);
    }
  }

  function addDomain() {
    const raw = input.trim();
    if (!raw) return;
    const n = normalizeDomain(raw);
    if (!n) {
      setError("Bitte eine gültige Website angeben (z. B. „datev.de“).");
      return;
    }
    if (domains.includes(n)) {
      setInput("");
      setError("");
      return;
    }
    if (domains.length >= MAX_SITE_DOMAINS) {
      setError(`Höchstens ${MAX_SITE_DOMAINS} Websites pro Anleitung.`);
      return;
    }
    setInput("");
    setError("");
    save(mergeDomains(domains, [n]));
  }

  function removeDomain(d: string) {
    save(domains.filter((x) => x !== d));
  }

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) {
          setError("");
          setInput("");
        }
      }}
    >
      <PopoverTrigger className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-sm text-ink-2 transition-colors hover:bg-muted">
        <Globe className="size-3.5 text-muted-foreground" />
        {summary ? (
          <span className="max-w-[12rem] truncate">{summary}</span>
        ) : (
          <span className="text-muted-foreground">Website zuordnen</span>
        )}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72">
        <p className="text-sm font-medium text-ink">Gilt für Website</p>

        {domains.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {domains.map((d) => (
              <span
                key={d}
                className="inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-xs text-ink"
              >
                {d}
                <button
                  type="button"
                  onClick={() => removeDomain(d)}
                  disabled={busy}
                  aria-label={`„${d}“ entfernen`}
                  className="rounded-full text-muted-foreground transition-colors hover:text-primary-pressed disabled:opacity-50"
                >
                  <X className="size-3" />
                </button>
              </span>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Noch keine Website hinterlegt — bei der nächsten Sofort-Aufnahme merkt sich
            Steply die Seite automatisch.
          </p>
        )}

        <div className="flex items-center gap-1.5">
          <input
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              if (error) setError("");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addDomain();
              }
            }}
            placeholder="z. B. datev.de"
            aria-label="Website hinzufügen"
            spellCheck={false}
            autoComplete="off"
            className="min-w-0 flex-1 rounded-md border border-line bg-card px-2 py-1 text-sm text-ink outline-none focus:border-primary"
          />
          <button
            type="button"
            onClick={addDomain}
            disabled={busy}
            aria-label="Website hinzufügen"
            className="flex shrink-0 items-center gap-1 rounded-md bg-primary px-2 py-1 text-xs font-medium text-white transition-colors hover:bg-primary-pressed disabled:opacity-50"
          >
            <Plus className="size-3.5" /> Hinzufügen
          </button>
        </div>

        {error && <p className="text-xs text-destructive">{error}</p>}
      </PopoverContent>
    </Popover>
  );
}
