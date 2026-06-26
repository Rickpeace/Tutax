"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Trash2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveEscalation } from "@/app/app/settings/eskalation/actions";

type Expert = { name: string; expertise: string; calendarUrl: string; email: string; phone: string };
type Initial = {
  enabled?: boolean;
  message?: string;
  contactName?: string;
  calendarUrl?: string;
  email?: string;
  phone?: string;
  experts?: Partial<Expert>[];
};

const emptyExpert = (): Expert => ({ name: "", expertise: "", calendarUrl: "", email: "", phone: "" });

export function EscalationForm({ initial }: { initial: Initial }) {
  const [enabled, setEnabled] = useState(!!initial.enabled);
  const [message, setMessage] = useState(initial.message ?? "");
  const [contactName, setContactName] = useState(initial.contactName ?? "");
  const [calendarUrl, setCalendarUrl] = useState(initial.calendarUrl ?? "");
  const [email, setEmail] = useState(initial.email ?? "");
  const [phone, setPhone] = useState(initial.phone ?? "");
  const [experts, setExperts] = useState<Expert[]>(
    (initial.experts ?? []).map((e) => ({ ...emptyExpert(), ...e })),
  );
  const [pending, start] = useTransition();

  const setExpert = (i: number, k: keyof Expert, v: string) =>
    setExperts((xs) => xs.map((x, idx) => (idx === i ? { ...x, [k]: v } : x)));

  const save = () =>
    start(async () => {
      try {
        await saveEscalation({ enabled, message, contactName, calendarUrl, email, phone, experts });
        toast.success("Gespeichert");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Fehler");
      }
    });

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-bold text-ink">Kontakt &amp; Eskalation</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Wenn der Chatbot eine Frage nicht beantworten kann, leitet er den Mandanten weiter –
          bei passendem Thema an die richtige Person.
        </p>
      </div>

      {/* Allgemein */}
      <section className="space-y-4 rounded-2xl border border-border bg-card p-5">
        <label className="flex items-center gap-2 text-sm font-medium text-ink">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="size-4 accent-primary"
          />
          Eskalation aktivieren
        </label>

        <div className="space-y-1.5">
          <Label>Hinweistext an Mandanten</Label>
          <Input value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Gerne helfen wir Ihnen persönlich weiter." />
        </div>

        <div>
          <h3 className="mb-1 text-sm font-bold text-ink">Allgemeiner Kontakt (Fallback)</h3>
          <p className="mb-3 text-xs text-muted-foreground">
            Wird genutzt, wenn keine passende Person gefunden wird.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Ansprechpartner / Team</Label>
              <Input value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="z. B. Team Kanzlei" />
            </div>
            <div className="space-y-1.5">
              <Label>Online-Kalender</Label>
              <Input value={calendarUrl} onChange={(e) => setCalendarUrl(e.target.value)} placeholder="https://calendly.com/…" />
            </div>
            <div className="space-y-1.5">
              <Label>E-Mail</Label>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="kanzlei@beispiel.de" />
            </div>
            <div className="space-y-1.5">
              <Label>Telefon</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+49 …" />
            </div>
          </div>
        </div>
      </section>

      {/* Experten */}
      <section className="space-y-3 rounded-2xl border border-border bg-card p-5">
        <div>
          <h3 className="font-bold text-ink">Ansprechpartner &amp; Schwerpunkte</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Tragen Sie Personen mit ihrem Schwerpunkt ein. Die KI wählt je nach Frage automatisch
            die passendste Person (z. B. Buchhaltungsfrage → die Buchhaltungs-Kollegin).
          </p>
        </div>

        {experts.length === 0 && (
          <p className="text-sm text-muted-foreground">Noch keine Personen – fügen Sie unten welche hinzu.</p>
        )}

        {experts.map((ex, i) => (
          <div key={i} className="space-y-2 rounded-xl border border-line-2 p-3">
            <div className="flex items-center gap-2">
              <Input
                value={ex.name}
                onChange={(e) => setExpert(i, "name", e.target.value)}
                placeholder="Name (z. B. Frau Müller)"
                className="flex-1"
              />
              <button
                type="button"
                onClick={() => setExperts((xs) => xs.filter((_, idx) => idx !== i))}
                className="flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-no-soft hover:text-no"
                aria-label="Person entfernen"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
            <Input
              value={ex.expertise}
              onChange={(e) => setExpert(i, "expertise", e.target.value)}
              placeholder="Schwerpunkt (z. B. Buchhaltung, Lohn, Immobiliensteuer)"
            />
            <div className="grid gap-2 sm:grid-cols-3">
              <Input value={ex.calendarUrl} onChange={(e) => setExpert(i, "calendarUrl", e.target.value)} placeholder="Kalender-Link" />
              <Input value={ex.email} onChange={(e) => setExpert(i, "email", e.target.value)} placeholder="E-Mail" />
              <Input value={ex.phone} onChange={(e) => setExpert(i, "phone", e.target.value)} placeholder="Telefon" />
            </div>
          </div>
        ))}

        <Button variant="outline" size="sm" onClick={() => setExperts((xs) => [...xs, emptyExpert()])}>
          <UserPlus className="size-4" /> Person hinzufügen
        </Button>
      </section>

      <Button onClick={save} disabled={pending}>
        Speichern
      </Button>
    </div>
  );
}
