"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Sparkles, ArrowRight, Wand2, PencilLine, Palette, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BusinessPill, FieldLabel, settingsInputClass } from "@/components/app/settings-ui";
import { completeOnboarding, skipOnboarding } from "@/app/onboarding/actions";
import { ORG_NAME_MAX } from "@/lib/text-limits";
import { isActionFailure } from "@/lib/action-error";
import { saveLanguages } from "@/app/app/settings/branding/actions";
import { EXTRA_LANGS, LANG_NAME, type ExtraLang } from "@/lib/i18n-hub";

export function OnboardingWizard({
  accountId,
  initialName,
  isBusiness,
  initialLanguages,
}: {
  /** Organisation, die eingerichtet wird (Schutz gegen Org-Wechsel in einem anderen Tab). */
  accountId: string;
  initialName: string;
  isBusiness: boolean;
  initialLanguages: ExtraLang[];
}) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState(initialName);
  const [website, setWebsite] = useState("");
  const [langs, setLangs] = useState<Set<ExtraLang>>(new Set(initialLanguages));
  const [pending, startTransition] = useTransition();

  function toggleLang(lang: ExtraLang, on: boolean) {
    setLangs((prev) => {
      const next = new Set(prev);
      if (on) next.add(lang);
      else next.delete(lang);
      return next;
    });
  }

  function finish() {
    startTransition(async () => {
      // Sprachen über die bestehende Branding-Action speichern (Server-Gate bleibt dort).
      // Nur Business-Konten können hier überhaupt etwas ausgewählt haben.
      if (isBusiness && langs.size > 0) {
        const res = await saveLanguages(accountId, [...langs]);
        if (!res.ok) {
          toast.error(res.error || "Sprachen konnten nicht gespeichert werden");
          return; // Onboarding NICHT abschließen, Nutzer kann korrigieren
        }
      }
      // Kein try/catch: der Erfolg endet in redirect("/app"). Ablehnung kommt als Rückgabewert.
      const done = await completeOnboarding(accountId, { name, websiteUrl: website });
      if (isActionFailure(done)) toast.error(done.userError);
    });
  }
  function skip() {
    startTransition(() => skipOnboarding(accountId));
  }

  return (
    // Optik wie im Rest der App (Welle 50c/54): rounded-card, 2px-Linien, warme Tokens.
    <div className="w-full max-w-lg rounded-card border-2 border-line bg-card p-7 shadow-[0_10px_40px_rgba(51,41,31,0.07)]">
      {step === 0 ? (
        <div className="text-center">
          <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-accent text-primary">
            <Sparkles className="size-7" />
          </div>
          <h1 className="mt-4 text-[26px] font-black leading-tight tracking-tight text-ink">
            Willkommen bei Steply 👋
          </h1>
          <p className="mx-auto mt-2 max-w-sm text-sm text-ink-2">
            In wenigen Minuten zur ersten klickbaren Hilfe-Anleitung – ganz im Look
            Ihrer Organisation. Lassen Sie uns kurz einrichten.
          </p>
          <div className="mt-6 space-y-2 text-left">
            {[
              { icon: PencilLine, t: "Anleitungen bauen", d: "Schritte, Screenshots, Verzweigungen" },
              { icon: Palette, t: "Im CI Ihrer Organisation", d: "Logo & Farben – manuell oder per KI" },
              { icon: Wand2, t: "Veröffentlichen & verlinken", d: "Ein Link auf Ihrer Website genügt" },
            ].map((f) => (
              <div
                key={f.t}
                className="flex items-center gap-3 rounded-xl border-2 border-line bg-background px-3.5 py-3"
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-primary">
                  <f.icon className="size-4" strokeWidth={2.2} />
                </span>
                <div className="min-w-0">
                  <div className="text-sm font-extrabold text-ink">{f.t}</div>
                  <div className="text-xs font-semibold text-muted-foreground">{f.d}</div>
                </div>
              </div>
            ))}
          </div>
          <Button className="mt-6 w-full" onClick={() => setStep(1)}>
            Los geht’s <ArrowRight className="size-4" />
          </Button>
        </div>
      ) : (
        <div>
          <h1 className="text-[22px] font-black leading-tight text-ink">Kurz einrichten</h1>
          <p className="mt-1 text-sm text-ink-2">
            Diese Angaben können Sie später jederzeit ändern.
          </p>

          <div className="mt-5 space-y-4">
            <div className="grid gap-1.5">
              <FieldLabel htmlFor="ob-name">Name der Organisation</FieldLabel>
              <input
                id="ob-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={ORG_NAME_MAX}
                placeholder="Muster GmbH"
                className={settingsInputClass}
              />
            </div>
            <div className="grid gap-1.5">
              <FieldLabel htmlFor="ob-web">Website Ihrer Organisation (optional)</FieldLabel>
              <input
                id="ob-web"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="https://www.muster-gmbh.de"
                className={settingsInputClass}
              />
              <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <Wand2 className="mt-0.5 size-3.5 text-primary" />
                Wir merken uns die Adresse. Sobald die KI-CI-Übernahme aktiv ist,
                rekonstruiert sie daraus Ihre Farben, Schriften und das Look &amp; Feel –
                auf Wunsch automatisch.
              </p>
            </div>

            {/* Sprachen (Welle 30): „damit das gleich am Anfang drin ist“. Business kann
                direkt anhaken; Free/Pro sehen die Auswahl als Teaser. Überspringbar. */}
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex items-center gap-1.5 text-[12.5px] font-extrabold text-ink-2">
                  <Globe className="size-3.5 text-primary" />
                  Sprachen Ihrer Hilfe-Seite
                </span>
                {!isBusiness && <BusinessPill />}
              </div>
              <p className="text-xs text-muted-foreground">
                In welchen Sprachen soll Ihre Hilfe-Seite erscheinen? Deutsch ist immer dabei.
              </p>
              <div className="space-y-2.5 rounded-xl border-2 border-line bg-background p-3">
                <label className="flex items-center gap-2.5 text-sm font-bold text-ink">
                  <input
                    type="checkbox"
                    checked
                    disabled
                    className="size-4 accent-[var(--primary)] opacity-70"
                  />
                  Deutsch
                  <span className="text-xs text-muted-foreground">(immer an)</span>
                </label>
                {EXTRA_LANGS.map((lang) => {
                  const on = langs.has(lang);
                  return (
                    <label
                      key={lang}
                      className={`flex items-center gap-2.5 text-sm font-bold text-ink ${
                        isBusiness ? "cursor-pointer" : "cursor-not-allowed"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={on}
                        disabled={!isBusiness || pending}
                        onChange={(e) => toggleLang(lang, e.target.checked)}
                        className="size-4 accent-[var(--primary)] disabled:opacity-50"
                      />
                      {LANG_NAME[lang]}
                    </label>
                  );
                })}
              </div>
              {!isBusiness && (
                <p className="text-xs text-muted-foreground">
                  Mehrsprachige Hilfe-Seite gibt es im Business-Tarif.{" "}
                  <Link
                    href="/app/settings/tarif"
                    className="font-extrabold text-primary underline underline-offset-2"
                  >
                    Mehr erfahren
                  </Link>
                </p>
              )}
            </div>
          </div>

          <div className="mt-6 flex items-center justify-between">
            <button
              type="button"
              onClick={skip}
              disabled={pending}
              className="rounded-full px-3 py-1.5 text-sm font-extrabold text-muted-foreground outline-none transition-colors hover:bg-line-2 hover:text-ink focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60"
            >
              Überspringen
            </button>
            <Button onClick={finish} disabled={pending}>
              {pending ? "Wird gespeichert …" : "Fertig & loslegen"}
            </Button>
          </div>

          {/* Dogfooding-Verweis: unsere Doku ist selbst eine Steply-Hilfe-Seite. */}
          <p className="mt-5 border-t-2 border-line-2 pt-4 text-center text-xs text-muted-foreground">
            Fragen zu Steply? Alle Funktionen erklären wir als klickbare Anleitungen in der{" "}
            <a
              href="/h/steply"
              target="_blank"
              className="font-extrabold text-primary underline underline-offset-2"
            >
              Steply-Hilfe
            </a>{" "}
            – Sie finden sie später jederzeit über Ihr Avatar-Menü oben rechts unter{" "}
            <b>Steply-Hilfe</b>.
          </p>
        </div>
      )}
    </div>
  );
}
