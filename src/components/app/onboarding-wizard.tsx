"use client";

import { useState, useTransition } from "react";
import { Sparkles, ArrowRight, Wand2, PencilLine, Palette } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { completeOnboarding, skipOnboarding } from "@/app/onboarding/actions";

export function OnboardingWizard({ initialName }: { initialName: string }) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState(initialName);
  const [website, setWebsite] = useState("");
  const [pending, startTransition] = useTransition();

  function finish() {
    startTransition(() => completeOnboarding({ name, websiteUrl: website }));
  }
  function skip() {
    startTransition(() => skipOnboarding());
  }

  return (
    <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-7 shadow-[0_10px_40px_rgba(16,21,36,0.08)]">
      {step === 0 ? (
        <div className="text-center">
          <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-accent text-primary">
            <Sparkles className="size-7" />
          </div>
          <h1 className="mt-4 text-2xl font-extrabold tracking-tight text-ink">
            Willkommen bei Steply 👋
          </h1>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
            In wenigen Minuten zur ersten klickbaren Hilfe-Anleitung – ganz im Look
            Ihrer Organisation. Lassen Sie uns kurz einrichten.
          </p>
          <div className="mt-6 space-y-2 text-left">
            {[
              { icon: PencilLine, t: "Anleitungen bauen", d: "Schritte, Screenshots, Verzweigungen" },
              { icon: Palette, t: "Im CI Ihrer Organisation", d: "Logo & Farben – manuell oder per KI" },
              { icon: Wand2, t: "Veröffentlichen & verlinken", d: "Ein Link auf Ihrer Website genügt" },
            ].map((f) => (
              <div key={f.t} className="flex items-center gap-3 rounded-lg border border-border p-3">
                <f.icon className="size-5 text-primary" />
                <div>
                  <div className="text-sm font-semibold text-ink">{f.t}</div>
                  <div className="text-xs text-muted-foreground">{f.d}</div>
                </div>
              </div>
            ))}
          </div>
          <Button className="mt-6 w-full" onClick={() => setStep(1)}>
            Los geht&apos;s <ArrowRight className="size-4" />
          </Button>
        </div>
      ) : (
        <div>
          <h1 className="text-xl font-bold text-ink">Kurz einrichten</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Diese Angaben können Sie später jederzeit ändern.
          </p>

          <div className="mt-5 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="ob-name">Name der Organisation</Label>
              <Input
                id="ob-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Muster GmbH"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ob-web">Website Ihrer Organisation (optional)</Label>
              <Input
                id="ob-web"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="https://www.muster-gmbh.de"
              />
              <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <Wand2 className="mt-0.5 size-3.5 text-primary" />
                Wir merken uns die Adresse. Sobald die KI-CI-Übernahme aktiv ist,
                rekonstruiert sie daraus Ihre Farben, Schriften und das Look &amp; Feel –
                auf Wunsch automatisch.
              </p>
            </div>
          </div>

          <div className="mt-6 flex items-center justify-between">
            <button
              type="button"
              onClick={skip}
              disabled={pending}
              className="text-sm font-medium text-muted-foreground hover:text-ink"
            >
              Überspringen
            </button>
            <Button onClick={finish} disabled={pending}>
              {pending ? "Wird gespeichert …" : "Fertig & loslegen"}
            </Button>
          </div>

          {/* Dogfooding-Verweis: unsere Doku ist selbst eine Steply-Hilfe-Seite. */}
          <p className="mt-5 border-t border-line-2 pt-4 text-center text-xs text-muted-foreground">
            Fragen zu Steply? Alle Funktionen erklären wir als klickbare Anleitungen in der{" "}
            <a
              href="/h/steply"
              target="_blank"
              className="font-medium text-primary underline underline-offset-2"
            >
              Steply-Hilfe
            </a>{" "}
            – Sie finden sie später jederzeit über das <b>?</b> oben rechts.
          </p>
        </div>
      )}
    </div>
  );
}
