"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Globe, FileUp, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { importFromWebsite } from "@/app/app/assistent/wissen/import-actions";

type ImportResult = { count: number; titles: string[] };

function successToast(res: ImportResult) {
  if (res.count === 0) {
    toast.message("Es wurden keine neuen Entwürfe erstellt.");
    return;
  }
  const preview = res.titles.slice(0, 3).join(", ");
  toast.success(
    `${res.count} ${res.count === 1 ? "Entwurf" : "Entwürfe"} erstellt`,
    { description: preview ? `${preview}${res.titles.length > 3 ? " …" : ""}` : undefined },
  );
}

export function KbImport({ accountWebsite }: { accountWebsite: string }) {
  const router = useRouter();

  // Website-Dialog
  const [webOpen, setWebOpen] = useState(false);
  const [url, setUrl] = useState(accountWebsite);
  const [pending, start] = useTransition();

  // Dokument-Upload
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const busy = pending || uploading;

  function runWebsite() {
    if (busy) return;
    const target = url.trim();
    if (!target) {
      toast.error("Bitte geben Sie eine Website-Adresse an.");
      return;
    }
    start(async () => {
      try {
        const res = await importFromWebsite(target);
        setWebOpen(false);
        successToast(res);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Import fehlgeschlagen.");
      }
    });
  }

  async function onFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (fileRef.current) fileRef.current.value = ""; // erneutes Wählen derselben Datei erlauben
    if (!file || busy) return;

    setUploading(true);
    const t = toast.loading("Dokument wird gelesen …");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const resp = await fetch("/api/kb-import", { method: "POST", body: fd });
      const data = await resp.json().catch(() => ({}));
      toast.dismiss(t);
      if (!resp.ok) {
        toast.error(data?.error ?? "Import fehlgeschlagen.");
        return;
      }
      successToast(data as ImportResult);
      router.refresh();
    } catch {
      toast.dismiss(t);
      toast.error("Import fehlgeschlagen.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {/* Website-Import */}
      <Dialog
        open={webOpen}
        onOpenChange={(o) => {
          if (pending) return; // während des Laufs nicht schließen
          setWebOpen(o);
          if (o) setUrl(accountWebsite);
        }}
      >
        <DialogTrigger
          render={
            <Button variant="outline" size="sm" disabled={busy}>
              <Globe className="size-4" /> Von Ihrer Website
            </Button>
          }
        />
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Von Ihrer Website übernehmen</DialogTitle>
            <DialogDescription>
              Wir lesen Ihre Website und schlagen Wissens-Artikel vor — als Entwürfe, nichts geht
              ungeprüft in den Chat.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <Input
              type="url"
              inputMode="url"
              placeholder="https://www.ihre-kanzlei.de"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  runWebsite();
                }
              }}
              disabled={pending}
              autoFocus
            />
            {pending && (
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin text-primary" /> Website wird gelesen und
                Entwürfe werden erstellt … das dauert einen Moment.
              </p>
            )}
            <Button className="w-full" onClick={runWebsite} disabled={pending || !url.trim()}>
              {pending ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Wird gelesen …
                </>
              ) : (
                <>
                  <Globe className="size-4" /> Entwürfe erstellen
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dokument-Upload */}
      <input
        ref={fileRef}
        type="file"
        accept=".pdf,.docx,.txt,.md"
        onChange={onFilePicked}
        className="hidden"
      />
      <Button variant="outline" size="sm" disabled={busy} onClick={() => fileRef.current?.click()}>
        {uploading ? <Loader2 className="size-4 animate-spin" /> : <FileUp className="size-4" />} Aus
        Dokument
      </Button>
    </div>
  );
}
