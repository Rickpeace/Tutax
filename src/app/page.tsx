import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import {
  Check,
  MousePointerClick,
  Clapperboard,
  PencilLine,
  Languages,
  Volume2,
  Film,
  GitBranch,
  QrCode,
  RefreshCw,
  Palette,
  GraduationCap,
} from "lucide-react";
import { PLANS } from "@/lib/pricing";
import { Wordmark } from "@/components/wordmark";

export const metadata: Metadata = {
  title: "Steply – Einmal zeigen. Nie wieder erklären.",
  description:
    "Eine Aufgabe einmal durchklicken — Steply macht daraus eine Schritt-für-Schritt-Anleitung mit Bildern und Markierungen. Für Ihre Kunden und Ihr Team.",
};

/**
 * Marketing-Landing (Design-Handoff 07/2026, Option 4b Desktop / 5a mobil).
 * Sektionen in Handoff-Reihenfolge: Nav → Hero (+ Produkt-Shot mit echtem
 * Screenshot) → dunkle „So funktioniert's"-Sektion → „Eine Bibliothek — zwei
 * Welten" → Preise (Produkt-Notwendigkeit, im Handoff-Stil ergänzt) →
 * CTA-Karte + Mini-Footer.
 */
export default function LandingPage() {
  return (
    <main className="min-h-screen overflow-hidden bg-background text-ink">
      {/* Nav */}
      <header className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-4 sm:px-10 sm:py-[18px]">
        <Link href="/" aria-label="Steply">
          <Wordmark size="lg" />
        </Link>
        <nav className="ml-auto flex items-center gap-5 text-sm font-extrabold text-ink-2 sm:gap-6">
          <a href="#funktionen" className="hidden hover:text-ink sm:inline">
            Funktionen
          </a>
          <a href="#preise" className="hidden hover:text-ink sm:inline">
            Preise
          </a>
          <Link href="/login" className="hidden hover:text-ink sm:inline">
            Anmelden
          </Link>
          <Link
            href="/signup"
            className="shadow-hard rounded-full bg-primary px-4 py-2.5 text-[13px] font-extrabold text-white transition-all active:translate-y-[2px] active:shadow-[0_2px_0_var(--primary-pressed)] sm:px-5 sm:text-sm"
          >
            Kostenlos starten
          </Link>
        </nav>
      </header>

      {/* Hero */}
      <section className="relative px-4 pt-8 text-center sm:px-10 sm:pt-[52px]">
        <span className="inline-flex items-center gap-2 rounded-full border-2 border-line bg-card px-4 py-1.5 text-[11px] font-extrabold text-muted-foreground sm:text-[12.5px]">
          <span aria-hidden className="size-2 rounded-full bg-teal" />
          Neu: Anleitungen einfach beim Durchklicken aufnehmen
        </span>
        <h1 className="mx-auto mt-5 max-w-[760px] text-[33px] font-black leading-[1.1] tracking-[-0.02em] sm:text-[54px] sm:leading-[1.08]">
          Einmal zeigen. <span className="text-primary">Nie wieder erklären</span>.
        </h1>
        <p className="mx-auto mt-4 max-w-[300px] text-sm font-bold leading-relaxed text-muted-foreground sm:mt-[18px] sm:max-w-[560px] sm:text-[17px]">
          Führen Sie eine Aufgabe einmal am Bildschirm vor — Steply macht daraus
          eine Schritt-für-Schritt-Anleitung mit Bildern, Markierungen und Text.
          Für Ihre Kunden und Ihr Team.
        </p>
        <div className="mx-auto mt-6 flex max-w-md flex-col justify-center gap-2.5 sm:flex-row sm:gap-3">
          <Link
            href="/signup"
            className="rounded-full bg-primary px-7 py-3.5 text-[15px] font-extrabold text-white shadow-[0_5px_0_var(--primary-pressed)] transition-all active:translate-y-[2px] active:shadow-[0_2px_0_var(--primary-pressed)]"
          >
            Kostenlos starten
          </Link>
          <a
            href="/h/steply"
            target="_blank"
            rel="noreferrer"
            className="rounded-full border-2 border-line bg-card px-7 py-3.5 text-[15px] font-extrabold text-ink transition-colors hover:border-[#e3d7c2]"
          >
            Demo ansehen ▶
          </a>
        </div>
        <p className="mt-3 text-[10.5px] font-bold text-faint sm:text-xs">
          Keine Kreditkarte nötig · DSGVO-konform · Made in Germany
        </p>

        {/* Browser-Mockup mit echtem Produkt-Screenshot */}
        <div className="mx-auto mt-8 max-w-[880px] overflow-hidden rounded-t-[22px] border-2 border-b-0 border-line bg-card shadow-[0_-8px_40px_rgba(51,41,31,0.06)] sm:mt-[38px]">
          <div className="flex gap-1.5 border-b-2 border-line-2 px-4 py-3">
            <span className="size-2.5 rounded-full bg-line" />
            <span className="size-2.5 rounded-full bg-line" />
            <span className="size-2.5 rounded-full bg-line" />
          </div>
          <div className="relative">
            <Image
              src="/marketing-bibliothek.png"
              alt="Steply-Bibliothek: Anleitungen nach Kategorien"
              width={1440}
              height={1100}
              priority
              className="h-[220px] w-full object-cover object-top sm:h-[300px]"
            />
            <span className="absolute left-[8%] top-[18%] -rotate-3 whitespace-nowrap rounded-xl border-2 border-[#ffd2c7] bg-accent px-3 py-1.5 text-[10.5px] font-extrabold text-accent-foreground sm:left-[14%] sm:px-3.5 sm:py-2 sm:text-xs">
              Aus Video erkannt ✓
            </span>
            <span className="absolute right-[8%] top-[55%] rotate-2 whitespace-nowrap rounded-xl border-2 border-[#c2e8e1] bg-teal-soft px-3 py-1.5 text-[10.5px] font-extrabold text-teal-text sm:right-[12%] sm:px-3.5 sm:py-2 sm:text-xs">
              Öffentlich geteilt
            </span>
          </div>
        </div>
      </section>

      {/* So funktioniert's (dunkle Sektion) */}
      <section
        id="funktionen"
        className="bg-dark-section px-4 py-10 text-background sm:px-10 sm:py-[52px]"
      >
        <p className="text-center text-[11px] font-extrabold uppercase tracking-[0.1em] text-faint sm:text-[13px]">
          So funktioniert&#39;s
        </p>
        <h2 className="mx-auto mt-2 max-w-[600px] text-center text-[21px] font-black leading-tight text-background sm:mt-2.5 sm:text-[32px]">
          In drei Schritten zur fertigen Anleitung
        </h2>
        <div className="mx-auto mt-5 flex max-w-[1000px] flex-col gap-2.5 sm:mt-[34px] sm:grid sm:grid-cols-3 sm:gap-5">
          {[
            {
              n: "1",
              bg: "bg-primary",
              title: "Einmal vorführen",
              body: "Aufnahme starten und die Aufgabe ganz normal durchklicken — mehr nicht.",
            },
            {
              n: "2",
              bg: "bg-teal",
              title: "Steply schreibt mit",
              body: "Aus jedem Klick wird ein Schritt: Bild, Markierung und Text entstehen automatisch.",
            },
            {
              n: "3",
              bg: "bg-amber",
              title: "Teilen — intern oder öffentlich",
              body: "Fürs Team in der Bibliothek, für Kunden im eigenen Hilfe-Center.",
            },
          ].map((s) => (
            <div
              key={s.n}
              className="flex items-center gap-3.5 rounded-[15px] bg-dark-card p-3.5 sm:block sm:rounded-[20px] sm:p-6"
            >
              <span
                className={`grid size-[34px] shrink-0 place-items-center rounded-[11px] text-sm font-black text-white sm:size-[42px] sm:rounded-[13px] sm:text-[17px] ${s.bg}`}
              >
                {s.n}
              </span>
              <span className="block">
                <span className="block text-[13.5px] font-black text-background sm:mt-4 sm:text-[17px]">
                  {s.title}
                </span>
                <span className="mt-0.5 block text-[11.5px] font-semibold leading-relaxed text-dark-muted sm:mt-2 sm:text-[13.5px]">
                  {s.body}
                </span>
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Sofort-Anleitung per Extension (der Tango-Moment) */}
      <section className="px-4 py-10 sm:px-10 sm:py-[52px]">
        <div className="mx-auto grid max-w-[1000px] items-center gap-8 lg:grid-cols-[1fr_1.1fr] lg:gap-12">
          <div>
            <h2 className="text-[21px] font-black leading-tight sm:text-[32px]">
              Aufnehmen, während Sie arbeiten.
            </h2>
            <p className="mt-3 text-sm font-bold leading-relaxed text-muted-foreground sm:text-[15px]">
              Die kleine Steply-Erweiterung im Browser merkt sich jeden Klick —
              aus einem einzigen Durchlauf wird eine fertige Anleitung mit
              Bildern und Markierungen. Kein Video nötig, nichts zu schneiden.
            </p>
            <div className="mt-5 space-y-2.5">
              {[
                {
                  icon: MousePointerClick,
                  title: "Durchklicken (der schnellste Weg)",
                  body: "Aufnahme starten, Aufgabe einmal vorführen — fertig.",
                },
                {
                  icon: Clapperboard,
                  title: "Bildschirm-Video hochladen",
                  body: "Sie haben schon ein Video? Steply macht daraus die Schritte.",
                },
                {
                  icon: PencilLine,
                  title: "Selbst bauen",
                  body: "Bild, Markierung, Text — volle Kontrolle, Schritt für Schritt.",
                },
              ].map((w) => (
                <div
                  key={w.title}
                  className="flex items-start gap-3 rounded-[14px] border-2 border-line bg-card px-4 py-3"
                >
                  <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-[10px] bg-accent text-accent-foreground">
                    <w.icon className="size-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-black">{w.title}</span>
                    <span className="block text-[12.5px] font-semibold text-muted-foreground">
                      {w.body}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Browser-Mockup mit Klick-Marker (Viewer-Motiv) */}
          <div className="overflow-hidden rounded-[22px] border-2 border-line bg-card shadow-hard-line-lg">
            <div className="flex gap-1.5 border-b-2 border-line-2 px-4 py-3">
              <span className="size-2.5 rounded-full bg-line" />
              <span className="size-2.5 rounded-full bg-line" />
              <span className="size-2.5 rounded-full bg-line" />
            </div>
            <div
              className="relative grid h-[260px] place-items-center sm:h-[300px]"
              style={{
                background:
                  "repeating-linear-gradient(-45deg, #fff, #fff 11px, #faf5ea 11px, #faf5ea 22px)",
              }}
            >
              <span aria-hidden className="font-mono text-xs text-faint">
                ihre-software: rechnung anlegen
              </span>
              <span className="absolute right-[10%] top-[10%] rotate-2 whitespace-nowrap rounded-xl border-2 border-[#c2e8e1] bg-teal-soft px-3 py-1.5 text-[11px] font-extrabold text-teal-text">
                Schritt 3 erkannt ✓
              </span>
              <span className="absolute left-[34%] top-[52%]" aria-hidden>
                <span className="block size-[52px] rounded-full border-[3.5px] border-primary bg-primary/10 shadow-[0_0_0_8px_rgba(239,106,78,0.08)]" />
                <span className="absolute left-[60px] top-2 whitespace-nowrap rounded-[11px] bg-ink px-3 py-1.5 text-xs font-extrabold text-background">
                  Hier klicken
                </span>
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* KI-Hilfe-Chat + Wissensdatenbank */}
      <section className="px-4 pb-10 sm:px-10 sm:pb-[52px]">
        <div className="mx-auto grid max-w-[1000px] items-center gap-8 lg:grid-cols-[1.1fr_1fr] lg:gap-12">
          {/* Chat-Mockup */}
          <div className="order-2 rounded-[22px] border-2 border-line bg-card p-4 shadow-hard-line-lg sm:p-5 lg:order-1">
            <div className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-ink px-4 py-2.5 text-sm font-semibold text-background">
              Wie lade ich Belege ins Portal hoch?
            </div>
            <div className="mt-2.5 w-fit max-w-[90%] rounded-2xl rounded-bl-md bg-secondary px-4 py-2.5 text-sm font-semibold text-ink-2">
              Öffnen Sie im Portal den Bereich „Belege“ und tippen Sie auf
              „Hochladen“. Die Anleitung zeigt es Schritt für Schritt:
            </div>
            <div className="mt-2 flex w-fit items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-xs font-extrabold text-accent-foreground">
              Belege hochladen — Anleitung öffnen →
            </div>
            <div className="mt-4 border-t-2 border-line-2 pt-3 text-[11.5px] font-bold text-faint">
              Antwortet ausschließlich aus Ihren Inhalten — sonst sagt er es ehrlich
              und leitet an Sie weiter.
            </div>
          </div>

          <div className="order-1 lg:order-2">
            <h2 className="text-[21px] font-black leading-tight sm:text-[32px]">
              Ein Chat, der nur Ihre Inhalte kennt.
            </h2>
            <p className="mt-3 text-sm font-bold leading-relaxed text-muted-foreground sm:text-[15px]">
              Der Hilfe-Assistent auf Ihrer Hilfe-Seite antwortet aus Ihren
              Anleitungen und Ihrer Wissensdatenbank — nicht aus dem Internet.
            </p>
            <ul className="mt-5 space-y-2.5">
              {[
                "Wissensdatenbank füllt sich per Import aus Ihrer Website oder aus PDFs.",
                "Keine erfundenen Antworten: Was Steply nicht weiß, wird an Sie eskaliert.",
                "Unbeantwortete Fragen werden sichtbar — ein Klick macht daraus den Entwurf der fehlenden Anleitung.",
              ].map((t) => (
                <li
                  key={t}
                  className="flex items-start gap-2 text-sm font-semibold text-ink-2"
                >
                  <Check className="mt-0.5 size-4 shrink-0 text-teal" /> {t}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Eine Bibliothek — zwei Welten */}
      <section className="px-4 py-10 sm:px-10 sm:py-[52px]">
        <h2 className="mx-auto max-w-[640px] text-center text-[20px] font-black leading-tight sm:text-[32px]">
          Eine Bibliothek — zwei Welten
        </h2>
        <div className="mx-auto mt-4 flex max-w-[1000px] flex-col gap-2.5 sm:mt-[34px] sm:grid sm:grid-cols-2 sm:gap-5">
          <div className="relative overflow-hidden rounded-2xl bg-accent p-4 sm:rounded-[22px] sm:p-7">
            <span
              aria-hidden
              className="absolute -bottom-5 -right-5 size-[72px] rounded-full bg-[#ffd2c7] sm:-bottom-6 sm:-right-6 sm:size-[110px]"
            />
            <p className="relative text-[10px] font-extrabold uppercase tracking-[0.08em] text-primary-pressed sm:text-[11.5px]">
              Für Kunden
            </p>
            <h3 className="relative mt-1.5 max-w-[340px] text-[15px] font-black leading-snug sm:mt-2 sm:text-[21px]">
              Öffentliches Hilfe-Center im eigenen Branding
            </h3>
            <p className="relative mt-1.5 max-w-[340px] text-[11.5px] font-bold leading-relaxed text-accent-foreground sm:mt-2.5 sm:text-[13.5px]">
              Kunden öffnen Anleitungen ohne Login — sortiert nach Kategorien, mit
              Ihrer Marke.
            </p>
          </div>
          <div className="relative overflow-hidden rounded-2xl bg-violet-soft p-4 sm:rounded-[22px] sm:p-7">
            <span
              aria-hidden
              className="absolute -bottom-5 -right-5 size-[72px] rounded-full bg-[#ddd4fa] sm:-bottom-6 sm:-right-6 sm:size-[110px]"
            />
            <p className="relative text-[10px] font-extrabold uppercase tracking-[0.08em] text-violet-text sm:text-[11.5px]">
              Für Mitarbeiter
            </p>
            <h3 className="relative mt-1.5 max-w-[340px] text-[15px] font-black leading-snug sm:mt-2 sm:text-[21px]">
              Interne Bibliothek mit Rechten &amp; Kategorien
            </h3>
            <p className="relative mt-1.5 max-w-[340px] text-[11.5px] font-bold leading-relaxed text-violet-text sm:mt-2.5 sm:text-[13.5px]">
              Onboarding, HR, CRM — jede Abteilung findet ihre Abläufe, immer aktuell.
            </p>
          </div>
        </div>
      </section>

      {/* Feature-Grid: der lange Schwanz, kompakt */}
      <section className="px-4 pb-10 sm:px-10 sm:pb-[52px]">
        <h2 className="text-center text-[20px] font-black leading-tight sm:text-[32px]">
          Und alles drumherum.
        </h2>
        <div className="mx-auto mt-4 grid max-w-[1000px] grid-cols-1 gap-3 sm:mt-[34px] sm:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: Languages, soft: "var(--teal-soft)", text: "var(--teal-text)", title: "Mehrsprachig", body: "EN, PL, TR — Übersetzungen bleiben automatisch synchron." },
            { icon: Volume2, soft: "var(--violet-soft)", text: "var(--violet-text)", title: "Vorlesen", body: "Jeder Schritt als natürliche KI-Stimme." },
            { icon: Film, soft: "var(--accent)", text: "var(--coral-text)", title: "Video-Export", body: "Aus jeder Anleitung ein fertiges MP4 — die Umkehrung." },
            { icon: GitBranch, soft: "var(--amber-soft)", text: "var(--amber-text)", title: "Verzweigungen", body: "„Haben Sie schon ein Konto?“ — ein Guide, beide Wege." },
            { icon: QrCode, soft: "var(--accent)", text: "var(--coral-text)", title: "QR, Druck & Bubble", body: "Teilen, ausdrucken oder als Chat-Bubble einbetten." },
            { icon: RefreshCw, soft: "var(--teal-soft)", text: "var(--teal-text)", title: "Aktualitäts-Check", body: "Die KI meldet, wenn eine Anleitung veraltet wirkt." },
            { icon: Palette, soft: "var(--violet-soft)", text: "var(--violet-text)", title: "KI-Design", body: "Ihr CI, automatisch aus Ihrer Website abgeleitet." },
            { icon: GraduationCap, soft: "var(--amber-soft)", text: "var(--amber-text)", title: "Schulungsnachweis", body: "Wer im Team hat welche Schulung absolviert?" },
          ].map((f) => (
            <div
              key={f.title}
              className="rounded-2xl p-4"
              style={{ background: f.soft }}
            >
              <span
                className="grid size-8 place-items-center rounded-[10px] bg-white/70"
                style={{ color: f.text }}
              >
                <f.icon className="size-4" />
              </span>
              <h3 className="mt-2.5 text-sm font-black">{f.title}</h3>
              <p
                className="mt-1 text-[11.5px] font-bold leading-relaxed"
                style={{ color: f.text }}
              >
                {f.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Preise (im Handoff-Stil ergänzt — das Produkt hat drei Tarife) */}
      <section id="preise" className="px-4 pb-10 sm:px-10 sm:pb-[52px]">
        <h2 className="text-center text-[20px] font-black leading-tight sm:text-[32px]">
          Klare Preise
        </h2>
        <div className="mx-auto mt-4 flex max-w-[1000px] flex-col gap-3 sm:mt-[34px] sm:grid sm:grid-cols-3 sm:gap-5">
          {PLANS.map((p) => (
            <div
              key={p.key}
              className={`relative rounded-[22px] border-2 bg-card p-5 sm:p-6 ${
                p.highlight ? "border-primary shadow-[0_5px_0_#ffd2c7]" : "border-line"
              }`}
            >
              {p.highlight && (
                <span className="absolute -top-3 left-5 rounded-full bg-primary px-2.5 py-0.5 text-[10.5px] font-extrabold text-white">
                  Beliebt
                </span>
              )}
              <h3 className="text-[15px] font-black">{p.name}</h3>
              <p className="mt-1.5 text-[26px] font-black leading-none">
                {p.price}
                <span className="text-xs font-bold text-muted-foreground"> {p.period}</span>
              </p>
              <p className="mt-1 text-[11.5px] font-bold text-muted-foreground">
                {p.tagline}
              </p>
              <ul className="mt-3.5 space-y-1.5">
                {p.features.map((f) => (
                  <li
                    key={f}
                    className="flex items-start gap-1.5 text-[12.5px] font-semibold text-ink-2"
                  >
                    <Check className="mt-0.5 size-3.5 shrink-0 text-teal" /> {f}
                  </li>
                ))}
              </ul>
              <Link
                href="/signup"
                className={`mt-4 block rounded-full py-2.5 text-center text-[13px] font-extrabold transition-all ${
                  p.highlight
                    ? "shadow-hard bg-primary text-white active:translate-y-[2px] active:shadow-[0_2px_0_var(--primary-pressed)]"
                    : "border-2 border-line bg-background text-ink-2 hover:border-[#e3d7c2]"
                }`}
              >
                Kostenlos starten
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ — kompakt, native <details> (kein JS) */}
      <section className="px-4 pb-10 sm:px-10 sm:pb-[52px]">
        <h2 className="text-center text-[20px] font-black leading-tight sm:text-[32px]">
          Häufige Fragen
        </h2>
        <div className="mx-auto mt-4 max-w-[760px] space-y-2.5 sm:mt-[34px]">
          {[
            {
              q: "Wie lange dauert die erste Anleitung wirklich?",
              a: "Wenige Minuten: Aufnahme starten und die Aufgabe einmal durchklicken — oder ein Bildschirm-Video hochladen. Steply erzeugt Schritte, Bilder und Markierungen; Sie prüfen nur noch den Text.",
            },
            {
              q: "Brauchen meine Kunden ein Login?",
              a: "Nein. Ihr Hilfe-Center ist eine öffentliche Seite in Ihrem Branding — Link teilen oder QR-Code aufhängen genügt. Interne Anleitungen bleiben davon getrennt und sind nur fürs Team sichtbar.",
            },
            {
              q: "Kann der KI-Chat Dinge erfinden?",
              a: "Der Assistent antwortet ausschließlich aus Ihren Anleitungen und Ihrer Wissensdatenbank. Kennt er die Antwort nicht, sagt er das ehrlich und leitet die Frage an Sie weiter — Sie sehen alle offenen Fragen im Überblick.",
            },
            {
              q: "Passt das zu unserem Erscheinungsbild?",
              a: "Ja — Logo und Farben stellen Sie selbst ein, oder die KI leitet Ihr Design automatisch von Ihrer Website ab. Das Hilfe-Center wirkt wie Ihre eigene Seite, nicht wie ein Fremd-Tool.",
            },
            {
              q: "Was kostet Steply?",
              a: "Der Einstieg ist kostenlos (bis zu 5 Anleitungen, ohne Kreditkarte). Pro und Business gibt es ab 29 € im Monat — die Details stehen oben bei den Preisen.",
            },
          ].map((f) => (
            <details
              key={f.q}
              className="group rounded-[14px] border-2 border-line bg-card px-5 py-4 open:pb-5"
            >
              <summary className="flex cursor-pointer list-none items-center gap-3 text-sm font-black sm:text-[15px] [&::-webkit-details-marker]:hidden">
                <span className="flex-1">{f.q}</span>
                <span
                  aria-hidden
                  className="grid size-6 shrink-0 place-items-center rounded-full bg-secondary text-sm font-black text-muted-foreground transition-transform group-open:rotate-45"
                >
                  ＋
                </span>
              </summary>
              <p className="mt-2.5 text-[13.5px] font-semibold leading-relaxed text-muted-foreground">
                {f.a}
              </p>
            </details>
          ))}
        </div>
      </section>

      {/* CTA-Karte + Mini-Footer */}
      <section className="px-4 pb-10 text-center sm:px-10 sm:pb-14">
        <div className="shadow-hard-line-lg mx-auto max-w-[1000px] rounded-[18px] border-2 border-line bg-card px-5 py-6 sm:rounded-[26px] sm:p-11">
          <h2 className="text-[17px] font-black leading-snug sm:text-[30px]">
            Die erste Anleitung ist in 5 Minuten fertig.
          </h2>
          <div className="mt-4 flex flex-col justify-center gap-2.5 sm:mt-[22px] sm:flex-row sm:gap-3">
            <Link
              href="/signup"
              className="rounded-full bg-primary px-7 py-3.5 text-sm font-extrabold text-white shadow-[0_5px_0_var(--primary-pressed)] transition-all active:translate-y-[2px] active:shadow-[0_2px_0_var(--primary-pressed)] sm:text-[15px]"
            >
              Kostenlos starten
            </Link>
            <a
              href="#preise"
              className="rounded-full border-2 border-line bg-background px-7 py-3.5 text-sm font-extrabold text-ink-2 transition-colors hover:border-[#e3d7c2] sm:text-[15px]"
            >
              Preise ansehen
            </a>
          </div>
        </div>
        <footer className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[10.5px] font-bold text-faint sm:gap-[22px] sm:text-[12.5px]">
          <span className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="grid size-4 place-items-center rounded-full bg-primary text-[8px] font-black text-white"
            >
              S
            </span>
            Steply
          </span>
          <a href="/impressum" className="hover:underline">
            Impressum
          </a>
          <a href="/datenschutz" className="hover:underline">
            Datenschutz
          </a>
          <a href="mailto:kontakt@steply.de" className="hover:underline">
            Kontakt
          </a>
        </footer>
      </section>
    </main>
  );
}
