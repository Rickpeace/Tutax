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
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { importFromWebsite } from "@/app/app/assistent/wissen/import-actions";
import { errorText } from "@/lib/action-error";

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
  // Welle 51: optionale Zusatz-Unterseiten (eine pro Zeile) — für Seiten, die der Import
  // nicht von selbst findet (z. B. per JavaScript aufgebaute Menüs).
  const [extra, setExtra] = useState("");
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
        // Erwartete Fehler kommen als { error } zurück (die Action wirft dafür nicht mehr,
        // sonst antwortete sie mit HTTP 500 auf einen reinen Eingabefehler).
        const res = await importFromWebsite(target, extra);
        if ("error" in res) {
          toast.error(res.error);
          return;
        }
        setWebOpen(false);
        successToast(res);
        router.refresh();
      } catch (e) {
        toast.error(errorText(e, "Import fehlgeschlagen."));
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
          if (o) {
            setUrl(accountWebsite);
            setExtra("");
          }
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
              Wir lesen Ihre Website (Startseite und bis zu 12 Unterseiten) und schlagen
              Wissens-Artikel vor — als Entwürfe, nichts geht ungeprüft in den Chat.
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
              aria-label="Website-Adresse"
            />
            <div className="space-y-1.5">
              <Label htmlFor="kb-import-extra" className="text-xs font-extrabold text-ink-2">
                Weitere Unterseiten (optional), eine pro Zeile
              </Label>
              <Textarea
                id="kb-import-extra"
                data-testid="kb-import-extra"
                rows={3}
                placeholder={"https://www.ihre-kanzlei.de/leistungen\nhttps://www.ihre-kanzlei.de/faq"}
                value={extra}
                onChange={(e) => setExtra(e.target.value)}
                disabled={pending}
                className="text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Nur Seiten derselben Website, höchstens 10. Hilfreich, wenn wichtige Seiten fehlen.
              </p>
            </div>
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
