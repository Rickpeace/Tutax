import Link from "next/link";
import { BookOpen, Plus, Sparkles, ChevronRight } from "lucide-react";
import { requireAccount } from "@/lib/account";
import { createClient } from "@/lib/supabase/server";
import { embeddingsConfigured } from "@/lib/ai";
import { relativeDe } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { createArticle } from "./actions";

export default async function KnowledgePage() {
  const { account } = await requireAccount();
  const supabase = await createClient();
  const { data: articles } = await supabase
    .from("kb_articles")
    .select("id, title, status, updated_at")
    .eq("account_id", account.id)
    .order("updated_at", { ascending: false });

  const list = articles ?? [];
  const aiOn = embeddingsConfigured();

  return (
    <>
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-ink">Wissensdatenbank</h2>
          <p className="text-sm text-muted-foreground">
            Freies Organisations-Wissen, das der Chatbot zusätzlich zu den Tutorials nutzt.
          </p>
        </div>
        <form action={createArticle}>
          <Button type="submit">
            <Plus className="size-4" /> Neuer Artikel
          </Button>
        </form>
      </div>

      <div className="mt-4 flex items-start gap-2 rounded-xl border border-border bg-accent/40 p-3 text-sm text-ink-2">
        <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" />
        <p>
          <b>Veröffentlichte</b> Artikel fließen automatisch in das Wissen des Chatbots ein
          (Antworten nur aus Ihren Inhalten).{" "}
          {!aiOn && (
            <span className="text-muted-foreground">
              Sobald der OpenAI-Schlüssel hinterlegt ist, werden sie indexiert.
            </span>
          )}
        </p>
      </div>

      {list.length === 0 ? (
        <div className="mt-8 flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card px-6 py-16 text-center">
          <div className="flex size-12 items-center justify-center rounded-xl bg-accent text-primary">
            <BookOpen className="size-6" />
          </div>
          <h3 className="mt-4 font-bold text-ink">Noch kein Wissen hinterlegt</h3>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Legen Sie z. B. Öffnungszeiten, Zuständigkeiten, FAQs oder Hinweise an –
            der Chatbot beantwortet damit Kundenfragen.
          </p>
          <form action={createArticle} className="mt-5">
            <Button type="submit">
              <Plus className="size-4" /> Ersten Artikel anlegen
            </Button>
          </form>
        </div>
      ) : (
        <div className="mt-6 space-y-2">
          {list.map((a) => {
            const published = a.status === "published";
            return (
              <Link
                key={a.id}
                href={`/app/assistent/wissen/${a.id}`}
                className="group flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition-all hover:-translate-y-px hover:border-primary/40"
              >
                <span
                  className={
                    published
                      ? "rounded-md bg-yes-soft px-2 py-0.5 text-xs font-bold text-yes"
                      : "rounded-md bg-line-2 px-2 py-0.5 text-xs font-bold text-muted-foreground"
                  }
                >
                  {published ? "Aktiv im Chatbot" : "Entwurf"}
                </span>
                <span className="font-bold text-ink group-hover:text-primary">{a.title}</span>
                <span className="ml-auto text-xs text-muted-foreground">
                  Geändert {relativeDe(a.updated_at)}
                </span>
                <ChevronRight className="size-4 text-line" />
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
