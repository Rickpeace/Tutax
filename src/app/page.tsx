import Link from "next/link";
import Image from "next/image";
import {
  GitBranch,
  ScanSearch,
  ShieldCheck,
  Smartphone,
  Sparkles,
  ArrowRight,
  ArrowUpRight,
  Check,
  CornerRightDown,
  Mic,
  Scissors,
  Wand2,
  MonitorPlay,
  Link2,
  QrCode,
  MessageCircle,
  GraduationCap,
  RefreshCw,
  Search,
  MousePointerClick,
  FileVideo,
  Bot,
  Users,
  Camera,
  Crop,
  ChevronRight,
  Layers,
  Languages,
  Volume2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";
import { CompareSlider } from "@/components/marketing/compare-slider";
import { PLANS } from "@/lib/pricing";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />

      {/* ===== HERO ===== */}
      <section className="relative overflow-hidden border-b border-border bg-dotgrid">
        {/* Farbglühen hinter dem Produktbild */}
        <div className="pointer-events-none absolute left-1/2 top-24 h-[480px] w-[900px] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
        <div className="pointer-events-none absolute -right-24 top-64 size-72 rounded-full bg-yes/10 blur-3xl" />

        <div className="relative mx-auto max-w-6xl px-5 pt-16 pb-0 sm:pt-24">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold text-ink-2">
            <span className="size-1.5 rounded-full bg-yes" /> Für jede Organisation mit
            Erklärbedarf <span className="text-line">·</span> DSGVO · EU
          </div>

          <h1 className="mt-6 max-w-4xl text-[2rem] font-bold leading-[1.08] tracking-tight text-ink break-words sm:text-6xl sm:leading-[0.98] lg:text-7xl">
            Einmal zeigen.{" "}
            <span className="relative inline-block text-primary">
              Nie wieder erklären.
              <svg
                className="absolute -bottom-1.5 left-0 hidden h-3 w-full text-yes sm:block"
                viewBox="0 0 300 12"
                preserveAspectRatio="none"
                fill="none"
              >
                <path d="M2 8 Q 80 2 150 6 T 298 5" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
              </svg>
            </span>
          </h1>

          <p className="mt-7 max-w-xl text-lg text-ink-2">
            Steply macht aus einer <b className="font-semibold text-ink">Bildschirm-Aufnahme</b>{" "}
            eine klickbare Schritt-für-Schritt-Anleitung – veröffentlicht auf Ihrer eigenen
            Hilfe-Seite im Look Ihrer Organisation. Mit KI-Chat, der{" "}
            <b className="font-semibold text-ink">nur Ihre Inhalte</b> kennt.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button size="lg" nativeButton={false} render={<Link href="/signup" />}>
              Kostenlos starten <ArrowRight className="size-4" />
            </Button>
            {/* Live-Demo = unsere eigene Steply-Hilfe (mit Steply gebaut, inkl. Vorlesen) — stärkster Beweis. */}
            <Button
              size="lg"
              variant="outline"
              nativeButton={false}
              render={<Link href="/h/steply" target="_blank" />}
            >
              Live-Demo ansehen <ArrowUpRight className="size-4" />
            </Button>
            <Button size="lg" variant="ghost" nativeButton={false} render={<Link href="/anleitung" />}>
              So funktioniert&apos;s
            </Button>
          </div>

          {/* Echtes Produkt: Demo-Hilfeseite im Browser-Rahmen + Wizard am Handy */}
          <div className="relative mt-14">
            <div className="relative mx-auto max-w-4xl">
              {/* Dogfooding: unsere eigene Hilfe-Seite, mit Steply gebaut. */}
              <BrowserFrame url="steply.app/h/steply">
                <Image
                  src="/marketing/hub-steply.webp"
                  alt="Die echte Steply-Hilfeseite mit Suchfeld, Kategorien und Chat – selbst mit Steply gebaut"
                  width={1280}
                  height={800}
                  priority
                  className="block w-full"
                />
              </BrowserFrame>

              {/* Schwebende Beweis-Chips */}
              <div className="absolute -left-4 top-10 hidden rotate-[-2deg] items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-xs font-semibold text-ink shadow-lg md:flex">
                <FileVideo className="size-4 text-primary" /> Video hochgeladen
                <span className="text-line">→</span>
                <span className="text-yes">6 Schritte erkannt</span>
              </div>
              <div className="absolute -right-2 top-[13%] hidden rotate-[2deg] items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-xs font-semibold text-ink shadow-lg md:flex">
                <ScanSearch className="size-4 text-primary" /> Markierung automatisch gesetzt
              </div>
            </div>

            {/* Wizard am Handy — überlappt den Browser-Rahmen */}
            <div className="absolute -bottom-10 right-0 hidden w-[230px] rotate-2 lg:block xl:-right-10">
              <div className="overflow-hidden rounded-[1.8rem] border-[6px] border-ink bg-ink shadow-2xl">
                <Image
                  src="/marketing/wizard-phone.webp"
                  alt="Klickbare Anleitung Schritt für Schritt am Smartphone"
                  width={390}
                  height={800}
                  className="block w-full"
                />
              </div>
            </div>
          </div>
        </div>
        {/* weicher Auslauf unter dem Bild */}
        <div className="h-14 bg-gradient-to-t from-background to-transparent" />
      </section>

      {/* ===== STAT-BAND ===== */}
      <section className="border-b border-border">
        <div className="mx-auto grid max-w-6xl divide-y divide-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          {[
            { k: "3 Min", v: "vom Video zur fertigen Anleitung" },
            { k: "1 Link", v: "statt PDF-Anhängen und Rückfragen" },
            { k: "100 %", v: "im CI Ihrer Organisation" },
          ].map((s) => (
            <div key={s.v} className="px-5 py-8 text-center">
              <div className="font-display text-4xl font-bold text-ink">{s.k}</div>
              <div className="mt-1 text-sm text-muted-foreground">{s.v}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ===== VIDEO → TUTORIAL (Signature-Feature) ===== */}
      <section id="video" className="scroll-mt-20 border-b border-border">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <div className="text-xs font-bold uppercase tracking-[0.18em] text-primary">
            Video → Tutorial
          </div>
          <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
            <h2 className="max-w-xl text-4xl font-bold tracking-tight text-ink">
              Reden Sie einfach. Steply baut mit.
            </h2>
            <p className="max-w-sm text-sm text-muted-foreground">
              Niemand schreibt gern Anleitungen. Also nehmen Sie einfach Ihren Bildschirm
              auf und erklären dabei – den Rest übernimmt die KI.
            </p>
          </div>

          <div className="mt-12 grid gap-10 lg:grid-cols-[1fr_1.1fr] lg:items-center">
            {/* Ablauf */}
            <ol className="space-y-8">
              <VideoStep
                icon={Mic}
                n="01"
                t="Aufnehmen"
                d={
                  <>
                    Bildschirm und Stimme, direkt im Browser – keine Software nötig. Sagen
                    Sie <b className="font-semibold text-ink">„Schnitt“</b>, wenn ein
                    Schritt fertig ist.
                  </>
                }
              />
              <VideoStep
                icon={Wand2}
                n="02"
                t="Zusehen"
                d={
                  <>
                    Die KI transkribiert, wählt die schärfsten Bilder und setzt
                    Markierungen. Die Anleitung{" "}
                    <b className="font-semibold text-ink">wächst live</b>, Schritt für
                    Schritt.
                  </>
                }
              />
              <VideoStep
                icon={Check}
                n="03"
                t="Prüfen &amp; veröffentlichen"
                d={
                  <>
                    Sie korrigieren nur noch Details – mit „Bild aus Video wählen“ greifen
                    Sie jeden beliebigen Moment als Screenshot ab. Dann: veröffentlichen.
                  </>
                }
              />
            </ol>

            {/* Visual: Timeline -> entstehende Schritte */}
            <div className="rounded-3xl border border-border bg-card p-6 shadow-[0_24px_60px_-24px_rgba(16,21,36,0.25)]">
              <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                <MonitorPlay className="size-4 text-primary" /> aufnahme.webm · 2:47
              </div>
              {/* Timeline mit „Schnitt"-Markern */}
              <div className="relative mt-3 h-9 overflow-hidden rounded-lg bg-ink">
                <div className="absolute inset-y-0 left-0 w-2/3 bg-primary/25" />
                {[18, 37, 58, 79].map((x) => (
                  <div key={x} className="absolute inset-y-0" style={{ left: `${x}%` }}>
                    <div className="h-full w-0.5 bg-yes" />
                  </div>
                ))}
                <div className="absolute inset-y-0 left-2/3 flex items-center">
                  <div className="h-full w-0.5 bg-white" />
                </div>
                <div className="absolute bottom-1 left-2 flex items-center gap-1 text-[10px] font-bold text-white/70">
                  <Scissors className="size-3" /> „Schnitt“
                </div>
              </div>

              {/* Entstehende Schritte */}
              <div className="mt-4 space-y-2">
                {[
                  { n: 1, t: "Anmeldeseite öffnen", done: true },
                  { n: 2, t: "Zugangsdaten eingeben", done: true },
                  { n: 3, t: "Zwei-Faktor bestätigen", done: false },
                ].map((s) => (
                  <div
                    key={s.n}
                    className={`flex items-center gap-3 rounded-xl border p-3 ${
                      s.done ? "border-border bg-background" : "border-dashed border-primary/40 bg-accent/40"
                    }`}
                  >
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-lg border border-line-2 bg-card text-xs font-bold text-ink-2">
                      {s.n}
                    </span>
                    <span className="text-sm font-semibold text-ink">{s.t}</span>
                    <span className="ml-auto text-xs font-semibold">
                      {s.done ? (
                        <span className="flex items-center gap-1 text-yes">
                          <Check className="size-3.5" /> fertig
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-primary">
                          <Sparkles className="size-3.5" /> KI schreibt …
                        </span>
                      )}
                    </span>
                  </div>
                ))}
              </div>

              <p className="mt-4 flex items-start gap-2 rounded-xl bg-accent/50 p-3 text-xs text-ink-2">
                <MousePointerClick className="mt-0.5 size-4 shrink-0 text-primary" />
                <span>
                  Mit dem <b className="font-semibold text-ink">Steply Recorder</b> werden
                  sogar Ihre Klicks aufgezeichnet – Schrittgrenzen und Markierungen sitzen
                  dann pixelgenau.
                </span>
              </p>
            </div>
          </div>

          <div className="mt-8 flex flex-wrap gap-2 text-xs font-semibold text-ink-2">
            {["Bildschirm-Aufnahme im Browser", "Datei-Upload (auch mehrere auf einmal)", "Import per Video-URL", "Steply Recorder: Klicks + Direkt-Upload"].map((c) => (
              <span key={c} className="rounded-full border border-border bg-card px-3 py-1.5">
                {c}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ===== IHRE HILFE-SEITE ===== */}
      <section className="border-b border-border bg-card/50">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <div className="grid gap-10 lg:grid-cols-[1fr_1.15fr] lg:items-center">
            <div>
              <div className="text-xs font-bold uppercase tracking-[0.18em] text-primary">
                Ihre Hilfe-Seite
              </div>
              <h2 className="mt-3 max-w-md text-4xl font-bold tracking-tight text-ink">
                Sieht aus wie Sie. Arbeitet ohne Sie.
              </h2>
              <p className="mt-4 max-w-md text-ink-2">
                Jede Anleitung erscheint auf Ihrer eigenen Hilfe-Seite – ein Link, den Sie
                auf Website, E-Mail-Signatur oder Briefe setzen. Kein iFrame-Gefrickel,
                kein Webdesigner.
              </p>
              <ul className="mt-6 space-y-3 text-sm text-ink-2">
                {[
                  { icon: Sparkles, t: <>Die KI übernimmt Ihr CI automatisch von Ihrer Website – Farben, Schriften, Look &amp; Feel.</> },
                  { icon: Search, t: <>Semantische Suche: Wer „Geld zurück“ tippt, findet auch „Erstattung beantragen“.</> },
                  { icon: MessageCircle, t: <>Chat-Bubble für Ihre eigene Website – eine Zeile Code, KI-Hilfe überall.</> },
                  { icon: Languages, t: <>Mehrsprachig auf Knopfdruck: Englisch, Polnisch, Türkisch – automatisch übersetzt und immer synchron zum deutschen Original.</> },
                  { icon: Volume2, t: <>Vorlesen: jede Anleitung bekommt eine KI-Stimme – ein ▶ pro Schritt.</> },
                  { icon: QrCode, t: <>QR-Codes für Briefe und Aushänge, Druckansicht für alle, die Papier mögen.</> },
                  { icon: Link2, t: <>Verlinken, einbetten oder beides – Sie entscheiden.</> },
                ].map((f, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-accent text-primary">
                      <f.icon className="size-3.5" />
                    </span>
                    <span>{f.t}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              {/* Dieselbe Kanzlei-Hilfeseite, einmal Standard, einmal KI-Design — zum Ziehen. */}
              <CompareSlider
                beforeSrc="/marketing/ci-off.webp"
                beforeLabel="Steply-Standard"
                afterSrc="/marketing/ci-on.webp"
                afterLabel="KI-Design von Ihrer Website"
                width={1280}
                height={760}
                alt="Dieselbe Hilfe-Seite einer Kanzlei: links im Steply-Standard, rechts im automatisch übernommenen Corporate Design"
              />
              <p className="mt-3 text-center text-xs text-muted-foreground">
                Regler ziehen: dieselbe Hilfe-Seite – rechts das Design, das die KI
                automatisch aus der Website der Kanzlei übernommen hat.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ===== KI-ASSISTENT & INSIGHTS ===== */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <div className="text-xs font-bold uppercase tracking-[0.18em] text-primary">
            KI-Assistent &amp; Insights
          </div>
          <h2 className="mt-3 max-w-2xl text-4xl font-bold tracking-tight text-ink">
            Antwortet nur mit Ihrem Wissen. Und sagt Ihnen, was fehlt.
          </h2>
          <p className="mt-4 max-w-xl text-ink-2">
            Der Chat auf Ihrer Hilfe-Seite erfindet nichts dazu: Er antwortet ausschließlich
            aus Ihren Anleitungen und Ihrer Wissensdatenbank – und verweist sonst an den
            richtigen Ansprechpartner. Das Wissen füttern Sie bequem:{" "}
            <b className="font-semibold text-ink">Website einlesen lassen oder PDF/Word
            hochladen</b> – die KI macht Entwürfe daraus, Sie geben frei.
          </p>

          <div className="mt-10 grid gap-4 md:grid-cols-2">
            {/* Chat-Mock */}
            <div className="rounded-3xl border border-border bg-card p-6">
              <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                <Bot className="size-4 text-primary" /> Hilfe-Chat · Muster GmbH
              </div>
              <div className="mt-4 space-y-3">
                <div className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-4 py-2.5 text-sm text-white">
                  Wie richte ich die Zwei-Faktor-Anmeldung ein?
                </div>
                <div className="w-fit max-w-[90%] rounded-2xl rounded-bl-sm border border-border bg-background px-4 py-2.5 text-sm text-ink-2">
                  Öffnen Sie die Einstellungen und wählen Sie „Sicherheit“. Die Anleitung
                  führt Sie in 4 Schritten durch – inklusive Bildern:
                  <span className="mt-2 flex w-fit items-center gap-1.5 rounded-lg bg-accent px-2.5 py-1 text-xs font-bold text-primary">
                    Sicher anmelden: Passwort &amp; Zwei-Faktor <ArrowRight className="size-3" />
                  </span>
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  <span className="rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold text-ink-2">
                    📅 Termin buchen
                  </span>
                  <span className="rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold text-ink-2">
                    ✉️ E-Mail an Support
                  </span>
                </div>
              </div>
              <p className="mt-4 text-xs text-muted-foreground">
                Keine Antwort in Ihren Inhalten? Der Chat eskaliert an die Kontakte, die
                Sie festlegen – pro Fachgebiet.
              </p>
            </div>

            {/* Insights-Mock */}
            <div className="rounded-3xl border border-border bg-card p-6">
              <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                <Search className="size-4 text-primary" /> Offene Fragen · letzte 30 Tage
              </div>
              <div className="mt-4 space-y-2">
                {[
                  { q: "Wie ändere ich meine Bankverbindung?", n: "4×" },
                  { q: "Wo finde ich die Rechnung vom letzten Monat?", n: "2×" },
                ].map((g) => (
                  <div key={g.q} className="flex items-center gap-3 rounded-xl border border-border bg-background p-3">
                    <span className="min-w-0 flex-1 truncate text-sm text-ink-2">„{g.q}“</span>
                    <span className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-xs font-bold text-primary">
                      {g.n}
                    </span>
                    <span className="flex shrink-0 items-center gap-1 rounded-lg bg-primary px-2.5 py-1 text-xs font-bold text-white">
                      <Sparkles className="size-3" /> Entwurf erstellen
                    </span>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-sm text-ink-2">
                Fragen, die der Chat <b className="font-semibold text-ink">nicht</b>{" "}
                beantworten konnte, werden gesammelt. Ein Klick – und die KI baut den
                Anleitungs-Entwurf dazu.{" "}
                <b className="font-semibold text-ink">Ihre Hilfe lernt, was Kunden wirklich fragen.</b>
              </p>
              <p className="mt-3 flex items-start gap-2 rounded-xl bg-accent/50 p-3 text-xs text-ink-2">
                <RefreshCw className="mt-0.5 size-3.5 shrink-0 text-primary" />
                <span>
                  Der <b className="font-semibold text-ink">Aktualitäts-Autopilot</b>{" "}
                  prüft Ihre Anleitungen wöchentlich gegen das Web und meldet, wenn sich
                  z.&nbsp;B. eine Software-Oberfläche geändert hat.
                </span>
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ===== MITARBEITER-SCHULUNG ===== */}
      <section className="border-b border-border bg-card/50">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <div className="grid gap-10 lg:grid-cols-[1.15fr_1fr] lg:items-center">
            <div className="order-2 lg:order-1">
              <Image
                src="/marketing/schulung.webp"
                alt="Abgeschlossene interne Schulung mit „Als absolviert markieren“ und Schulungsnachweis-Tabelle"
                width={1280}
                height={860}
                className="block w-full rounded-2xl border border-border shadow-[0_30px_80px_-20px_rgba(16,21,36,0.3)]"
              />
            </div>
            <div className="order-1 lg:order-2">
              <div className="text-xs font-bold uppercase tracking-[0.18em] text-primary">
                Fürs Team: Prozesse &amp; Schulungen
              </div>
              <h2 className="mt-3 max-w-md text-4xl font-bold tracking-tight text-ink">
                Auch nach innen: Prozesse dokumentiert, Schulungen mit Nachweis.
              </h2>
              <p className="mt-4 max-w-md text-ink-2">
                Dieselben klickbaren Anleitungen funktionieren auch fürs eigene Team:
                Stellen Sie eine Anleitung auf <b className="font-semibold text-ink">„Intern“</b> –
                dann ist sie nur für Mitarbeitende sichtbar, nie auf der öffentlichen
                Hilfe-Seite.
              </p>
              <ul className="mt-6 space-y-3 text-sm text-ink-2">
                {[
                  { icon: Layers, t: <>Interne Prozesse als Klick-Anleitung: Onboarding, Urlaubsvertretung, „Wie machen wir X?“ – Schritt für Schritt statt Wiki-Friedhof.</> },
                  { icon: GraduationCap, t: <>Eigener „Lernen“-Bereich: Ihr Team sieht auf einen Blick, was offen und was absolviert ist.</> },
                  { icon: Check, t: <>„Als absolviert markieren“ – mit Datum. Ideal für Datenschutz- und Sicherheits-Unterweisungen.</> },
                  { icon: ShieldCheck, t: <>Schulungsnachweis für Sie als Inhaber: wer hat was wann absolviert – dokumentiert, falls jemand fragt.</> },
                ].map((f, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-accent text-primary">
                      <f.icon className="size-3.5" />
                    </span>
                    <span>{f.t}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ===== FEATURES (Bento) ===== */}
      <section id="features" className="mx-auto max-w-6xl scroll-mt-20 px-5 py-20">
        <div className="flex items-end justify-between gap-4">
          <h2 className="max-w-md text-4xl font-bold tracking-tight text-ink">
            Werkzeuge, die mitdenken.
          </h2>
          <p className="hidden max-w-xs text-sm text-muted-foreground sm:block">
            Vom ersten Screenshot bis zur veröffentlichten Hilfeseite – ohne technisches
            Vorwissen.
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

          <BentoCell icon={ScanSearch} t="Highlights & Lupe" d="Rechteck, Kreis, Pfeil – plus eine Lupe, die das markierte Element vergrößert.">
            <DemoHighlight />
          </BentoCell>
          <BentoCell icon={ShieldCheck} t="Schwärzen, das hält" d="Blur wird beim Veröffentlichen unwiderruflich ins Bild gebrannt. DSGVO ohne Bauchweh.">
            <DemoBlur />
          </BentoCell>
          <BentoCell icon={Users} t="Team & Organisationen" d="Gemeinsam pflegen: Inhaber und Bearbeiter, mehrere Organisationen – sauber getrennt.">
            <DemoTeam />
          </BentoCell>
          <BentoCell icon={RefreshCw} t="Bleibt aktuell" d="Der Autopilot prüft wöchentlich, ob Ihre Anleitungen noch stimmen.">
            <DemoAutopilot />
          </BentoCell>
          <BentoCell icon={Smartphone} t="Mobil-first" d="Foto aufnehmen, zuschneiden, markieren – alles am Handy.">
            <DemoMobile />
          </BentoCell>
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
              { n: "01", t: "Aufnehmen oder klicken", d: "Video aufnehmen und die KI bauen lassen – oder Schritte von Hand zusammenklicken. Beides geht." },
              { n: "02", t: "Branden", d: "Logo und Farben setzen – oder die KI übernimmt Ihr Corporate Design direkt von Ihrer Website." },
              { n: "03", t: "Veröffentlichen", d: "Link auf die Website, QR-Code in den Brief, Chat-Bubble ins Portal. Fertig." },
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
              Kostenlos starten, jederzeit upgraden. Keine Kreditkarte für den Anfang.
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
                <div className="text-xs text-muted-foreground">{p.tagline}</div>
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
      <section className="mx-auto max-w-6xl px-5 pb-20">
        <div className="relative overflow-hidden rounded-[2rem] border border-border bg-card p-10 sm:p-16">
          <div className="pointer-events-none absolute -right-10 -top-10 size-64 rounded-full bg-accent blur-3xl" />
          <div className="pointer-events-none absolute -bottom-16 left-1/4 size-56 rounded-full bg-yes/10 blur-3xl" />
          <div className="relative">
            <h2 className="max-w-2xl text-4xl font-bold leading-tight tracking-tight text-ink sm:text-5xl">
              Ihre erste Anleitung ist in 10 Minuten live.
            </h2>
            <p className="mt-4 max-w-lg text-ink-2">
              Kostenlos starten, Video hochladen oder Schritte klicken – und den Link
              teilen. Mehr ist es nicht.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button size="lg" nativeButton={false} render={<Link href="/signup" />}>
                Jetzt loslegen <ArrowUpRight className="size-4" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                nativeButton={false}
                render={<Link href="/h/steply" target="_blank" />}
              >
                Erst die Demo ansehen
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
    a: "Der Einstieg ist kostenlos: eine Hilfe-Seite mit bis zu 5 Tutorials, dem vollen Builder und 3 Video→Tutorials zum Antesten. Pro (29 €/Monat) hebt die Limits auf und bringt KI-Chatbot samt Wissensdatenbank, Chat-Bubble, Insights, eigenes Logo & Farben. Business (79 €/Monat) ergänzt das KI-Design von Ihrer Website, Mehrsprachigkeit, Vorlesen per KI-Stimme, den Aktualitäts-Autopiloten und interne Schulungen mit Nachweis.",
  },
  {
    q: "Wie funktioniert Video → Tutorial genau?",
    a: "Sie nehmen Ihren Bildschirm mit Stimme auf (oder laden ein vorhandenes Video hoch). Sagen Sie „Schnitt“, um einen Schritt abzuschließen. Steply transkribiert, wählt scharfe Screenshots, schlägt Titel, Texte und Markierungen vor – die Anleitung entsteht live, Sie prüfen nur noch nach. Mit der Recorder-Extension werden zusätzlich Ihre Klicks erfasst, dann sitzen Schrittgrenzen und Markierungen pixelgenau.",
  },
  {
    q: "Brauche ich technisches Wissen?",
    a: "Nein. Sie klicken Schritte mit Screenshots, Markierungen und Ja/Nein-Verzweigungen zusammen – ganz ohne Code. Screenshots lassen sich direkt am Handy aufnehmen, zuschneiden und markieren.",
  },
  {
    q: "Wie steht es um DSGVO & Hosting?",
    a: "Steply wird in der EU betrieben. Sensible Bereiche in Screenshots schwärzen Sie direkt im Editor – der Blur wird beim Veröffentlichen unwiderruflich in die Bilder gebrannt. Die Chat-Antworten werden per KI erstellt; Endkunden werden darauf hingewiesen, keine personenbezogenen Daten einzugeben.",
  },
  {
    q: "Erfindet der KI-Chat Antworten?",
    a: "Nein. Der Assistent antwortet ausschließlich aus Ihren veröffentlichten Anleitungen und Ihrer Wissensdatenbank. Findet er nichts, sagt er das ehrlich und verweist an die Ansprechpartner, die Sie hinterlegt haben – auf Wunsch pro Fachgebiet mit Terminbuchung, E-Mail und Telefon.",
  },
  {
    q: "Woher weiß ich, welche Anleitungen fehlen?",
    a: "Steply sammelt die Fragen, die der Chat nicht beantworten konnte, unter „Offene Fragen“. Ein Klick auf „Entwurf erstellen“ – und die KI baut das Anleitungs-Gerüst dazu. Dazu sehen Sie Aufrufe und „War das hilfreich?“-Feedback pro Hilfe-Seite.",
  },
  {
    q: "Können wir Steply auch intern nutzen?",
    a: "Ja. Anleitungen lassen sich auf „Intern“ stellen – dann sind sie nur für Ihr Team sichtbar, nie auf der öffentlichen Hilfe-Seite. Damit dokumentieren Sie interne Prozesse (Onboarding, Abläufe, Vertretungen) und führen Schulungen mit Nachweis durch: Sie sehen, wer was wann absolviert hat.",
  },
  {
    q: "Wie kommt die Hilfe auf meine Website?",
    a: "Jede veröffentlichte Anleitung erhält einen eigenen Link – verlinken Sie ihn auf Ihrer Website, in E-Mails oder per Messenger. Zusätzlich gibt es QR-Codes, eine Druckansicht und eine Chat-Bubble, die Sie mit einer Zeile Code auf Ihrer eigenen Website einbinden.",
  },
];

/* ---------- Bausteine ---------- */

function BrowserFrame({ url, children }: { url: string; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-[0_30px_80px_-20px_rgba(16,21,36,0.3)]">
      <div className="flex items-center gap-2 border-b border-border bg-background/70 px-4 py-2.5">
        <span className="size-2.5 rounded-full bg-no/70" />
        <span className="size-2.5 rounded-full bg-[#f7b955]" />
        <span className="size-2.5 rounded-full bg-yes/70" />
        <span className="ml-3 flex-1 truncate rounded-md border border-line-2 bg-card px-3 py-1 text-xs text-muted-foreground">
          {url}
        </span>
      </div>
      {children}
    </div>
  );
}

function VideoStep({
  icon: Icon,
  n,
  t,
  d,
}: {
  icon: typeof Mic;
  n: string;
  t: string;
  d: React.ReactNode;
}) {
  return (
    <li className="flex gap-4">
      <div className="flex flex-col items-center">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent text-primary">
          <Icon className="size-5" />
        </div>
        <div className="mt-2 w-px flex-1 bg-line-2 [li:last-child_&]:hidden" />
      </div>
      <div className="pb-2">
        <div className="flex items-baseline gap-2">
          <span className="font-display text-sm font-bold text-primary">{n}</span>
          <h3 className="text-lg font-bold text-ink">{t}</h3>
        </div>
        <p className="mt-1 max-w-md text-sm leading-relaxed text-ink-2">{d}</p>
      </div>
    </li>
  );
}

function BentoCell({
  icon: Icon,
  t,
  d,
  soon,
  children,
}: {
  icon: typeof GitBranch;
  t: string;
  d: string;
  soon?: boolean;
  /** Kleine Produkt-Miniatur am Kachel-Fuß (füllt den Weißraum mit Beweis). */
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col rounded-3xl border border-border bg-card p-6">
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
      {children && <div className="mt-auto pt-5">{children}</div>}
    </div>
  );
}

/* ---- Kachel-Miniaturen: kleine Produkt-Beweise statt leerem Weißraum ---- */

/** Markierter Button + Lupe, die ihn vergrößert. */
function DemoHighlight() {
  return (
    <div className="relative rounded-xl border border-border bg-background p-3 pb-9">
      <div className="h-2 w-3/5 rounded bg-line-2" />
      <div className="mt-1.5 h-2 w-2/5 rounded bg-line-2" />
      <div className="mt-3 inline-block rounded-md border-2 border-primary bg-card px-2.5 py-0.5 text-[11px] font-bold text-ink">
        Absenden
      </div>
      <div className="absolute bottom-2 right-3 rounded-full border-2 border-primary bg-card px-3.5 py-1.5 text-sm font-extrabold text-ink shadow-lg">
        Absenden
      </div>
    </div>
  );
}

/** Geblurte IBAN — das bleibt auch im veröffentlichten Bild so. */
function DemoBlur() {
  return (
    <div className="rounded-xl border border-border bg-background p-3 text-xs">
      <div className="flex items-center gap-2">
        <span className="font-semibold text-ink">IBAN</span>
        <span aria-hidden className="select-none rounded bg-ink/10 px-1.5 font-mono text-ink-2 [filter:blur(4px)]">
          DE89 3704 0044 05
        </span>
      </div>
      <div className="mt-2 flex items-center gap-1.5 text-[11px] font-semibold text-yes">
        <Check className="size-3.5" /> unwiderruflich – auch im Original
      </div>
    </div>
  );
}

/** Avatar-Stapel + Rollen. */
function DemoTeam() {
  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <div className="flex -space-x-2">
        {[
          ["A", "bg-primary"],
          ["L", "bg-yes"],
          ["M", "bg-ink"],
        ].map(([i, c]) => (
          <span
            key={i}
            className={`flex size-8 items-center justify-center rounded-full border-2 border-card text-xs font-bold text-white ${c}`}
          >
            {i}
          </span>
        ))}
      </div>
      <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-bold text-primary">Inhaber</span>
      <span className="rounded-full bg-line-2 px-2 py-0.5 text-[11px] font-bold text-muted-foreground">
        Bearbeiter
      </span>
    </div>
  );
}

/** Beispiel-Meldung des Aktualitäts-Checks. */
function DemoAutopilot() {
  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-border bg-background p-3 text-xs">
      <span className="mt-1 size-2 shrink-0 rounded-full bg-[#f7b955]" />
      <div>
        <div className="font-semibold text-ink">„Login-Maske hat sich geändert“</div>
        <div className="mt-0.5 text-muted-foreground">Schritt 3 prüfen · montags automatisch</div>
      </div>
    </div>
  );
}

/** Handy-Workflow in drei Chips. */
function DemoMobile() {
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-bold text-ink-2">
      <span className="flex items-center gap-1 rounded-full border border-border bg-background px-2 py-1">
        <Camera className="size-3 text-primary" /> Foto
      </span>
      <ChevronRight className="size-3 shrink-0 text-line" />
      <span className="flex items-center gap-1 rounded-full border border-border bg-background px-2 py-1">
        <Crop className="size-3 text-primary" /> Zuschnitt
      </span>
      <ChevronRight className="size-3 shrink-0 text-line" />
      <span className="flex items-center gap-1 rounded-full border border-border bg-background px-2 py-1">
        <ScanSearch className="size-3 text-primary" /> Markieren
      </span>
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
