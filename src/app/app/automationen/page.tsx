import Link from "next/link";
import { Zap, Globe, ChevronRight } from "lucide-react";
import { requireAccount } from "@/lib/account";
import { createClient } from "@/lib/supabase/server";
import { relativeDe } from "@/lib/format";
import { RunStatusBadge, effectiveRunStatus } from "@/components/app/automation-run-status";
import { countAutomationSteps } from "@/lib/automation-step-counts";
import { PageHeader } from "@/components/app/page-header";

/**
 * Automationen (Welle 36): dritte Produkt-Ebene. Liste der aufgezeichneten Abläufe,
 * die die Steply-Erweiterung AUSFÜHRT. Jede entsteht als Snapshot aus einer Sofort-
 * Aufnahme (Anleitungen → „Als Automation nutzen“). RSC: liest konto-scoped (RLS).
 */
export default async function AutomationenPage() {
  const { account } = await requireAccount();
  const supabase = await createClient();

  const { data: rows } = await supabase
    .from("automations")
    .select("id, title, site_domains, params, updated_at")
    .eq("account_id", account.id)
    .order("updated_at", { ascending: false });

  const automations = rows ?? [];
  const ids = automations.map((a) => a.id as string);

  // Schrittzahl (seitenweise, keine 1000er-Kappung) + NUR der jüngste Lauf je Automation
  // (je eine limit(1)-Abfrage, parallel — früher wurden ALLE Läufe aller Automationen geladen).
  const lastRun = new Map<string, { status: string; started_at: string }>();
  const [stepCount] = await Promise.all([
    countAutomationSteps(supabase, ids),
    Promise.all(
      ids.map(async (id) => {
        const { data } = await supabase
          .from("automation_runs")
          .select("status, started_at")
          .eq("automation_id", id)
          .order("started_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (data) {
          lastRun.set(id, {
            // Nie zurückgemeldete Läufe (> 1 h „running“) als „Abgebrochen“ zeigen.
            status: effectiveRunStatus(data.status as string, data.started_at as string | null),
            started_at: data.started_at as string,
          });
        }
      }),
    ),
  ]);

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-8">
      <PageHeader
        title="Automationen"
        description="Aufgezeichnete Abläufe, die die Steply-Erweiterung für Sie ausführt."
        meta={`${automations.length} Automation${automations.length === 1 ? "" : "en"}`}
      />

      {automations.length === 0 ? (
        <EmptyState />
      ) : (
        <ul className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
          {automations.map((a) => {
            const domains = Array.isArray(a.site_domains) ? (a.site_domains as string[]) : [];
            const pCount = Array.isArray(a.params) ? a.params.length : 0;
            const run = lastRun.get(a.id as string);
            return (
              <li key={a.id as string}>
                <Link
                  href={`/app/automationen/${a.id}`}
                  className="group flex h-full flex-col rounded-card border-2 border-line bg-card p-4 transition-colors hover:border-[#e3d7c2]"
                >
                  <div className="flex items-start gap-3">
                    <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent text-accent-foreground">
                      <Zap className="size-4.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <h2 className="line-clamp-2 break-words text-sm font-extrabold leading-[1.3] text-ink group-hover:text-primary">
                        {(a.title as string)?.trim() || "Automation"}
                      </h2>
                      <p className="mt-0.5 text-xs font-semibold text-faint">
                        {stepCount.get(a.id as string) ?? 0} Schritt
                        {(stepCount.get(a.id as string) ?? 0) === 1 ? "" : "e"} · {pCount}{" "}
                        {pCount === 1 ? "Angabe" : "Angaben"}
                      </p>
                    </div>
                    <ChevronRight className="mt-1 size-4 shrink-0 text-faint transition-transform group-hover:translate-x-0.5" />
                  </div>

                  {domains.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {domains.slice(0, 3).map((d) => (
                        <span
                          key={d}
                          className="flex items-center gap-1 rounded-full bg-secondary px-2 py-[3px] text-[10.5px] font-bold text-ink-2"
                        >
                          <Globe className="size-2.5" /> {d}
                        </span>
                      ))}
                      {domains.length > 3 && (
                        <span className="rounded-full bg-secondary px-2 py-[3px] text-[10.5px] font-bold text-faint">
                          +{domains.length - 3}
                        </span>
                      )}
                    </div>
                  )}

                  <div className="mt-auto flex items-center gap-2 pt-3 text-[11px] font-bold">
                    {run ? (
                      <>
                        <RunStatusBadge status={run.status} />
                        <span className="text-faint">{relativeDe(run.started_at)}</span>
                      </>
                    ) : (
                      <span className="text-faint">Noch nie ausgeführt</span>
                    )}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}

function EmptyState() {
  return (
    <div className="rounded-card border-2 border-dashed border-[#e3d7c2] bg-card px-6 py-14 text-center">
      <span className="mx-auto mb-4 grid size-12 place-items-center rounded-full bg-accent text-accent-foreground">
        <Zap className="size-6" />
      </span>
      <h2 className="text-base font-extrabold text-ink">Noch keine Automationen</h2>
      <p className="mx-auto mt-2 max-w-md text-sm font-semibold text-muted-foreground">
        Nehmen Sie einen Ablauf mit der Sofort-Anleitung auf und wandeln Sie ihn um: Bei
        den Anleitungen finden Sie im Menü einer Anleitung „Als Automation nutzen“.
      </p>
      <Link
        href="/app"
        className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-ink px-4 py-2 text-[13px] font-extrabold text-white transition-transform hover:scale-[1.02]"
      >
        Zu den Anleitungen
      </Link>
    </div>
  );
}
