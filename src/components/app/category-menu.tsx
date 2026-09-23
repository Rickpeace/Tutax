"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { deleteCategory, renameCategory } from "@/app/app/actions";
import {
  CATEGORY_NAME_EMPTY,
  CATEGORY_NAME_MAX,
  CATEGORY_NAME_TOO_LONG,
  categoryNameKey,
  categoryNameTaken,
  cleanCategoryName,
} from "@/lib/category-name";
import { cn } from "@/lib/utils";
import { unwrap, errorText } from "@/lib/action-error";

const anleitungen = (n: number) => `${n} Anleitung${n === 1 ? "" : "en"}`;

/**
 * „…“-Menü einer EIGENEN Kategorie in der Anleitungen-Übersicht (Welle 54; ersetzt den beim
 * Umbau verlorenen Papierkorb). Bietet „Umbenennen“ (kleiner Dialog) und „Kategorie löschen“
 * mit Bestätigung, die die Folge nennt: die Anleitungen darin bleiben erhalten und wandern
 * nach „Sonstiges“ (DB: on delete set null). Die Rechteprüfung macht der Server
 * (renameCategory/deleteCategory: Konto + Bearbeiten-Recht); die Übersicht zeigt das Menü
 * nur Rollen, die bearbeiten dürfen, und nie für Standard-Kategorien.
 */
export function CategoryMenu({
  categoryId,
  categoryName,
  tutorialCount,
  otherNames = [],
  onDeleted,
  className,
}: {
  categoryId: string;
  categoryName: string;
  /** Alle Anleitungen in der Kategorie (unabhängig vom Bereichs-/Status-Filter). */
  tutorialCount: number;
  /** Namen der ANDEREN Kategorien des Kontos (sofortige Duplikat-Meldung; Server prüft erneut). */
  otherNames?: string[];
  onDeleted?: () => void;
  className?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [confirm, confirmDialog] = useConfirm();
  const router = useRouter();
  const [renameOpen, setRenameOpen] = useState(false);
  // Neuer Schlüssel je Öffnen → Dialog startet frisch (aktueller Name, keine alte Meldung).
  const [renameKey, setRenameKey] = useState(0);

  const onDelete = async () => {
    const ok = await confirm({
      title: `Kategorie „${categoryName}“ löschen?`,
      description:
        tutorialCount > 0
          ? `${anleitungen(tutorialCount)} ${tutorialCount === 1 ? "wandert" : "wandern"} nach „Sonstiges“. Die Anleitungen selbst bleiben erhalten.`
          : "Die Kategorie ist leer – es gehen keine Anleitungen verloren.",
      confirmLabel: "Kategorie löschen",
      destructive: true,
    });
    if (!ok) return;
    startTransition(async () => {
      try {
        const { moved } = unwrap(await deleteCategory(categoryId));
        toast.success(
          moved > 0
            ? `Kategorie gelöscht – ${anleitungen(moved)} jetzt unter „Sonstiges“`
            : "Kategorie gelöscht",
        );
        onDeleted?.();
        router.refresh();
      } catch (e) {
        toast.error(errorText(e, "Löschen fehlgeschlagen"));
      }
    });
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={pending}
              aria-label={`Kategorie „${categoryName}“: weitere Aktionen`}
              title="Weitere Aktionen"
              data-testid="category-menu"
              className={cn("shrink-0 text-muted-foreground", className)}
            />
          }
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : <MoreHorizontal className="size-4" />}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuItem
            onClick={() => {
              setRenameKey((k) => k + 1);
              setRenameOpen(true);
            }}
            data-testid="category-rename"
          >
            <Pencil className="size-4" /> Umbenennen
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onClick={onDelete} data-testid="category-delete">
            <Trash2 className="size-4" /> Kategorie löschen
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {confirmDialog}
      <RenameCategoryDialog
        key={renameKey}
        open={renameOpen}
        onOpenChange={setRenameOpen}
        categoryId={categoryId}
        categoryName={categoryName}
        otherNames={otherNames}
        onRenamed={() => router.refresh()}
      />
    </>
  );
}

/** Kleiner Dialog: Namensfeld (vorbelegt, markiert), Enter speichert, Fehler direkt am Feld. */
function RenameCategoryDialog({
  open,
  onOpenChange,
  categoryId,
  categoryName,
  otherNames,
  onRenamed,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categoryId: string;
  categoryName: string;
  otherNames: string[];
  onRenamed: () => void;
}) {
  const [value, setValue] = useState(categoryName);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const change = (o: boolean) => {
    if (saving) return; // während des Speicherns offen lassen
    onOpenChange(o);
  };

  const validate = (raw: string): string | null => {
    const clean = cleanCategoryName(raw);
    if (!clean) return CATEGORY_NAME_EMPTY;
    if (clean.length > CATEGORY_NAME_MAX) return CATEGORY_NAME_TOO_LONG;
    const key = categoryNameKey(clean);
    const hit = otherNames.find((n) => categoryNameKey(n) === key);
    if (hit) return categoryNameTaken(hit);
    return null;
  };

  const save = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (saving) return;
    const problem = validate(value);
    if (problem) {
      setError(problem);
      inputRef.current?.focus();
      return;
    }
    const clean = cleanCategoryName(value);
    if (clean === categoryName) {
      onOpenChange(false); // unverändert → einfach schließen
      return;
    }
    setSaving(true);
    try {
      unwrap(await renameCategory(categoryId, clean));
      toast.success("Kategorie umbenannt");
      onOpenChange(false);
      onRenamed();
    } catch (err) {
      setError(errorText(err, "Umbenennen fehlgeschlagen"));
      inputRef.current?.focus();
    } finally {
      setSaving(false);
    }
  };

  const inputId = `rename-cat-${categoryId}`;
  return (
    <Dialog open={open} onOpenChange={change}>
      <DialogContent
        className="sm:max-w-sm"
        initialFocus={inputRef}
        data-testid="category-rename-dialog"
      >
        <form onSubmit={save} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Kategorie umbenennen</DialogTitle>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor={inputId}>Name</Label>
            <Input
              id={inputId}
              ref={inputRef}
              autoFocus
              value={value}
              maxLength={CATEGORY_NAME_MAX}
              onChange={(e) => {
                setValue(e.target.value);
                if (error) setError(null);
              }}
              onFocus={(e) => e.currentTarget.select()}
              autoComplete="off"
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? `${inputId}-error` : undefined}
              data-testid="category-rename-input"
            />
            {error && (
              <p
                id={`${inputId}-error`}
                role="alert"
                className="text-[13px] font-semibold text-destructive"
                data-testid="category-rename-error"
              >
                {error}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => change(false)} disabled={saving}>
              Abbrechen
            </Button>
            <Button type="submit" disabled={saving} data-testid="category-rename-save">
              {saving && <Loader2 className="size-4 animate-spin" />} Speichern
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
