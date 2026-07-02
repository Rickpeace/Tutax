import Link from "next/link";
import { GraduationCap, Check, ChevronRight, Users } from "lucide-react";
import { requireAccount } from "@/lib/account";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { dateDe } from "@/lib/format";
import type { Tutorial } from "@/lib/types";

export default async function LernenPage() {
  const { account, userId } = await requireAccount();
  const supabase = await createClient();

  // Interne, fürs Team freigegebene Anleitungen des aktiven Kontos.
  const { data: tuts } = await supabase
    .from("tutorials")
    .select("id, title, description, updated_at")
    .eq("account_id", account.id)
    .eq("visibility", "internal")
    .eq("status", "published")
    .order("updated_at", { ascending: false })
    .returns<Pick<Tutorial, "id" | "title" | "description" | "updated_at">[]>();

  const list = tuts ?? [];
  const ids = list.map((t) => t.id);

  // Nachweise (kontoweit lesbar per RLS) + Mitglieder-Gesamtzahl parallel.
  const [{ data: completions }, { count: memberCount }] = await Promise.all([
    ids.length
      ? supabase
          .from("tutorial_completions")
          .select("tutorial_id, user_id, completed_at")
          .in("tutorial_id", ids)
      : Promise.resolve({ data: [] as { tutorial_id: string; user_id: string; completed_at: string }[] }),
    createAdminClient()
      .from("account_members")
      .select("user_id", { count: "exact", head: true })
      .eq("account_id", account.id),
  ]);

  const rows = completions ?? [];
  const teamDone = new Map<string, number>();
  const mine = new Map<string, string>(); // tutorial_id -> completed_at (nur meine)
  for (const c of rows) {
    teamDone.set(c.tutorial_id, (teamDone.get(c.tutorial_id) ?? 0) + 1);
    if (c.user_id === userId) mine.set(c.tutorial_id, c.completed_at);
  }
  const members = memberCount ?? 0;

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-ink">Lernen</h1>
          <p className="text-sm text-muted-foreground">
            Interne Anleitungen fürs Team – mit Schulungsnachweis.
          </p>
        </div>
      </div>

      {list.length === 0 ? (
        <div className="mt-8 flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card px-6 py-16 text-center">
          <div className="flex size-12 items-center justify-center rounded-xl bg-accent text-primary">
            <GraduationCap className="size-6" />
          </div>
          <h2 className="mt-4 font-bold text-ink">Noch keine internen Anleitungen</h2>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            Interne Anleitungen sind nur für das Team sichtbar – nie auf der öffentlichen
            Hilfe-Seite. Stelle im Builder die Sichtbarkeit einer Anleitung auf
            <b> Intern</b> und gib sie frei, dann erscheint sie hier.
          </p>
        </div>
      ) : (
        <div className="mt-6 space-y-2">
          {list.map((t) => {
            const myAt = mine.get(t.id) ?? null;
            const doneCount = teamDone.get(t.id) ?? 0;
            return (
              <Link
                key={t.id}
                href={`/app/lernen/${t.id}`}
                className="group flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition-all hover:-translate-y-px hover:border-primary/40"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate font-bold text-ink group-hover:text-primary">{t.title}</h3>
                    {myAt ? (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-yes-soft px-1.5 py-0.5 text-xs font-bold text-yes">
                        <Check className="size-3" /> Absolviert am {dateDe(myAt)}
                      </span>
                    ) : (
                      <span className="inline-flex shrink-0 items-center rounded-md bg-line-2 px-1.5 py-0.5 text-xs font-bold text-muted-foreground">
                        Offen
                      </span>
                    )}
                  </div>
                  {t.description && (
                    <p className="mt-0.5 line-clamp-1 text-sm text-muted-foreground">{t.description}</p>
                  )}
                </div>
                <span className="hidden items-center gap-1 text-xs text-muted-foreground sm:flex">
                  <Users className="size-3.5" /> {doneCount} von {members} im Team
                </span>
                <ChevronRight className="size-4 shrink-0 text-line" />
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}
