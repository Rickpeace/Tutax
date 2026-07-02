import { MessageCircleQuestion } from "lucide-react";
import { requireAccount } from "@/lib/account";
import { dateDe } from "@/lib/format";
import { loadOpenGaps } from "@/lib/gaps";
import { GapAction } from "@/components/app/gap-action";

/**
 * Offene Fragen (Wissenslücken): unbeantwortete Chat-Fragen, die der Assistent nicht
 * beantworten konnte und die noch nicht in einen Entwurf überführt wurden. Bis zu 25,
 * dieselbe Quelle wie die Dashboard-Insights (loadOpenGaps). Pro Zeile: Frage, jüngstes
 * Datum und die „Entwurf erstellen“-Aktion (GapAction).
 */
export default async function FragenPage() {
  const { account } = await requireAccount();
  const gaps = await loadOpenGaps(account.id, 25);

  return (
    <>
      <div>
        <h2 className="text-lg font-bold text-ink">Offene Fragen</h2>
        <p className="text-sm text-muted-foreground">
          Das haben Kundinnen und Kunden gefragt, der Assistent konnte es aber nicht
          beantworten – ein Hinweis, wofür noch eine Anleitung fehlt.
        </p>
      </div>

      {gaps.length === 0 ? (
        <div className="mt-8 flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card px-6 py-16 text-center">
          <div className="flex size-12 items-center justify-center rounded-xl bg-accent text-primary">
            <MessageCircleQuestion className="size-6" />
          </div>
          <h3 className="mt-4 font-bold text-ink">
            Keine offenen Fragen – Ihr Assistent konnte bisher alles beantworten.
          </h3>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Hier erscheinen Chat-Fragen aus Ihrer Hilfe-Seite, auf die der Assistent
            keine Antwort in Ihren Tutorials und Ihrem Wissen gefunden hat (letzte
            30 Tage). Aus jeder Frage können Sie mit einem Klick einen Anleitungs-Entwurf
            erstellen.
          </p>
        </div>
      ) : (
        <ul className="mt-6 space-y-2">
          {gaps.map((g) => (
            <li
              key={g.question}
              className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-start sm:justify-between"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="flex min-w-0 items-start gap-2 text-sm text-ink-2">
                  <span className="min-w-0 flex-1">&bdquo;{g.question}&ldquo;</span>
                  {g.count > 1 && (
                    <span className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-primary tabular-nums">
                      {g.count}×
                    </span>
                  )}
                </span>
                <span className="text-xs text-muted-foreground">
                  Zuletzt gefragt am {dateDe(g.lastAt)}
                </span>
              </div>
              <GapAction question={g.question} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
