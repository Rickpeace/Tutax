import { createClient } from "@/lib/supabase/server";
import { BarChart3, MessageCircleQuestion, ThumbsUp } from "lucide-react";
import { GapAction } from "@/components/app/gap-action";

/**
 * Insights-Karte fürs Dashboard (letzte 30 Tage). Zeigt kompakt:
 * Aufrufe · Chat-Fragen · davon unbeantwortet · Feedback-Quote · und die
 * Top-3 unbeantworteten Fragen ("Das wurde gefragt, konnte aber nicht
 * beantwortet werden") — der Kern-Nutzwert: sagt der Firma, welches Tutorial fehlt.
 *
 * Rendert NULL, wenn es im Zeitraum überhaupt keine Events gibt. Liest über den
 * RLS-Client (Mitglieder sehen nur eigene Events); EINE gebündelte Abfrage-Runde
 * via Promise.all.
 */
export async function InsightsCard({ accountId }: { accountId: string }) {
  const supabase = await createClient();
  // Async Server Component (läuft einmal serverseitig) — Date.now ist hier legitim.
  // eslint-disable-next-line react-hooks/purity
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const base = () =>
    supabase
      .from("events")
      .select("*", { count: "exact", head: true })
      .eq("account_id", accountId)
      .gte("created_at", since);

  const [
    { count: views },
    { count: chats },
    { count: unanswered },
    { count: up },
    { count: down },
    { data: noAnswerRows },
  ] = await Promise.all([
    base().eq("type", "view"),
    base().eq("type", "chat"),
    base().eq("type", "chat").eq("status", "no_answer"),
    base().eq("type", "feedback").eq("helpful", true),
    base().eq("type", "feedback").eq("helpful", false),
    // Unbeantwortete Fragen im Klartext für die Top-3-Lücken-Liste.
    // Nur noch OFFENE Fragen: bereits in einen Entwurf überführte (handled_at gesetzt)
    // fliegen raus (Frage-Lücken-Miner, REVIEW H1).
    supabase
      .from("events")
      .select("question")
      .eq("account_id", accountId)
      .eq("type", "chat")
      .eq("status", "no_answer")
      .is("handled_at", null)
      .not("question", "is", null)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(300),
  ]);

  const viewCount = views ?? 0;
  const chatCount = chats ?? 0;
  const unansweredCount = unanswered ?? 0;
  const upCount = up ?? 0;
  const downCount = down ?? 0;
  const feedbackTotal = upCount + downCount;

  // Nichts los -> Karte gar nicht zeigen (kein leerer Platzhalter).
  const anyEvents = viewCount + chatCount + feedbackTotal > 0;
  if (!anyEvents) return null;

  // Top-3 unbeantwortete Fragen, case-insensitiv dedupliziert + gezählt.
  const dedup = new Map<string, { question: string; count: number }>();
  for (const r of noAnswerRows ?? []) {
    const raw = (r.question ?? "").trim();
    if (!raw) continue;
    const key = raw.toLowerCase();
    const e = dedup.get(key);
    if (e) e.count += 1;
    else dedup.set(key, { question: raw, count: 1 });
  }
  const topGaps = [...dedup.values()].sort((a, b) => b.count - a.count).slice(0, 3);

  const feedbackPct =
    feedbackTotal > 0 ? Math.round((upCount / feedbackTotal) * 100) : null;

  return (
    <section className="mt-6 rounded-2xl border border-border bg-card p-5">
      <div className="mb-4 flex items-center gap-2">
        <div className="flex size-8 items-center justify-center rounded-lg bg-accent text-primary">
          <BarChart3 className="size-4" />
        </div>
        <div>
          <h2 className="text-sm font-bold text-ink">Nutzung (letzte 30 Tage)</h2>
          <p className="text-xs text-muted-foreground">
            Wie Ihre Anleitungen und der Hilfe-Assistent genutzt werden.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Aufrufe" value={viewCount.toLocaleString("de-DE")} />
        <Stat
          label="Chat-Fragen"
          value={chatCount.toLocaleString("de-DE")}
          hint={
            chatCount > 0
              ? `davon unbeantwortet: ${unansweredCount.toLocaleString("de-DE")}`
              : undefined
          }
        />
        {feedbackPct !== null ? (
          <Stat
            label="Feedback-Quote"
            value={`${feedbackPct}%`}
            hint={`${upCount} 👍 · ${downCount} 👎`}
            icon={<ThumbsUp className="size-3.5" />}
          />
        ) : (
          <Stat label="Feedback" value="–" hint="noch keine Bewertung" />
        )}
        <Stat
          label="Wissenslücken"
          value={unansweredCount.toLocaleString("de-DE")}
          hint="offene Fragen"
          icon={<MessageCircleQuestion className="size-3.5" />}
        />
      </div>

      {topGaps.length > 0 && (
        <div className="mt-5 rounded-xl border border-line-2 bg-background/60 p-4">
          <h3 className="text-xs font-semibold text-ink">
            Das wurde gefragt, konnte aber nicht beantwortet werden
          </h3>
          <p className="mb-3 text-xs text-muted-foreground">
            Ein Hinweis, für welches Thema noch eine Anleitung fehlt.
          </p>
          <ul className="space-y-3">
            {topGaps.map((g) => (
              <li
                key={g.question}
                className="flex flex-col gap-2 text-sm text-ink-2 sm:flex-row sm:items-start sm:justify-between"
              >
                <span className="flex min-w-0 flex-1 items-start gap-2">
                  <span className="min-w-0 flex-1">
                    &bdquo;{g.question}&ldquo;
                  </span>
                  {g.count > 1 && (
                    <span className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-primary tabular-nums">
                      {g.count}×
                    </span>
                  )}
                </span>
                <GapAction question={g.question} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function Stat({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: string;
  hint?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-line-2 bg-background/60 p-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-2xl font-bold tabular-nums text-ink">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}
