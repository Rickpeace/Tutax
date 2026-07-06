import Link from "next/link";
import { Zap, Globe, ChevronRight } from "lucide-react";
import { requireAccount } from "@/lib/account";
import { createClient } from "@/lib/supabase/server";
import { relativeDe } from "@/lib/format";
import { RunStatusBadge } from "@/components/app/automation-run-status";

/**
 * Automationen (Welle 36): dritte Produkt-Ebene. Liste der aufgezeichneten Abläufe,
 * die die Steply-Extension AUSFÜHRT. Jede entsteht als Snapshot aus einer Sofort-
 * Aufnahme (Bibliothek → „Als Automation nutzen“). RSC: liest konto-scoped (RLS).
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

  // Schrittzahl + letzter Lauf je Automation: je EINE Query (kein N+1), in JS aggregiert.
  const stepCount = new Map<string, number>();
  const lastRun = new Map<string, { status: string; started_at: string }>();
  if (ids.length) {
    const [{ data: steps }, { data: runs }] = await Promise.all([
      supabase.from("automation_steps").select("automation_id").in("automation_id", ids),
      supabase
        .from("automation_runs")
        .select("automation_id, status, started_at")
        .in("automation_id", ids)
        .order("started_at", { ascending: false }),
    ]);
    for (const s of steps ?? []) {
      const k = s.automation_id as string;
      stepCount.set(k, (stepCount.get(k) ?? 0) + 1);
    }
    for (const r of runs ?? []) {
      const k = r.automation_id as string;
      if (!lastRun.has(k)) {
        lastRun.set(k, { status: r.status as string, started_at: r.started_at as string });
      }
    }
  }

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-black text-ink">Automationen</h1>
          <p className="mt-1 text-sm font-semibold text-muted-foreground">
            Aufgezeichnete Abläufe, die die Steply-Extension für Sie ausführt.
          </p>
        </div>
        <span className="text-[13px] font-bold text-faint">
          {automations.length} Automation{automations.length === 1 ? "" : "en"}
        </span>
      </div>

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
                        {(stepCount.get(a.id as string) ?? 0) === 1 ? "" : "e"} · {pCount} Parameter
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
        Nehmen Sie einen Ablauf mit der Sofort-Anleitung auf und wandeln Sie ihn hier um.
        In der Bibliothek finden Sie im Menü einer Anleitung „Als Automation nutzen“.
      </p>
      <Link
        href="/app"
        className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-ink px-4 py-2 text-[13px] font-extrabold text-background transition-transform hover:scale-[1.02]"
      >
        Zur Bibliothek
      </Link>
    </div>
  );
}
