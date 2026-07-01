import Link from "next/link";
import {
  GitBranch,
  ScanSearch,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Layers,
  ArrowRight,
  ArrowUpRight,
  Check,
  CornerRightDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";
import { PLANS } from "@/lib/pricing";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />

      {/* ===== HERO ===== */}
      <section className="relative overflow-hidden border-b border-border bg-dotgrid">
        <div className="mx-auto max-w-6xl px-5 pt-16 pb-14 sm:pt-24">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold text-ink-2">
            <span className="size-1.5 rounded-full bg-yes" /> Hilfe-Hub für Organisationen
            <span className="text-line">·</span> DSGVO · EU
          </div>

          <h1 className="mt-6 max-w-4xl text-[2rem] font-bold leading-[1.08] tracking-tight text-ink break-words sm:text-6xl sm:leading-[0.98] lg:text-7xl">
            Jede Frage führt zur{" "}
            <span className="relative inline-block text-primary">
              passenden Antwort
              <svg
                className="absolute -bottom-1.5 left-0 hidden h-3 w-full text-yes sm:block"
                viewBox="0 0 300 12"
                preserveAspectRatio="none"
                fill="none"
              >
                <path d="M2 8 Q 80 2 150 6 T 298 5" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
              </svg>
            </span>
            .
          </h1>

          <p className="mt-7 max-w-xl text-lg text-ink-2">
            Bauen Sie klickbare Anleitungen mit Screenshots, Markierungen und{" "}
            <b className="font-semibold text-ink">Verzweigungen</b> – veröffentlicht als
            Hilfeseite im Look Ihrer Organisation. Ein Link. Kein iFrame. Kein Webdesigner.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button size="lg" nativeButton={false} render={<Link href="/signup" />}>
              Kostenlos starten <ArrowRight className="size-4" />
            </Button>
            <Button size="lg" variant="outline" nativeButton={false} render={<Link href="/anleitung" />}>
              So funktioniert&apos;s
            </Button>
          </div>

          {/* Produkt-Canvas */}
          <ProductCanvas />
        </div>
      </section>

      {/* ===== STAT-BAND ===== */}
      <section className="border-b border-border">
        <div className="mx-auto grid max-w-6xl divide-y divide-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          {[
            { k: "0 €", v: "Kostenlos starten" },
            { k: "1 Link", v: "statt iFrame-Chaos" },
            { k: "100 %", v: "im CI Ihrer Organisation" },
          ].map((s) => (
            <div key={s.v} className="px-5 py-8 text-center">
              <div className="font-display text-4xl font-bold text-ink">{s.k}</div>
              <div className="mt-1 text-sm text-muted-foreground">{s.v}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ===== FEATURES (Bento) ===== */}
      <section id="features" className="mx-auto max-w-6xl scroll-mt-20 px-5 py-20">
        <div className="flex items-end justify-between gap-4">
          <h2 className="max-w-md text-4xl font-bold tracking-tight text-ink">
            Werkzeuge, die mitdenken.
          </h2>
          <p className="hidden max-w-xs text-sm text-muted-foreground sm:block">
            Vom ersten Screenshot bis zur veröffentlichten Hilfeseite – ohne
            technisches Vorwissen.
          </p>
        </div>

        <div className="mt-10 grid gap-3 sm:auto-rows-[minmax(0,1fr)] sm:grid-cols-3">
          {/* Signature, groß */}
          <div className="relative overflow-hidden rounded-3xl border border-border bg-card p-6 sm:col-span-2 sm:row-span-2">
            <div className="flex size-11 items-center justify-center rounded-xl bg-accent text-primary">
              <GitBranch className="size-6" />
            </div>
            <h3 className="mt-4 text-2xl font-bold text-ink">Verzweigungen.</h3>
            <p className="mt-2 max-w-md text-ink-2">
              Eine Frage, mehrere Antworten – jede führt zum richtigen Schritt.
              Übersichtlich verschachtelt, nicht als Linien-Wirrwarr.
            </p>
            <MiniBranch />
          </div>

          <BentoCell icon={ScanSearch} t="Highlights & Lupe" d="Rechteck, Kreis, Pfeil – plus eine Lupe, die das markierte Element vergrößert." />
          <BentoCell icon={ShieldCheck} t="Schwärzen (Blur)" d="Sensible Kundendaten unkenntlich machen. DSGVO direkt im Editor." />
          <BentoCell icon={Layers} t="Gehostet im CI" d="Ihre Farben, Ihr Logo. Sieht aus wie Ihre Organisation – liegt aber bei uns." />
          <BentoCell icon={Smartphone} t="Mobil-first" d="Foto aufnehmen, zuschneiden, markieren – alles am Handy." />
          <BentoCell icon={Sparkles} t="KI übernimmt Ihr CI" d="Website-URL angeben, die KI leitet Farben & Schriften ab." />
        </div>
      </section>

      {/* ===== STEPS (dunkel) ===== */}
      <section id="how" className="scroll-mt-20 bg-ink text-white">
        <div className="mx-auto max-w-6xl bg-dotgrid-dark px-5 py-20">
          <h2 className="text-4xl font-bold tracking-tight text-white">
            In drei Schritten zur Hilfeseite.
          </h2>
          <div className="mt-12 grid gap-px overflow-hidden rounded-3xl border border-white/10 bg-white/10 md:grid-cols-3">
            {[
              { n: "01", t: "Aufbauen", d: "Schritte mit Screenshots, Highlights und Verzweigungen zusammenklicken." },
              { n: "02", t: "Branden", d: "Logo und Farben Ihrer Organisation setzen – manuell oder per KI aus Ihrer Website." },
              { n: "03", t: "Veröffentlichen", d: "Einen Link erhalten und auf Ihrer Website verlinken. Fertig." },
            ].map((s) => (
              <div key={s.n} className="bg-ink p-8">
                <div className="font-display text-5xl font-bold text-white/25">{s.n}</div>
                <div className="mt-4 text-xl font-bold text-white">{s.t}</div>
                <p className="mt-2 text-sm text-white/60">{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== PREISE ===== */}
      <section id="preise" className="scroll-mt-20 border-b border-border">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <div className="flex items-end justify-between gap-4">
            <h2 className="max-w-md text-4xl font-bold tracking-tight text-ink">
              Ein Preis, der mitwächst.
            </h2>
            <p className="hidden max-w-xs text-sm text-muted-foreground sm:block">
              Kostenlos starten, jederzeit upgraden. Keine Kreditkarte für den
              Anfang.
            </p>
          </div>

          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {PLANS.map((p) => (
              <div
                key={p.key}
                className={`flex flex-col rounded-3xl border bg-card p-6 ${
                  p.highlight
                    ? "border-primary shadow-[0_6px_24px_rgba(61,78,230,0.12)]"
                    : "border-border"
                }`}
              >
                {p.highlight && (
                  <span className="mb-2 inline-flex w-fit items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[11px] font-bold text-primary">
                    Beliebt
                  </span>
                )}
                <div className="font-bold text-ink">{p.name}</div>
                <div className="mt-1 flex items-baseline gap-1">
                  <span className="font-display text-3xl font-extrabold text-ink">
                    {p.price}
                  </span>
                  <span className="text-sm text-muted-foreground">{p.period}</span>
                </div>
                <ul className="mt-5 flex-1 space-y-2 text-sm text-ink-2">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-yes" /> {f}
                    </li>
                  ))}
                </ul>
                <div className="mt-6">
                  <Button
                    className="w-full"
                    variant={p.highlight ? "default" : "outline"}
                    nativeButton={false}
                    render={<Link href="/signup" />}
                  >
                    Kostenlos starten <ArrowRight className="size-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== FAQ ===== */}
      <section id="faq" className="mx-auto max-w-6xl scroll-mt-20 px-5 py-20">
        <h2 className="max-w-md text-4xl font-bold tracking-tight text-ink">
          Häufige Fragen.
        </h2>
        <div className="mt-10 grid gap-x-10 gap-y-8 sm:grid-cols-2">
          {FAQS.map((f) => (
            <div key={f.q}>
              <h3 className="font-bold text-ink">{f.q}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-2">{f.a}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ===== CTA ===== */}
      <section className="mx-auto max-w-6xl px-5 py-20">
        <div className="relative overflow-hidden rounded-[2rem] border border-border bg-card p-10 sm:p-16">
          <div className="pointer-events-none absolute -right-10 -top-10 size-64 rounded-full bg-accent blur-3xl" />
          <div className="relative">
            <h2 className="max-w-2xl text-4xl font-bold leading-tight tracking-tight text-ink sm:text-5xl">
              Weniger Rückfragen. Mehr Zeit fürs Wesentliche.
            </h2>
            <p className="mt-4 max-w-lg text-ink-2">
              Starten Sie kostenlos und veröffentlichen Sie Ihre erste Anleitung in
              Minuten.
            </p>
            <div className="mt-8">
              <Button size="lg" nativeButton={false} render={<Link href="/signup" />}>
                Jetzt loslegen <ArrowUpRight className="size-4" />
              </Button>
            </div>
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}

/* ---------- Daten ---------- */

const FAQS: { q: string; a: string }[] = [
  {
    q: "Was kostet Steply?",
    a: "Der Einstieg ist kostenlos: eine Hilfe-Seite mit bis zu 5 Tutorials, Highlights und Verzweigungen. Pro (29 €/Monat) hebt das Limit auf, bringt eigenes Logo, CI-Farben, den Hilfe-Chatbot und entfernt das Steply-Branding. Premium (79 €/Monat) ergänzt eigene Domain, Drift-Überwachung und Analytics.",
  },
  {
    q: "Brauche ich technisches Wissen?",
    a: "Nein. Sie klicken Schritte mit Screenshots, Markierungen und Ja/Nein-Verzweigungen zusammen – ganz ohne Code. Screenshots lassen sich direkt am Handy aufnehmen, zuschneiden und markieren.",
  },
  {
    q: "Wie steht es um DSGVO & Hosting?",
    a: "Steply wird in der EU betrieben. Sensible Bereiche in Screenshots können Sie direkt im Editor schwärzen (Blur). Die Chat-Antworten werden per KI erstellt – Endkunden werden darauf hingewiesen, keine personenbezogenen Daten einzugeben.",
  },
  {
    q: "Wie kommt die Hilfe auf meine Website?",
    a: "Jede veröffentlichte Anleitung erhält einen eigenen Link. Diesen verlinken Sie auf Ihrer Website, in E-Mails oder per Messenger – ganz ohne iFrame. Optional lässt sich die Seite auch einbetten.",
  },
  {
    q: "Kann ich mein CI nutzen?",
    a: "Ja. Logo und Farben legen Sie manuell fest – oder die KI übernimmt Ihr Corporate Design automatisch aus Ihrer Website. Die Hilfe-Seite sieht dann aus wie Ihre Organisation.",
  },
  {
    q: "Wie funktioniert Video → Tutorial?",
    a: "Sie nehmen Ihren Bildschirm mit Stimme auf. Sagen Sie „Schnitt“, um einen Schritt abzuschließen. Steply transkribiert, schneidet passende Screenshots und schlägt Titel, Text und Markierungen vor – Sie prüfen nur noch nach.",
  },
];

/* ---------- Bausteine ---------- */

function BentoCell({
  icon: Icon,
  t,
  d,
  soon,
}: {
  icon: typeof GitBranch;
  t: string;
  d: string;
  soon?: boolean;
}) {
  return (
    <div className="rounded-3xl border border-border bg-card p-6">
      <div className="flex size-10 items-center justify-center rounded-lg bg-accent text-primary">
        <Icon className="size-5" />
      </div>
      <div className="mt-3 flex items-center gap-2 font-bold text-ink">
        {t}
        {soon && (
          <span className="rounded-full bg-line-2 px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
            bald
          </span>
        )}
      </div>
      <p className="mt-1.5 text-sm text-ink-2">{d}</p>
    </div>
  );
}

function MiniBranch() {
  return (
    <div className="mt-6 space-y-2">
      <div className="flex items-center gap-2.5 rounded-xl border border-border bg-background p-2.5">
        <GitBranch className="size-4 text-primary" />
        <span className="text-sm font-semibold text-ink">App startet?</span>
      </div>
      <div className="branch-yes ml-2 rounded-xl pl-3">
        <div className="py-1.5">
          <span className="rounded-full bg-yes px-2.5 py-0.5 text-[11px] font-bold text-white">Ja</span>
        </div>
        <div className="mb-1 flex items-center gap-2 pb-1 text-sm text-muted-foreground">
          <CornerRightDown className="size-3.5" /> weiter mit: <b className="text-ink-2">Fertig</b>
        </div>
      </div>
      <div className="branch-no ml-2 rounded-xl pl-3">
        <div className="py-1.5">
          <span className="rounded-full bg-no px-2.5 py-0.5 text-[11px] font-bold text-white">Nein</span>
        </div>
        <div className="mb-1 flex items-center gap-2.5 rounded-xl border border-border bg-background p-2.5">
          <span className="flex size-7 items-center justify-center rounded-lg border border-line-2 bg-card text-xs text-muted-foreground">8</span>
          <span className="text-sm font-semibold text-ink">App neu installieren</span>
        </div>
      </div>
    </div>
  );
}

function ProductCanvas() {
  return (
    <div className="mt-14 grid items-center gap-5 rounded-3xl border border-border bg-card p-5 shadow-[0_30px_80px_-20px_rgba(16,21,36,0.25)] sm:p-8 lg:grid-cols-[1.3fr_1fr]">
      {/* Builder-Seite */}
      <div className="rounded-2xl border border-border bg-background/60 p-4">
        <div className="mb-3 flex items-center gap-2 text-xs font-semibold text-muted-foreground">
          <span className="size-2 rounded-full bg-no" />
          <span className="size-2 rounded-full bg-yes" />
          <span className="size-2 rounded-full bg-primary" />
          <span className="ml-1">Builder</span>
        </div>
        <MiniBranch />
      </div>

      {/* Viewer (Phone) */}
      <div className="mx-auto w-full max-w-[260px]">
        <div className="rounded-[1.6rem] border border-border bg-card p-3 shadow-xl">
          <div className="mb-2 flex items-center gap-2 border-b border-line-2 pb-2">
            <div className="flex size-7 items-center justify-center rounded-lg bg-primary text-xs font-bold text-white">M</div>
            <div className="text-xs font-bold text-ink">Muster GmbH</div>
            <span className="ml-auto text-[10px] text-muted-foreground">Hilfe</span>
          </div>
          <div className="aspect-[4/3] rounded-lg bg-[#0c1322] p-2">
            <div className="flex h-full flex-col gap-1.5">
              {["Face ID", "App Login", "Mitteilungen"].map((r, i) => (
                <div
                  key={r}
                  className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-[10px] ${
                    i === 0 ? "bg-primary/20 ring-1 ring-primary" : "bg-white/5"
                  }`}
                >
                  <span className="text-white/80">{r}</span>
                  <span className="ml-auto text-white/40">{i === 0 ? "Ein" : "Aus"}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-2 text-sm font-bold text-ink">Face ID aktivieren</div>
          <p className="text-xs text-muted-foreground">Schalter antippen, mit Gesicht bestätigen.</p>
          <div className="mt-2 flex gap-1.5">
            <span className="flex-1 rounded-lg border-2 border-yes py-1.5 text-center text-xs font-bold text-yes">Ja</span>
            <span className="flex-1 rounded-lg border-2 border-no py-1.5 text-center text-xs font-bold text-no">Nein</span>
          </div>
        </div>
      </div>
    </div>
  );
}
