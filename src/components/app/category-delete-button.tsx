"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deleteCategory } from "@/app/app/actions";

/**
 * Dezenter Papierkorb für eine LEERE eigene Kategorie (Welle 20). Erscheint nur,
 * wenn die Kategorie 0 Tutorials hat (Dashboard entscheidet das). Nach confirm()
 * ruft er die Server-Action, die serverseitig nochmal prüft (leer + eigenes Konto).
 */
export function CategoryDeleteButton({
  categoryId,
  categoryName,
}: {
  categoryId: string;
  categoryName: string;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const onDelete = () => {
    if (!confirm(`Leere Kategorie „${categoryName}“ löschen?`)) return;
    startTransition(async () => {
      try {
        await deleteCategory(categoryId);
        toast.success("Kategorie gelöscht");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Löschen fehlgeschlagen");
      }
    });
  };

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      disabled={pending}
      onClick={onDelete}
      title="Leere Kategorie löschen"
      aria-label={`Kategorie „${categoryName}“ löschen`}
      className="text-muted-foreground hover:text-no"
    >
      {pending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
    </Button>
  );
}
