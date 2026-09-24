import Link from "next/link";
import { isPro } from "@/lib/plan";
import { AlertTriangle, ShieldCheck, PencilLine, ExternalLink } from "lucide-react";
import { requireAccount } from "@/lib/account";
import { createClient } from "@/lib/supabase/server";
import { relativeDe } from "@/lib/format";
import { AlertActions } from "@/components/app/alert-actions";
import { DriftIssues } from "@/components/app/drift-issues";
import { PageHeader } from "@/components/app/page-header";

type AlertRow = {
  id: string;
  severity: string;
  summary: string;
  details:
    | {
        affected_steps?: string[];
        issues?: { step?: string; problem?: string; suggestion?: string }[];
        sources?: { title?: string; url?: string }[];
      }
    | null;
  detected_at: string;
  tutorial_id: string;
  tutorials: { title: string } | null;
};

/** Dringlichkeit als deutscher Chip in den warmen Token-Farben. */
const SEVERITY: Record<string, { label: string; className: string }> = {
  critical: { label: "Dringend", className: "bg-no-soft text-no" },
  warning: { label: "Prüfen", className: "bg-amber-soft text-amber-text" },
  info: { label: "Hinweis", className: "bg-line-2 text-muted-foreground" },
};

/**
 * „Aktualität prüfen“ (/app/alerts): offene Hinweise der automatischen Prüfung —
 * Stellen in Anleitungen, die vermutlich nicht mehr zur Website passen. Dieselbe
 * Quelle wie der Abschnitt „Aktualität prüfen“ in der Glocke.
 */
export default async function AlertsPage() {
  const { account } = await requireAccount();
  const supabase = await createClient();
  const { data } = await supabase
    .from("change_alerts")
    .select("id, severity, summary, details, detected_at, tutorial_id, tutorials!inner(title, account_id)")
    .eq("tutorials.account_id", account.id)
    .eq("status", "open")
    .order("detected_at", { ascending: false });
  const alerts = (data ?? []) as unknown as AlertRow[];

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-8">
      <PageHeader
        title="Aktualität prüfen"
        description="Stellen in Ihren Anleitungen, die vermutlich nicht mehr zur Website passen – gefunden bei der automatischen Prüfung."
        meta={alerts.length ? `${alerts.length} offen` : undefined}
      />

      {alerts.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-card border-2 border-dashed border-[#e3d7c2] bg-card px-6 py-16 text-center">
          <div className="grid size-12 place-items-center rounded-full bg-yes-soft text-yes">
            <ShieldCheck className="size-6" />
          </div>
          <h2 className="mt-4 text-base font-extrabold text-ink">Alles aktuell</h2>
          <p className="mt-1 max-w-sm text-sm font-semibold text-muted-foreground">
            Keine offenen Hinweise. Im Editor einer Anleitung können Sie die Aktualität
            jederzeit selbst prüfen lassen.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {alerts.map((a) => {
            const sev = SEVERITY[a.severity] ?? SEVERITY.info;
            return (
              <div key={a.id} className="rounded-card border-2 border-line bg-card p-5">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl bg-amber-soft text-amber-text">
                    <AlertTriangle className="size-[18px]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full px-2.5 py-[3px] text-[11px] font-black ${sev.className}`}
                      >
                        {sev.label}
                      </span>
                      <Link
                        href={`/app/tutorials/${a.tutorial_id}`}
                        className="text-sm font-extrabold text-ink hover:text-primary"
                      >
                        {a.tutorials?.title ?? "Anleitung"}
                      </Link>
                      <span className="text-xs font-semibold text-faint">
                        · {relativeDe(a.detected_at)}
                      </span>
                    </div>
                    <p className="mt-1.5 text-sm font-semibold text-ink-2">{a.summary}</p>

                    {a.details?.issues?.length ? (
                      <DriftIssues alertId={a.id} issues={a.details.issues} canApply={isPro(account)} />
                    ) : a.details?.affected_steps?.length ? (
                      <ul className="mt-2 flex flex-wrap gap-1.5">
                        {a.details.affected_steps.map((s, i) => (
                          <li
                            key={i}
                            className="rounded-full bg-line-2 px-2.5 py-0.5 text-xs font-bold text-ink-2"
                          >
                            {s}
                          </li>
                        ))}
                      </ul>
                    ) : null}

                    {a.details?.sources?.length ? (
                      <div className="mt-3">
                        <div className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-faint">
                          Quellen
                        </div>
                        <ul className="mt-1 space-y-1">
                          {a.details.sources.map((s, i) => (
                            <li key={i}>
                              <a
                                href={s.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1 text-xs font-bold text-primary hover:underline"
                              >
                                <ExternalLink className="size-3 shrink-0" />
                                <span className="truncate">{s.title || s.url}</span>
                              </a>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                      <Link
                        href={`/app/tutorials/${a.tutorial_id}`}
                        className="flex items-center gap-1 text-xs font-extrabold text-primary hover:underline"
                      >
                        <PencilLine className="size-3.5" /> Im Editor öffnen
                      </Link>
                      <AlertActions id={a.id} />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
