import Link from "next/link";
import { AlertTriangle, ShieldCheck, PencilLine, ExternalLink } from "lucide-react";
import { requireAccount } from "@/lib/account";
import { createClient } from "@/lib/supabase/server";
import { relativeDe } from "@/lib/format";
import { AlertActions } from "@/components/app/alert-actions";
import { DriftIssues } from "@/components/app/drift-issues";

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

const sev: Record<string, string> = {
  critical: "bg-no-soft text-no",
  warning: "bg-amber-100 text-amber-700",
  info: "bg-line-2 text-muted-foreground",
};

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
      <h1 className="text-xl font-bold text-ink">Hinweise</h1>
      <p className="text-sm text-muted-foreground">
        Mögliche Veralterungen, die der KI-Drift-Agent gefunden hat.
      </p>

      {alerts.length === 0 ? (
        <div className="mt-8 flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card px-6 py-16 text-center">
          <div className="flex size-12 items-center justify-center rounded-xl bg-yes-soft text-yes">
            <ShieldCheck className="size-6" />
          </div>
          <h2 className="mt-4 font-bold text-ink">Alles aktuell</h2>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Keine offenen Hinweise. Im Editor können Sie ein Tutorial jederzeit per
            „Jetzt prüfen“ checken.
          </p>
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {alerts.map((a) => (
            <div key={a.id} className="rounded-2xl border border-border bg-card p-5">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-no-soft text-no">
                  <AlertTriangle className="size-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${
                        sev[a.severity] ?? sev.info
                      }`}
                    >
                      {a.severity}
                    </span>
                    <Link
                      href={`/app/tutorials/${a.tutorial_id}`}
                      className="text-sm font-bold text-ink hover:text-primary"
                    >
                      {a.tutorials?.title ?? "Tutorial"}
                    </Link>
                    <span className="text-xs text-muted-foreground">
                      · {relativeDe(a.detected_at)}
                    </span>
                  </div>
                  <p className="mt-1.5 text-sm text-ink-2">{a.summary}</p>

                  {a.details?.issues?.length ? (
                    <DriftIssues alertId={a.id} issues={a.details.issues} />
                  ) : a.details?.affected_steps?.length ? (
                    <ul className="mt-2 flex flex-wrap gap-1.5">
                      {a.details.affected_steps.map((s, i) => (
                        <li key={i} className="rounded-md bg-muted px-2 py-0.5 text-xs text-ink-2">
                          {s}
                        </li>
                      ))}
                    </ul>
                  ) : null}

                  {a.details?.sources?.length ? (
                    <div className="mt-3">
                      <div className="text-xs font-bold text-muted-foreground">Quellen</div>
                      <ul className="mt-1 space-y-1">
                        {a.details.sources.map((s, i) => (
                          <li key={i}>
                            <a
                              href={s.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 text-xs text-primary hover:underline"
                            >
                              <ExternalLink className="size-3 shrink-0" />
                              <span className="truncate">{s.title || s.url}</span>
                            </a>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  <div className="mt-3 flex items-center justify-between">
                    <Link
                      href={`/app/tutorials/${a.tutorial_id}`}
                      className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                    >
                      <PencilLine className="size-3.5" /> Im Editor öffnen
                    </Link>
                    <AlertActions id={a.id} />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
