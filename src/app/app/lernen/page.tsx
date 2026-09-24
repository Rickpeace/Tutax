import Link from "next/link";
import { canEdit } from "@/lib/roles";
import { GraduationCap, Check, ChevronRight, Users } from "lucide-react";
import { requireAccount } from "@/lib/account";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { dateLongDe } from "@/lib/format";
import type { Tutorial } from "@/lib/types";
import { PageHeader } from "@/components/app/page-header";
import { isPro } from "@/lib/plan";

/**
 * Schulungen (/app/lernen — Route bleibt): interne Anleitungen fürs Team mit
 * Schulungsnachweis. Zeigt je Anleitung den eigenen Stand (absolviert/offen) und
 * wie viele im Team sie schon absolviert haben.
 */
export default async function LernenPage() {
  const { account, userId, role } = await requireAccount({ allowMember: true });
  // Mitarbeiter haben keinen Editor — für sie ein eigener Leerzustand ohne Autoren-Anleitung.
  const isMember = !canEdit(role);
  const supabase = await createClient();

  // Fürs Team freigegebene Anleitungen des aktiven Kontos: interne ODER öffentliche
  // mit in_lernen (Welle 20 — öffentliche Anleitung zusätzlich mit Schulungsnachweis).
  const { data: tuts } = await supabase
    .from("tutorials")
    .select("id, title, description, updated_at, visibility")
    .eq("account_id", account.id)
    .eq("status", "published")
    .or("visibility.eq.internal,in_lernen.eq.true")
    .order("updated_at", { ascending: false })
    .returns<Pick<Tutorial, "id" | "title" | "description" | "updated_at" | "visibility">[]>();

  const list = tuts ?? [];
  const ids = list.map((t) => t.id);

  // Nachweise + Mitglieder-Gesamtzahl parallel. Server-Client: Mitarbeiter dürfen per RLS
  // nur den EIGENEN Nachweis lesen (0039) — die Team-Zählung („3 von 5") braucht alle.
  // Sicher gescopt: ids stammen ausschließlich aus Tutorials des aktiven Kontos.
  const [{ data: completions }, { data: memberRows }] = await Promise.all([
    ids.length
      ? createAdminClient()
          .from("tutorial_completions")
          .select("tutorial_id, user_id, completed_at")
          .eq("account_id", account.id)
          .in("tutorial_id", ids)
      : Promise.resolve({ data: [] as { tutorial_id: string; user_id: string; completed_at: string }[] }),
    createAdminClient().from("account_members").select("user_id").eq("account_id", account.id),
  ]);

  // Nur Nachweise AKTUELLER Mitglieder dieses Kontos zählen — wie der Schulungsnachweis auf der
  // Detailseite (Audit 24.09.: Liste „1 von 3“, Detail „0 von 3“, weil Ehemalige/fremde
  // Konten mitzählten). Die Nachweise Ehemaliger bleiben als Archiv gespeichert.
  const current = new Set((memberRows ?? []).map((m) => m.user_id as string));
  const rows = (completions ?? []).filter((c) => current.has(c.user_id));
  const memberCount = current.size;
  const teamDone = new Map<string, number>();
  const mine = new Map<string, string>(); // tutorial_id -> completed_at (nur meine)
  for (const c of rows) {
    teamDone.set(c.tutorial_id, (teamDone.get(c.tutorial_id) ?? 0) + 1);
    if (c.user_id === userId) mine.set(c.tutorial_id, c.completed_at);
  }
  const members = memberCount ?? 0;

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-8">
      <PageHeader
        title="Schulungen"
        description="Interne Anleitungen für Ihr Team – mit Schulungsnachweis."
        meta={list.length ? `${list.length} Schulung${list.length === 1 ? "" : "en"}` : undefined}
      />

      {list.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-card border-2 border-dashed border-[#e3d7c2] bg-card px-6 py-14 text-center">
          <span className="grid size-12 place-items-center rounded-full bg-violet-soft text-violet-text">
            <GraduationCap className="size-6" />
          </span>
          <h2 className="mt-4 text-base font-extrabold text-ink">Noch keine Schulungen</h2>
          {isMember ? (
            <p className="mx-auto mt-2 max-w-md text-sm font-semibold text-muted-foreground">
              Sobald Ihr Team Schulungen für Sie freigibt, erscheinen sie hier. Sie können sie dann
              durcharbeiten und als absolviert markieren.
            </p>
          ) : (
          <p className="mx-auto mt-2 max-w-md text-sm font-semibold text-muted-foreground">
            Schulungen sind Anleitungen für Ihr Team. Wählen Sie im Editor einer Anleitung
            oben bei der Zielgruppe „Team“ (zusätzlich oder statt „Hilfe-Seite (für alle)“) und
            veröffentlichen Sie sie. Danach steht sie hier, und Ihr Team kann sie als absolviert
            markieren.{!isPro(account) && " Schulungen mit Nachweis sind ab dem Pro-Tarif enthalten."}
          </p>
          )}
          {!isMember && (
            <Link
              href="/app"
              className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-ink px-4 py-2 text-[13px] font-extrabold text-white transition-transform hover:scale-[1.02]"
            >
              Zu den Anleitungen
            </Link>
          )}
        </div>
      ) : (
        <ul className="space-y-2.5">
          {list.map((t) => {
            const myAt = mine.get(t.id) ?? null;
            const doneCount = teamDone.get(t.id) ?? 0;
            return (
              <li key={t.id}>
                <Link
                  href={`/app/lernen/${t.id}`}
                  className="group flex items-center gap-3 rounded-card border-2 border-line bg-card p-4 transition-colors hover:border-[#e3d7c2]"
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-violet-soft text-violet-text">
                    <GraduationCap className="size-[18px]" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate text-sm font-extrabold text-ink group-hover:text-primary">
                        {t.title}
                      </h2>
                      {myAt ? (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-teal-soft px-2.5 py-[3px] text-[11px] font-black text-teal-text">
                          <Check className="size-3" /> Absolviert am {dateLongDe(myAt)}
                        </span>
                      ) : (
                        <span className="inline-flex shrink-0 items-center rounded-full bg-amber-soft px-2.5 py-[3px] text-[11px] font-black text-amber-text">
                          Offen
                        </span>
                      )}
                    </div>
                    {t.description && (
                      <p className="mt-0.5 line-clamp-1 text-[13px] font-semibold text-muted-foreground">
                        {t.description}
                      </p>
                    )}
                  </div>
                  {/* Am Handy kompakt „2/5“ statt ganz ausgeblendet (Audit 24.09.); Screenreader
                      bekommen immer den vollen Text. */}
                  <span
                    className="flex shrink-0 items-center gap-1 text-xs font-bold text-faint"
                    title={`${doneCount} von ${members} im Team`}
                  >
                    <Users className="size-3.5" />
                    <span aria-hidden className="tabular-nums sm:hidden">
                      {doneCount}/{members}
                    </span>
                    <span className="sr-only sm:not-sr-only">
                      {doneCount} von {members} im Team
                    </span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-faint transition-transform group-hover:translate-x-0.5" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
