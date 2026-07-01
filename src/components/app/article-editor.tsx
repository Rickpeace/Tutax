"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RichText } from "@/components/builder/rich-text";
import { HelpToggle } from "@/components/app/help-toggle";
import {
  saveArticle,
  setArticlePublished,
  deleteArticle,
} from "@/app/app/knowledge/actions";

type Article = { id: string; title: string; body: unknown; status: string };

export function ArticleEditor({ article }: { article: Article }) {
  const router = useRouter();
  const [title, setTitle] = useState(article.title);
  const [body, setBody] = useState<unknown>(article.body);
  const [published, setPublished] = useState(article.status === "published");
  const [dirty, setDirty] = useState(false);
  const [pending, start] = useTransition();

  const save = () =>
    start(async () => {
      try {
        await saveArticle(article.id, title, body);
        setDirty(false);
        toast.success("Gespeichert");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Fehler");
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
          toast.success("Aktiv im Chatbot");
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Fehler");
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

  const remove = () => {
    if (confirm("Diesen Artikel dauerhaft löschen?"))
      start(async () => {
        try {
          await deleteArticle(article.id);
          toast.success("Artikel gelöscht");
          router.push("/app/knowledge");
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Fehler");
        }
      });
  };

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-6">
      <Link
        href="/app/knowledge"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-ink"
      >
        <ArrowLeft className="size-4" /> Wissensdatenbank
      </Link>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <HelpToggle on={published} onToggle={togglePub} disabled={pending} label="Aktiv im Chatbot" />
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={pending || !dirty} onClick={save}>
            <Save className="size-4" /> Speichern
          </Button>
          <Button variant="ghost" size="sm" disabled={pending} onClick={remove}>
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
          Nicht gespeicherte Änderungen – erst nach „Speichern" im Chatbot-Wissen aktiv.
        </p>
      )}
    </main>
  );
}
