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

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />

      {/* ===== HERO ===== */}
      <section className="relative overflow-hidden border-b border-border bg-dotgrid">
        <div className="mx-auto max-w-6xl px-5 pt-16 pb-14 sm:pt-24">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold text-ink-2">
            <span className="size-1.5 rounded-full bg-yes" /> Hilfe-Hub für Steuerkanzleien
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
            Hilfeseite im Look Ihrer Kanzlei. Ein Link. Kein iFrame. Kein Webdesigner.
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
            { k: "100 %", v: "im CI Ihrer Kanzlei" },
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

        <div className="mt-10 grid auto-rows-[minmax(0,1fr)] gap-3 sm:grid-cols-3">
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
          <BentoCell icon={ShieldCheck} t="Schwärzen (Blur)" d="Sensible Mandantendaten unkenntlich machen. DSGVO direkt im Editor." />
          <BentoCell icon={Layers} t="Gehostet im CI" d="Ihre Farben, Ihr Logo. Sieht aus wie Ihre Kanzlei – liegt aber bei uns." />
          <BentoCell icon={Smartphone} t="Mobil-first" d="Foto aufnehmen, zuschneiden, markieren – alles am Handy." />
          <BentoCell icon={Sparkles} t="KI übernimmt Ihr CI" d="Website-URL angeben, die KI leitet Farben & Schriften ab." soon />
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
              { n: "02", t: "Branden", d: "Logo und Farben Ihrer Kanzlei setzen – manuell oder per KI aus Ihrer Website." },
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

      {/* ===== CTA ===== */}
      <section className="mx-auto max-w-6xl px-5 py-20">
        <div className="relative overflow-hidden rounded-[2rem] border border-border bg-card p-10 sm:p-16">
          <div className="pointer-events-none absolute -right-10 -top-10 size-64 rounded-full bg-accent blur-3xl" />
          <div className="relative">
            <h2 className="max-w-2xl text-4xl font-bold leading-tight tracking-tight text-ink sm:text-5xl">
              Weniger Rückfragen. Mehr Zeit für Mandate.
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
            <div className="text-xs font-bold text-ink">Kanzlei Mertens</div>
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
