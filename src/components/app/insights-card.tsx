import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ArrowRight, BarChart3, MessageCircleQuestion, ThumbsUp } from "lucide-react";
import { GapAction } from "@/components/app/gap-action";
import { loadOpenGaps } from "@/lib/gaps";

/**
 * Nutzungs-Karte unter den Anleitungen (letzte 30 Tage). Zeigt kompakt:
 * Aufrufe · Chat-Fragen · davon unbeantwortet · Feedback-Quote · und die
 * Top-3 unbeantworteten Fragen ("Das wurde gefragt, konnte aber nicht
 * beantwortet werden") — der Kern-Nutzwert: sagt der Firma, welche Anleitung fehlt.
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
    // Top-3 offene Fragen aus der geteilten Quelle (dieselbe Logik wie /app/assistent/fragen).
    topGaps,
  ] = await Promise.all([
    base().eq("type", "view"),
    base().eq("type", "chat"),
    // Nur UNERLEDIGTE (wie „Offene Fragen“) — nach „Entwurf erstellen“ blieb die Zahl sonst stehen.
    base().eq("type", "chat").eq("status", "no_answer").is("handled_at", null),
    base().eq("type", "feedback").eq("helpful", true),
    // „Ich komme hier nicht weiter“ ist KEIN Urteil über die ganze Anleitung → nicht in die Quote.
    base().eq("type", "feedback").eq("helpful", false).or("question.is.null,question.not.like.[Schritt]*"),
    loadOpenGaps(accountId, 3),
  ]);

  // „Ich komme hier nicht weiter“ (Hilfe-Seite): je Anleitung + Schritt zusammengefasst — vorher
  // sah die Organisation davon nur ein anonymes 👎 (Audit 24.09.).
  const { data: stuckRows } = await supabase
    .from("events")
    .select("tutorial_slug, question")
    .eq("account_id", accountId)
    .eq("type", "feedback")
    .eq("helpful", false)
    .like("question", "[Schritt]%")
    .gte("created_at", since)
    .limit(500);
  const stuckMap = new Map<string, { slug: string; step: string; count: number }>();
  for (const r of stuckRows ?? []) {
    const step = String(r.question ?? "").slice(9).trim() || "Schritt";
    const slug = String(r.tutorial_slug ?? "");
    const key = `${slug}::${step}`;
    const cur = stuckMap.get(key) ?? { slug, step, count: 0 };
    cur.count += 1;
    stuckMap.set(key, cur);
  }
  const stuck = [...stuckMap.values()].sort((a, b) => b.count - a.count).slice(0, 5);
  const stuckSlugs = [...new Set(stuck.map((s) => s.slug).filter(Boolean))];
  const { data: stuckTuts } = stuckSlugs.length
    ? await supabase.from("tutorials").select("id, title, slug").eq("account_id", accountId).in("slug", stuckSlugs)
    : { data: [] as { id: string; title: string; slug: string }[] };
  const tutBySlug = new Map((stuckTuts ?? []).map((t) => [t.slug as string, t]));

  const viewCount = views ?? 0;
  const chatCount = chats ?? 0;
  const unansweredCount = unanswered ?? 0;
  const upCount = up ?? 0;
  const downCount = down ?? 0;
  const feedbackTotal = upCount + downCount;

  // Nichts los -> Karte gar nicht zeigen (kein leerer Platzhalter).
  const anyEvents = viewCount + chatCount + feedbackTotal + stuck.length > 0;
  if (!anyEvents) return null;

  const feedbackPct =
    feedbackTotal > 0 ? Math.round((upCount / feedbackTotal) * 100) : null;

  return (
    <section className="mt-8 rounded-card border-2 border-line bg-card p-5" data-testid="insights-card">
      <div className="mb-4 flex items-center gap-2">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-primary">
          <BarChart3 className="size-4" />
        </div>
        <div>
          <h2 className="text-[17px] font-black leading-tight text-ink">Nutzung (letzte 30 Tage)</h2>
          <p className="text-[13px] font-semibold text-muted-foreground">
            Wie Ihre Anleitungen und der KI-Assistent genutzt werden.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Aufrufe" value={viewCount.toLocaleString("de-DE")} />
        <Stat
          label="Fragen an die KI"
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
          // Zählt Chat-Anfragen ohne Antwort (dieselbe Frage kann mehrfach kommen) — die
          // Liste „Offene Fragen“ fasst gleiche Fragen zusammen (Audit 23.09.: 2 vs. 1).
          hint="unbeantwortete Chat-Anfragen"
          icon={<MessageCircleQuestion className="size-3.5" />}
        />
      </div>

      {stuck.length > 0 && (
        <div className="mt-5 rounded-card border-2 border-line-2 bg-background/60 p-4" data-testid="insights-stuck">
          <h3 className="text-[13px] font-extrabold text-ink">Hier kamen Besucher nicht weiter</h3>
          <p className="mb-3 text-xs font-semibold text-muted-foreground">
            Klicks auf „Ich komme hier nicht weiter“ auf Ihrer Hilfe-Seite – diese Schritte lohnt es sich zu verbessern.
          </p>
          <ul className="space-y-2">
            {stuck.map((s) => {
              const tut = tutBySlug.get(s.slug);
              return (
                <li key={s.slug + s.step} className="flex items-start justify-between gap-3 text-sm font-semibold text-ink-2">
                  <span className="min-w-0 flex-1">
                    {tut ? (
                      <Link href={`/app/tutorials/${tut.id}`} className="font-extrabold text-ink hover:text-primary">
                        {tut.title}
                      </Link>
                    ) : (
                      <span className="font-extrabold text-ink">Anleitung</span>
                    )}
                    {" · "}&bdquo;{s.step}&ldquo;
                  </span>
                  <span className="shrink-0 rounded-full bg-accent px-2 py-[2px] text-[11px] font-black text-accent-foreground tabular-nums">
                    {s.count}×
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {topGaps.length > 0 && (
        <div className="mt-5 rounded-card border-2 border-line-2 bg-background/60 p-4">
          <h3 className="text-[13px] font-extrabold text-ink">
            Das wurde gefragt, konnte aber nicht beantwortet werden
          </h3>
          <p className="mb-3 text-xs font-semibold text-muted-foreground">
            Ein Hinweis, für welches Thema noch eine Anleitung fehlt.
          </p>
          <ul className="space-y-3">
            {topGaps.map((g) => (
              <li
                key={g.question}
                className="flex flex-col gap-2 text-sm font-semibold text-ink-2 sm:flex-row sm:items-start sm:justify-between"
              >
                <span className="flex min-w-0 flex-1 items-start gap-2">
                  <span className="min-w-0 flex-1">
                    &bdquo;{g.question}&ldquo;
                  </span>
                  {g.count > 1 && (
                    <span className="shrink-0 rounded-full bg-accent px-2 py-[2px] text-[11px] font-black text-accent-foreground tabular-nums">
                      {g.count}×
                    </span>
                  )}
                </span>
                <GapAction question={g.question} />
              </li>
            ))}
          </ul>
          <Link
            href="/app/assistent/fragen"
            className="mt-3 inline-flex items-center gap-1 text-xs font-extrabold text-muted-foreground hover:text-primary"
          >
            Alle offenen Fragen <ArrowRight className="size-3.5" />
          </Link>
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
    <div className="rounded-card border-2 border-line-2 bg-background/60 p-3">
      <div className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-[0.06em] text-faint">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-2xl font-black tabular-nums text-ink">{value}</div>
      {hint && <div className="mt-0.5 text-xs font-semibold text-muted-foreground">{hint}</div>}
    </div>
  );
}
