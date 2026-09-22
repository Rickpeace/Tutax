import { connection } from "next/server";
import { AlertTriangle, CheckCircle2, CircleDashed, XCircle } from "lucide-react";
import { DEV_LINKS, FLOWS, GAPS, SERVICES, type EnvVar, type Service } from "./inventory";

/**
 * Technik-Übersicht für Entwickler: Fremddienste, Datenflüsse, Lücken.
 * Env-Check zeigt NUR „gesetzt / fehlt" der Vercel-Umgebung — niemals Werte.
 */

const GROUPS: Service["group"][] = [
  "Datenbank & Dateien",
  "KI",
  "E-Mail",
  "Hosting & Betrieb",
  "Kleinere Dienste",
];

const PRIORITY_STYLE = {
  hoch: "bg-no-soft text-no",
  mittel: "bg-accent text-primary",
  niedrig: "bg-line-2 text-muted-foreground",
} as const;

function isSet(name: string): boolean {
  return Boolean(process.env[name]?.trim());
}

function EnvRow({ env }: { env: EnvVar }) {
  // Nur die Vercel-/App-Umgebung ist von hier aus prüfbar.
  const checkable = env.where === "vercel";
  const set = checkable && isSet(env.name);
  return (
    <li className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
      {!checkable ? (
        <CircleDashed className="size-3.5 shrink-0 text-faint" />
      ) : set ? (
        <CheckCircle2 className="size-3.5 shrink-0 text-yes" />
      ) : env.required ? (
        <XCircle className="size-3.5 shrink-0 text-no" />
      ) : (
        <AlertTriangle className="size-3.5 shrink-0 text-primary" />
      )}
      <code className="font-mono font-bold text-ink">{env.name}</code>
      <span className="text-faint">
        {env.where === "vercel" ? "Vercel" : env.where === "hetzner" ? "Hetzner" : "lokal"}
        {!env.required && " · optional"}
      </span>
      {checkable && (
        <span className={set ? "font-bold text-yes" : env.required ? "font-bold text-no" : "font-bold text-primary"}>
          {set ? "gesetzt" : "fehlt"}
        </span>
      )}
      {env.note && <span className="w-full pl-5 text-muted-foreground sm:w-auto sm:pl-0">— {env.note}</span>}
    </li>
  );
}

function ServiceCard({ s }: { s: Service }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="font-bold text-ink">{s.name}</h3>
        <span
          className={
            s.privacyWarning
              ? "rounded-md bg-no-soft px-2 py-0.5 text-[11px] font-bold text-no"
              : "rounded-md bg-line-2 px-2 py-0.5 text-[11px] font-bold text-muted-foreground"
          }
        >
          {s.region}
        </span>
      </div>
      <p className="mt-1 text-sm text-ink-2">{s.purpose}</p>
      <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm text-muted-foreground">
        {s.details.map((d) => (
          <li key={d}>{d}</li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {s.code.map((c) => (
          <code key={c} className="rounded-md bg-line-2 px-1.5 py-0.5 font-mono text-[11px] text-ink-2">
            {c}
          </code>
        ))}
      </div>
      {s.env.length > 0 && (
        <ul className="mt-3 space-y-1 border-t border-border pt-3">
          {s.env.map((e) => (
            <EnvRow key={`${e.where}:${e.name}`} env={e} />
          ))}
        </ul>
      )}
    </div>
  );
}

export default async function AdminTechnikPage() {
  // Env zur Laufzeit lesen (nicht beim Build einfrieren).
  await connection();

  const checkable = SERVICES.flatMap((s) => s.env).filter((e) => e.where === "vercel");
  const missingRequired = checkable.filter((e) => e.required && !isSet(e.name));
  const missingOptional = checkable.filter((e) => !e.required && !isSet(e.name));

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-8">
      <h1 className="text-xl font-bold text-ink">Technik-Übersicht</h1>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
        Für Entwickler: welche Fremddienste Steply nutzt, wie die Teile zusammenspielen und was
        noch fehlt. Die Konfigurations-Prüfung zeigt die <strong>aktuelle Umgebung</strong> (nur
        „gesetzt / fehlt“, nie Werte). Hetzner-Variablen sind von hier nicht prüfbar.
      </p>

      {/* Konfigurations-Ampel */}
      <section className="mt-6 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Fremddienste</p>
          <p className="mt-1 text-2xl font-black text-ink">{SERVICES.length}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Pflicht-Variablen fehlen</p>
          <p className={`mt-1 text-2xl font-black ${missingRequired.length ? "text-no" : "text-yes"}`}>
            {missingRequired.length}
          </p>
          {missingRequired.length > 0 && (
            <p className="mt-1 font-mono text-[11px] text-no">{missingRequired.map((e) => e.name).join(", ")}</p>
          )}
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Optionale fehlen</p>
          <p className={`mt-1 text-2xl font-black ${missingOptional.length ? "text-primary" : "text-yes"}`}>
            {missingOptional.length}
          </p>
          {missingOptional.length > 0 && (
            <p className="mt-1 font-mono text-[11px] text-primary">{missingOptional.map((e) => e.name).join(", ")}</p>
          )}
        </div>
      </section>

      {/* Architektur */}
      <section className="mt-10">
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">So hängt alles zusammen</h2>
        <div className="mt-3 overflow-x-auto rounded-xl border border-border bg-card p-4">
          <pre className="font-mono text-[12px] leading-relaxed text-ink-2">{`  Browser (App /app, Hilfe-Seite /h)      Chrome-Extension (Recorder, Führung, Automationen)
                 │                                   │  /api/recorder/*  (Pro-Person-Token)
                 ▼                                   ▼
        ┌──────────────────── Vercel: Next.js 16 App ────────────────────┐
        │  Server-Actions · API-Routen · Cron (Mo 6:00 /api/cron/drift)  │
        └───┬───────────────┬──────────────┬─────────────┬───────────────┘
            │               │              │             │
            ▼               ▼              ▼             ▼
       Supabase          OpenAI       ElevenLabs      Resend        thum.io / Google Fonts
   (DB·Auth·Storage   (Chat·Vision·     (TTS)        (Mails)
      ·pgvector)     Embeddings·TTS)
            ▲
            │ pollt video_jobs, schreibt Schritte zurück
   ┌────────┴──── Hetzner ────────────┐
   │ video-worker  → ffmpeg, Whisper  │
   │ agent-bridge  ↔ Telegram, Claude │
   └──────────────────────────────────┘`}</pre>
        </div>
      </section>

      {/* Abläufe */}
      <section className="mt-10">
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Wie es funktioniert</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {FLOWS.map((f) => (
            <div key={f.title} className="rounded-xl border border-border bg-card p-4">
              <h3 className="font-bold text-ink">{f.title}</h3>
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
                {f.steps.map((st) => (
                  <li key={st}>{st}</li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      </section>

      {/* Dienste */}
      {GROUPS.map((g) => (
        <section key={g} className="mt-10">
          <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">{g}</h2>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {SERVICES.filter((s) => s.group === g).map((s) => (
              <ServiceCard key={s.name} s={s} />
            ))}
          </div>
        </section>
      ))}

      <p className="mt-6 text-sm text-muted-foreground">
        <strong className="text-ink">Bewusst nicht vorhanden:</strong> Zahlungsanbieter (Tarife schaltet
        der Admin), Tracking/Analytics (Insights zählen in der eigenen DB), Error-Tracking.
      </p>

      {/* Lücken */}
      <section className="mt-10">
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Was noch fehlt</h2>
        <div className="mt-3 space-y-2">
          {GAPS.map((gap) => (
            <div
              key={gap.title}
              className="flex flex-wrap items-start gap-3 rounded-xl border border-border bg-card p-3"
            >
              <span className={`rounded-md px-2 py-0.5 text-xs font-bold ${PRIORITY_STYLE[gap.priority]}`}>
                {gap.priority}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-bold text-ink">{gap.title}</p>
                <p className="text-sm text-muted-foreground">{gap.why}</p>
              </div>
              <span className="text-xs font-bold text-faint">{gap.owner}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Für Entwickler */}
      <section className="mt-10">
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Für neue Entwickler</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="font-bold text-ink">Doku im Repo</h3>
            <ul className="mt-2 space-y-1 text-sm">
              {DEV_LINKS.map((l) => (
                <li key={l.path} className="flex flex-wrap gap-x-2">
                  <code className="font-mono text-[12px] font-bold text-ink">{l.path}</code>
                  <span className="text-muted-foreground">{l.label}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="font-bold text-ink">Arbeitsablauf</h3>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
              <li>Änderung auf <code className="font-mono text-ink">staging</code> → Vorschau-URL testen → nach <code className="font-mono text-ink">main</code> = live (Vercel).</li>
              <li><code className="font-mono text-ink">npm run build</code> muss grün sein, dazu die passenden <code className="font-mono text-ink">scripts/test-*-live.mjs</code>.</li>
              <li>Migrationen zuerst auf die Live-DB, erst dann Code pushen, der die neuen Spalten nutzt.</li>
              <li>Video-Worker/agent-bridge: nach dem Push einmal <code className="font-mono text-ink">deploy.sh</code> auf Hetzner.</li>
              <li>UI: shadcn auf Base UI (nicht Radix), Farben nur aus den Tokens in globals.css.</li>
            </ol>
          </div>
        </div>
      </section>
    </main>
  );
}
