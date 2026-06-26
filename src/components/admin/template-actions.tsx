"use client";

import { useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { FileText, Send, Undo2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  publishTemplate,
  unpublishTemplate,
  deleteTemplate,
} from "@/app/admin/actions";

export function TemplateActions({
  id,
  published,
}: {
  id: string;
  published: boolean;
}) {
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<void>, msg: string) =>
    start(async () => {
      try {
        await fn();
        toast.success(msg);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Fehler");
      }
    });

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        nativeButton={false}
        render={<Link href={`/app/tutorials/${id}`} />}
      >
        <FileText className="size-4" /> Bearbeiten
      </Button>
      {published ? (
        <Button
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() => run(() => unpublishTemplate(id), "Zurückgezogen")}
        >
          <Undo2 className="size-4" /> Zurückziehen
        </Button>
      ) : (
        <Button
          size="sm"
          disabled={pending}
          onClick={() => run(() => publishTemplate(id), "Veröffentlicht")}
        >
          <Send className="size-4" /> Veröffentlichen
        </Button>
      )}
      <Button
        variant="ghost"
        size="icon-sm"
        disabled={pending}
        aria-label="Löschen"
        onClick={() => {
          if (confirm("Dieses Template wirklich löschen?"))
            run(() => deleteTemplate(id), "Gelöscht");
        }}
      >
        <Trash2 className="size-4 text-no" />
      </Button>
    </div>
  );
}
