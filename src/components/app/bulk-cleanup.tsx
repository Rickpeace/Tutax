"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { deleteTutorial } from "@/app/app/actions";

const MAX_BULK_DELETE = 20;

type CleanupCtx = {
  active: boolean;
  selected: Set<string>;
  published: Map<string, boolean>;
  toggle: (id: string) => void;
  isSelected: (id: string) => boolean;
  register: (id: string, published: boolean) => void;
  enter: () => void;
  exit: () => void;
};

const Ctx = createContext<CleanupCtx | null>(null);

/** Wird von TutorialCard genutzt, um im Aufräum-Modus eine Checkbox zu zeigen. */
export function useCleanup(): CleanupCtx | null {
  return useContext(Ctx);
}

/**
 * Bulk-Aufräumen (REVIEW G-Nebenfund): stellt den Aufräum-Modus + Auswahl bereit.
 * Umschließt die Header-Aktionen (CleanupControls) UND die Tutorial-Sektionen, damit
 * beide dieselbe Auswahl teilen. Bewusst SIMPEL: nur Mehrfachauswahl + Löschen.
 */
export function BulkCleanupProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  // Veröffentlichungs-Status je Tutorial (für den Warnhinweis im Dialog).
  const [published, setPublished] = useState<Map<string, boolean>>(() => new Map());

  const register = useCallback((id: string, isPub: boolean) => {
    setPublished((m) => {
      if (m.get(id) === isPub) return m;
      const next = new Map(m);
      next.set(id, isPub);
      return next;
    });
  }, []);

  const toggle = useCallback((id: string) => {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else if (next.size < MAX_BULK_DELETE) next.add(id);
      else toast.error(`Maximal ${MAX_BULK_DELETE} auf einmal.`);
      return next;
    });
  }, []);

  const isSelected = useCallback((id: string) => selected.has(id), [selected]);
  const enter = useCallback(() => setActive(true), []);
  const exit = useCallback(() => {
    setActive(false);
    setSelected(new Set());
  }, []);

  const ctx = useMemo<CleanupCtx>(
    () => ({ active, selected, published, toggle, isSelected, register, enter, exit }),
    [active, selected, published, toggle, isSelected, register, enter, exit],
  );

  return <Ctx.Provider value={ctx}>{children}</Ctx.Provider>;
}

/** Toggle-Button im Header + Aktions-/Bestätigungsleiste im Aufräum-Modus. */
export function CleanupControls() {
  const ctx = useCleanup();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  if (!ctx) return null;

  const { active, selected, published, enter, exit } = ctx;
  const count = selected.size;
  const publishedCount = [...selected].filter((id) => published.get(id)).length;

  const runDelete = () => {
    const ids = [...selected].slice(0, MAX_BULK_DELETE);
    startTransition(async () => {
      let ok = 0;
      for (const id of ids) {
        try {
          await deleteTutorial(id);
          ok++;
        } catch {
          /* einzelne Fehler zählen, Rest weiter versuchen */
        }
      }
      setConfirmOpen(false);
      exit();
      if (ok === ids.length) toast.success(`${ok} gelöscht`);
      else toast.error(`${ok} von ${ids.length} gelöscht`);
      router.refresh();
    });
  };

  if (!active) {
    return (
      <Button variant="outline" onClick={enter} aria-label="Löschen">
        <Trash2 className="size-4" /> Löschen
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="destructive"
        disabled={count === 0 || pending}
        onClick={() => setConfirmOpen(true)}
      >
        <Trash2 className="size-4" /> Ausgewählte löschen
        {count > 0 && ` (${count})`}
      </Button>
      <Button variant="ghost" onClick={exit} aria-label="Aufräumen beenden">
        <X className="size-4" /> Fertig
      </Button>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Mehrere Tutorials löschen — {count} ausgewählt
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Die ausgewählten Anleitungen werden mit allen Schritten dauerhaft
            gelöscht. Das kann nicht rückgängig gemacht werden.
          </p>
          {publishedCount > 0 && (
            <p className="rounded-lg bg-no-soft px-3 py-2 text-sm font-medium text-no">
              Achtung: {publishedCount} davon {publishedCount === 1 ? "ist" : "sind"}{" "}
              veröffentlicht und {publishedCount === 1 ? "wird" : "werden"} von der
              Hilfe-Seite entfernt.
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={pending}>
              Abbrechen
            </Button>
            <Button variant="destructive" onClick={runDelete} disabled={pending}>
              {pending ? "Wird gelöscht …" : "Endgültig löschen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
