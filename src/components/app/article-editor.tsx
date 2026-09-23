"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RichText } from "@/components/builder/rich-text";
import { HelpToggle } from "@/components/app/help-toggle";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  saveArticle,
  setArticlePublished,
  deleteArticle,
} from "@/app/app/assistent/wissen/actions";
import { errorText } from "@/lib/action-error";

type Article = { id: string; title: string; body: unknown; status: string };

export function ArticleEditor({ article }: { article: Article }) {
  const router = useRouter();
  const [title, setTitle] = useState(article.title);
  const [body, setBody] = useState<unknown>(article.body);
  const [published, setPublished] = useState(article.status === "published");
  const [dirty, setDirty] = useState(false);
  const [pending, start] = useTransition();
  // Steply-Abfrage statt grauem Browser-Dialog (wie im Editor).
  const [confirm, confirmDialog] = useConfirm();

  // Verlust-Schutz: Browser-Navigation/Tab-Schließen bei ungespeicherten Änderungen abfangen.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  // Interne Navigation (Zurück-Link) bei ungespeicherten Änderungen absichern.
  const confirmLeave = async () =>
    !dirty ||
    (await confirm({
      title: "Änderungen verwerfen?",
      description:
        "Titel und Text dieses Artikels sind noch nicht gespeichert. Beim Verlassen gehen sie verloren.",
      confirmLabel: "Verwerfen und verlassen",
      cancelLabel: "Weiter bearbeiten",
      destructive: true,
    }));

  const save = () =>
    start(async () => {
      try {
        await saveArticle(article.id, title, body);
        setDirty(false);
        toast.success("Gespeichert");
      } catch (e) {
        toast.error(errorText(e));
      }
    });

  const togglePub = () => {
    const next = !published;
    if (next) {
      // Erst speichern, damit der Chatbot-Index den aktuellen Stand bekommt.
      start(async () => {
        try {
          await saveArticle(article.id, title, body);
          await setArticlePublished(article.id, true);
          setPublished(true);
          setDirty(false);
          toast.success("Im KI-Assistenten aktiv");
        } catch (e) {
          toast.error(errorText(e));
        }
      });
    } else {
      setPublished(false);
      setArticlePublished(article.id, false).catch(() => {
        setPublished(true);
        toast.error("Konnte nicht ändern");
      });
    }
  };

  const remove = async () => {
    const ok = await confirm({
      title: `„${article.title || "Artikel"}“ löschen?`,
      description:
        "Der Artikel wird dauerhaft gelöscht und steht dem KI-Assistenten nicht mehr als Wissen zur Verfügung. Das kann nicht rückgängig gemacht werden.",
      confirmLabel: "Endgültig löschen",
      destructive: true,
    });
    if (!ok) return;
    start(async () => {
      try {
        await deleteArticle(article.id);
        toast.success("Artikel gelöscht");
        router.push("/app/assistent/wissen");
      } catch (e) {
        toast.error(errorText(e));
      }
    });
  };

  return (
    <div className="mx-auto w-full max-w-3xl">
      {confirmDialog}
      <Link
        href="/app/assistent/wissen"
        data-testid="article-back"
        onClick={(e) => {
          if (!dirty) return;
          // Abfrage läuft asynchron: Navigation erst stoppen, bei „Verwerfen“ selbst gehen.
          e.preventDefault();
          void confirmLeave().then((ok) => {
            if (ok) router.push("/app/assistent/wissen");
          });
        }}
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-ink"
      >
        <ArrowLeft className="size-4" /> Wissensdatenbank
      </Link>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <HelpToggle on={published} onToggle={togglePub} disabled={pending} label="Im KI-Assistenten aktiv" />
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={pending || !dirty} onClick={save}>
            <Save className="size-4" /> Speichern
          </Button>
          <Button variant="ghost" size="sm" disabled={pending} onClick={() => void remove()}>
            <Trash2 className="size-4" /> Löschen
          </Button>
        </div>
      </div>

      <Input
        value={title}
        onChange={(e) => {
          setTitle(e.target.value);
          setDirty(true);
        }}
        placeholder="Titel des Artikels"
        className="mb-3 h-11 text-base font-bold"
      />

      <RichText
        value={body}
        onChange={(json) => {
          setBody(json);
          setDirty(true);
        }}
      />

      {published && dirty && (
        <p className="mt-3 text-xs text-muted-foreground">
          Nicht gespeicherte Änderungen – erst nach „Speichern“ im KI-Assistenten aktiv.
        </p>
      )}
    </div>
  );
}
