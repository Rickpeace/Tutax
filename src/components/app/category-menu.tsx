"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, MoreHorizontal, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { deleteCategory } from "@/app/app/actions";
import { cn } from "@/lib/utils";

const anleitungen = (n: number) => `${n} Anleitung${n === 1 ? "" : "en"}`;

/**
 * „…“-Menü einer EIGENEN Kategorie in der Anleitungen-Übersicht (Welle 54; ersetzt den beim
 * Umbau verlorenen Papierkorb). Bietet „Kategorie löschen“ mit Bestätigung, die die Folge
 * nennt: die Anleitungen darin bleiben erhalten und wandern nach „Sonstiges“ (DB: on delete
 * set null). Die Rechteprüfung macht der Server (deleteCategory: Konto + Bearbeiten-Recht);
 * die Übersicht zeigt das Menü nur Rollen, die bearbeiten dürfen.
 */
export function CategoryMenu({
  categoryId,
  categoryName,
  tutorialCount,
  onDeleted,
  className,
}: {
  categoryId: string;
  categoryName: string;
  /** Alle Anleitungen in der Kategorie (unabhängig vom Bereichs-/Status-Filter). */
  tutorialCount: number;
  onDeleted?: () => void;
  className?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [confirm, confirmDialog] = useConfirm();
  const router = useRouter();

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
        const { moved } = await deleteCategory(categoryId);
        toast.success(
          moved > 0
            ? `Kategorie gelöscht – ${anleitungen(moved)} jetzt unter „Sonstiges“`
            : "Kategorie gelöscht",
        );
        onDeleted?.();
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Löschen fehlgeschlagen");
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
          <DropdownMenuItem variant="destructive" onClick={onDelete} data-testid="category-delete">
            <Trash2 className="size-4" /> Kategorie löschen
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {confirmDialog}
    </>
  );
}
