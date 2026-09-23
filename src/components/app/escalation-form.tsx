"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { CalendarClock, Mail, Pencil, Phone, Trash2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { CATEGORY_COLORS } from "@/lib/category-colors";
import {
  buildEscalationBox,
  DEFAULT_ESCALATION_MESSAGE,
  safeEmail,
  safeHttpUrl,
  safePhone,
  type EscalationSettings,
} from "@/lib/escalation";
import { t as hubText } from "@/lib/i18n-hub";
import { saveEscalation } from "@/app/app/settings/eskalation/actions";
import { unwrap, errorText } from "@/lib/action-error";

/**
 * „Persönlicher Kontakt" (Entwurf A + kompakte Personen-Karten aus Entwurf B, 22.09.2026):
 * Links Schalter mit Statuszeile, allgemeiner Kontakt, zuständige Personen als kompakte
 * Karten (einzeln aufklappbar); rechts eine Chat-Vorschau, die über buildEscalationBox
 * exakt die Kontaktbox zeigt, die auch /api/chat ausliefert.
 */

type Contact = { calendarUrl: string; email: string; phone: string };
type Person = Contact & { key: string; name: string; expertise: string };
type General = Contact & { contactName: string; message: string };

let keySeq = 0;
const newKey = () => `p${++keySeq}`;
const emptyPerson = (): Person => ({ key: newKey(), name: "", expertise: "", calendarUrl: "", email: "", phone: "" });

const hasContact = (c: Contact) => !!(safeHttpUrl(c.calendarUrl) || safeEmail(c.email) || safePhone(c.phone));

/** Fehlermeldung für ein Kontaktfeld (leer = ok). */
function fieldError(kind: keyof Contact, v: string): string | null {
  if (!v.trim()) return null;
  if (kind === "calendarUrl" && !safeHttpUrl(v)) return "Bitte den vollständigen Link mit https:// eingeben.";
  if (kind === "email" && !safeEmail(v)) return "Bitte eine gültige E-Mail-Adresse eingeben.";
  if (kind === "phone" && !safePhone(v)) return "Bitte eine gültige Telefonnummer eingeben.";
  return null;
}

const topicsOf = (expertise: string) =>
  expertise
    .split(/[,;]/)
    .map((t) => t.trim())
    .filter(Boolean);

const initials = (name: string) =>
  name
    .replace(/^(frau|herr|dr\.?)\s+/i, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("") || "?";

export function EscalationForm({
  initial,
  accountName,
}: {
  initial: EscalationSettings;
  accountName: string;
}) {
  const [enabled, setEnabled] = useState(!!initial.enabled);
  const [general, setGeneral] = useState<General>({
    contactName: initial.contactName ?? "",
    message: initial.message ?? "",
    calendarUrl: initial.calendarUrl ?? "",
    email: initial.email ?? "",
    phone: initial.phone ?? "",
  });
  const [people, setPeople] = useState<Person[]>(() =>
    (initial.experts ?? []).map((e) => ({
      key: newKey(),
      name: e.name ?? "",
      expertise: e.expertise ?? "",
      calendarUrl: e.calendarUrl ?? "",
      email: e.email ?? "",
      phone: e.phone ?? "",
    })),
  );
  const [openKey, setOpenKey] = useState<string | null>(null);
  // Hat der Nutzer den Schalter selbst bedient, schalten wir nie mehr automatisch ein.
  const [switchTouched, setSwitchTouched] = useState(false);
  const [pending, start] = useTransition();

  const settings: EscalationSettings = useMemo(
    () => ({
      enabled,
      ...general,
      experts: people.map((p) => ({
        name: p.name,
        expertise: p.expertise,
        calendarUrl: p.calendarUrl,
        email: p.email,
        phone: p.phone,
      })),
    }),
    [enabled, general, people],
  );
  const snapshot = (s: EscalationSettings) =>
    JSON.stringify({
      ...s,
      experts: (s.experts ?? []).filter((p) => Object.values(p).some((v) => String(v ?? "").trim())),
    });
  const [saved, setSaved] = useState(() =>
    snapshot({
      enabled: !!initial.enabled,
      contactName: initial.contactName ?? "",
      message: initial.message ?? "",
      calendarUrl: initial.calendarUrl ?? "",
      email: initial.email ?? "",
      phone: initial.phone ?? "",
      experts: (initial.experts ?? []).map((e) => ({
        name: e.name ?? "",
        expertise: e.expertise ?? "",
        calendarUrl: e.calendarUrl ?? "",
        email: e.email ?? "",
        phone: e.phone ?? "",
      })),
    }),
  );
  const dirty = snapshot(settings) !== saved;

  const anyContact = hasContact(general) || people.some(hasContact);
  const errors =
    (["calendarUrl", "email", "phone"] as const).some((k) => fieldError(k, general[k])) ||
    people.some((p) => (["calendarUrl", "email", "phone"] as const).some((k) => fieldError(k, p[k])));

  /** Erster Kontaktweg eingetragen -> automatisch einschalten (sonst passiert nie etwas). */
  const autoEnable = (nextHasContact: boolean) => {
    if (!enabled && !switchTouched && !anyContact && nextHasContact) setEnabled(true);
  };
  const setGeneralField = (k: keyof General, v: string) => {
    const next = { ...general, [k]: v };
    autoEnable(hasContact(next));
    setGeneral(next);
  };
  const setPersonField = (key: string, k: keyof Person, v: string) => {
    const next = people.map((p) => (p.key === key ? { ...p, [k]: v } : p));
    autoEnable(next.some(hasContact));
    setPeople(next);
  };

  const save = () =>
    start(async () => {
      try {
        unwrap(await saveEscalation(settings));
        setSaved(snapshot(settings));
        toast.success("Gespeichert");
      } catch (e) {
        toast.error(errorText(e, "Speichern fehlgeschlagen"));
      }
    });

  const status = !enabled
    ? { tone: "off", text: `Ausgeschaltet. Der Assistent zeigt keine Kontaktdaten und verweist nur allgemein an „${accountName}“.` }
    : !anyContact
      ? { tone: "off", text: "Eingeschaltet, aber noch ohne Kontaktweg. Tragen Sie unten mindestens eine E-Mail, Telefonnummer oder einen Termin-Link ein." }
      : { tone: "on", text: "Aktiv. Kunden sehen Ihre Kontaktdaten, wenn der Assistent eine Frage nicht beantworten kann." };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-extrabold text-ink">Persönlicher Kontakt</h2>
        <p className="mt-1 max-w-2xl text-sm text-ink-2">
          Weiß der KI-Assistent keine Antwort, zeigt er dem Kunden, wie er Sie erreicht – bei
          Bedarf gleich die zuständige Person.
        </p>
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5">
          {/* Schalter + Status */}
          <section className="space-y-3 rounded-card border-2 border-line bg-card p-5">
            <label className="flex cursor-pointer items-center gap-3">
              <Switch
                checked={enabled}
                onCheckedChange={(v) => {
                  setSwitchTouched(true);
                  setEnabled(v);
                }}
                aria-label="Kontakt im Chat anzeigen"
                data-testid="contact-switch"
              />
              <span>
                <span className="block font-extrabold text-ink">Kontakt im Chat anzeigen</span>
                <span className="block text-xs text-muted-foreground">
                  Nur bei Fragen, die der Assistent nicht beantworten kann
                </span>
              </span>
            </label>
            <div
              data-testid="contact-status"
              data-tone={status.tone}
              className={
                "flex gap-2.5 rounded-xl px-3.5 py-2.5 text-sm " +
                (status.tone === "on" ? "bg-[#dcf3ef] text-[#118576]" : "bg-[#fdeecd] text-[#c07d16]")
              }
            >
              <span className="mt-1.5 size-2 shrink-0 rounded-full bg-current" />
              {status.text}
            </div>
          </section>

          {/* Allgemeiner Kontakt */}
          <section className="space-y-4 rounded-card border-2 border-line bg-card p-5">
            <div>
              <h3 className="font-extrabold text-ink">Allgemeiner Kontakt</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Erscheint immer dann, wenn keine Person unten besser passt. Ein Kontaktweg genügt.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="esc-name" label="Name oder Team" value={general.contactName} placeholder="z. B. Team Kanzlei"
                onChange={(v) => setGeneralField("contactName", v)} />
              <Field id="esc-email" label="E-Mail" value={general.email} placeholder="kanzlei@beispiel.de"
                error={fieldError("email", general.email)} onChange={(v) => setGeneralField("email", v)} />
              <Field id="esc-phone" label="Telefon" value={general.phone} placeholder="+49 …"
                error={fieldError("phone", general.phone)} onChange={(v) => setGeneralField("phone", v)} />
              <Field id="esc-cal" label="Termin-Link" optional value={general.calendarUrl} placeholder="https://calendly.com/…"
                error={fieldError("calendarUrl", general.calendarUrl)} onChange={(v) => setGeneralField("calendarUrl", v)} />
            </div>
            <Field id="esc-msg" label="Begleitsatz über den Kontaktdaten" value={general.message}
              placeholder={DEFAULT_ESCALATION_MESSAGE} onChange={(v) => setGeneralField("message", v)} />
          </section>

          {/* Zuständige Personen */}
          <section className="space-y-3 rounded-card border-2 border-line bg-card p-5">
            <div>
              <h3 className="flex items-center gap-2 font-extrabold text-ink">
                Zuständige Personen
                <span className="rounded-full bg-line-2 px-2 py-0.5 text-[11px] font-extrabold text-ink-2">optional</span>
              </h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Nur nötig, wenn verschiedene Personen für verschiedene Themen zuständig sind. Der
                Assistent wählt anhand der Frage die passende Person. Fehlt bei einer Person ein
                Kontaktweg, springt der allgemeine Kontakt ein.
              </p>
            </div>

            <div className="space-y-2.5">
              {people.map((p, i) =>
                openKey === p.key ? (
                  <PersonEditor
                    key={p.key}
                    person={p}
                    color={CATEGORY_COLORS[(i + 1) % CATEGORY_COLORS.length]!}
                    onChange={(k, v) => setPersonField(p.key, k, v)}
                    onDone={() => setOpenKey(null)}
                    onRemove={() => {
                      setPeople((xs) => xs.filter((x) => x.key !== p.key));
                      setOpenKey(null);
                    }}
                  />
                ) : (
                  <PersonCard
                    key={p.key}
                    person={p}
                    general={general}
                    color={CATEGORY_COLORS[(i + 1) % CATEGORY_COLORS.length]!}
                    onEdit={() => setOpenKey(p.key)}
                  />
                ),
              )}
            </div>

            <button
              type="button"
              onClick={() => {
                const p = emptyPerson();
                setPeople((xs) => [...xs, p]);
                setOpenKey(p.key);
              }}
              className="flex w-full items-center justify-center gap-2 rounded-card border-2 border-dashed border-line p-3 text-sm font-extrabold text-muted-foreground transition-colors hover:border-primary/40 hover:text-ink"
            >
              <UserPlus className="size-4" /> Zuständige Person hinzufügen
            </button>
          </section>

          {/* Speichern */}
          <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 rounded-card border-2 border-line bg-card/95 px-5 py-3 backdrop-blur">
            <span className="text-sm font-bold" data-testid="save-state">
              {errors ? (
                <span className="text-destructive">Bitte die markierten Felder korrigieren.</span>
              ) : dirty ? (
                <span className="text-[#c07d16]">Ungespeicherte Änderungen</span>
              ) : (
                <span className="text-muted-foreground">Alles gespeichert</span>
              )}
            </span>
            <Button onClick={save} disabled={pending || !dirty || errors}>
              {pending ? "Speichert …" : "Speichern"}
            </Button>
          </div>
        </div>

        <ChatPreview settings={settings} accountName={accountName} />
      </div>
    </div>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  placeholder,
  error,
  optional,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  error?: string | null;
  optional?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>
        {label}
        {optional && <span className="font-normal text-faint"> (optional)</span>}
      </Label>
      <Input
        id={id}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-err` : undefined}
      />
      {error && (
        <p id={`${id}-err`} className="text-xs font-semibold text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

function Avatar({ name, color }: { name: string; color: (typeof CATEGORY_COLORS)[number] }) {
  return (
    <span
      className="flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-black"
      style={{ background: color.soft, color: color.text }}
    >
      {initials(name)}
    </span>
  );
}

function PersonCard({
  person,
  general,
  color,
  onEdit,
}: {
  person: Person;
  general: General;
  color: (typeof CATEGORY_COLORS)[number];
  onEdit: () => void;
}) {
  const topics = topicsOf(person.expertise);
  const pills: { icon: React.ReactNode; text: string; inherited: boolean }[] = [];
  const add = (own: string | null, fallback: string | null, icon: React.ReactNode, text: (v: string) => string) => {
    if (own) pills.push({ icon, text: text(own), inherited: false });
    else if (fallback) pills.push({ icon, text: "vom allgemeinen Kontakt", inherited: true });
  };
  add(safeHttpUrl(person.calendarUrl), safeHttpUrl(general.calendarUrl), <CalendarClock className="size-3.5" />, () => "Termin buchen");
  add(safeEmail(person.email), safeEmail(general.email), <Mail className="size-3.5" />, (v) => v);
  add(safePhone(person.phone), safePhone(general.phone), <Phone className="size-3.5" />, (v) => v);

  return (
    <div className="flex items-center gap-3 rounded-2xl border-2 border-line-2 p-3" data-testid="person-card">
      <Avatar name={person.name} color={color} />
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="truncate font-extrabold text-ink">{person.name || "Ohne Namen"}</div>
        {topics.length ? (
          <div className="flex flex-wrap gap-1.5">
            {topics.map((t) => (
              <span key={t} className="rounded-full bg-line-2 px-2.5 py-0.5 text-xs font-bold text-ink-2">
                {t}
              </span>
            ))}
          </div>
        ) : (
          <div className="text-xs font-semibold text-[#c07d16]">
            Noch keine Themen – ohne Themen kann der Assistent die Person nicht zuordnen.
          </div>
        )}
        {pills.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {pills.map((pl, i) => (
              <span
                key={i}
                className={
                  "inline-flex items-center gap-1 rounded-full border-2 px-2 py-0.5 text-xs font-bold " +
                  (pl.inherited ? "border-dashed border-line text-faint" : "border-line text-ink-2")
                }
              >
                {pl.icon}
                {pl.text}
              </span>
            ))}
          </div>
        )}
      </div>
      <Button variant="outline" size="sm" onClick={onEdit} aria-label={`${person.name || "Person"} bearbeiten`}>
        <Pencil className="size-3.5" /> Bearbeiten
      </Button>
    </div>
  );
}

function PersonEditor({
  person,
  color,
  onChange,
  onDone,
  onRemove,
}: {
  person: Person;
  color: (typeof CATEGORY_COLORS)[number];
  onChange: (k: keyof Person, v: string) => void;
  onDone: () => void;
  onRemove: () => void;
}) {
  const id = (s: string) => `esc-${person.key}-${s}`;
  return (
    <div className="space-y-3 rounded-2xl border-2 border-ink/80 p-4" data-testid="person-editor">
      <div className="flex items-center gap-3">
        <Avatar name={person.name} color={color} />
        <div className="flex-1">
          <Label htmlFor={id("name")} className="sr-only">Name</Label>
          <Input id={id("name")} value={person.name} autoFocus placeholder="Name, z. B. Julia Meier"
            onChange={(e) => onChange("name", e.target.value)} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={id("topics")}>Zuständig für</Label>
        <Input id={id("topics")} value={person.expertise} placeholder="z. B. Lohnabrechnung, Minijobs, Arbeitnehmer"
          onChange={(e) => onChange("expertise", e.target.value)} />
        <p className="text-xs text-muted-foreground">Themen mit Komma trennen. Daran erkennt der Assistent die Person.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field id={id("email")} label="E-Mail" value={person.email} placeholder="leer = allgemeine"
          error={fieldError("email", person.email)} onChange={(v) => onChange("email", v)} />
        <Field id={id("phone")} label="Telefon" value={person.phone} placeholder="leer = allgemeines"
          error={fieldError("phone", person.phone)} onChange={(v) => onChange("phone", v)} />
        <Field id={id("cal")} label="Termin-Link" value={person.calendarUrl} placeholder="https://…"
          error={fieldError("calendarUrl", person.calendarUrl)} onChange={(v) => onChange("calendarUrl", v)} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={onDone}>Fertig</Button>
        <Button variant="ghost" size="sm" onClick={onRemove} className="text-muted-foreground hover:text-destructive">
          <Trash2 className="size-3.5" /> Person entfernen
        </Button>
      </div>
    </div>
  );
}

/** Mini-Chat: zeigt mit buildEscalationBox genau die Box, die /api/chat ausliefern würde. */
function ChatPreview({ settings, accountName }: { settings: EscalationSettings; accountName: string }) {
  const experts = settings.experts ?? [];
  const examples = [
    ...experts
      .map((e, i) => ({ idx: i as number | null, topic: topicsOf(e.expertise ?? "")[0], name: e.name }))
      .filter((x) => x.topic && x.name)
      .map((x) => ({ key: `e${x.idx}`, idx: x.idx, label: `Frage zu ${x.topic}`, q: `Ich habe eine Frage zum Thema ${x.topic}.` })),
    { key: "other", idx: null as number | null, label: "Sonstige Frage", q: "Bis wann muss ich meine Unterlagen abgeben?" },
  ];
  const [pick, setPick] = useState("other");
  const ex = examples.find((e) => e.key === pick) ?? examples[examples.length - 1]!;
  const box = buildEscalationBox(settings, ex.idx, accountName);
  const chosen = ex.idx !== null ? experts[ex.idx] : null;

  const why = !settings.enabled
    ? "Ausgeschaltet: Der Assistent verweist nur allgemein an Sie, ohne Kontaktdaten."
    : !box
      ? "Noch kein gültiger Kontaktweg – deshalb erscheint keine Kontaktbox."
      : chosen
        ? `Passt die Frage zu „${ex.label.replace("Frage zu ", "")}“, wählt der Assistent ${chosen.name}. Fehlende Kontaktwege kommen vom allgemeinen Kontakt.`
        : "Passt keine Person eindeutig, erscheint der allgemeine Kontakt.";

  // lg:top-[82px] = unter der 60px-Kopfleiste (sticky, z-30) + Abstand, wie die Einstellungs-Seitenleiste.
  return (
    <aside className="space-y-3 lg:sticky lg:top-[82px]" aria-label="Vorschau" data-testid="contact-preview">
      <div className="text-xs font-extrabold tracking-wider text-faint uppercase">So sieht es Ihr Kunde</div>
      <div className="flex flex-wrap gap-1.5">
        {examples.map((e) => (
          <button
            key={e.key}
            type="button"
            aria-pressed={e.key === ex.key}
            onClick={() => setPick(e.key)}
            className={
              "rounded-full border-2 px-2.5 py-1 text-xs font-extrabold transition-colors " +
              (e.key === ex.key ? "border-ink bg-line-2 text-ink" : "border-line bg-card text-ink-2 hover:border-ink/40")
            }
          >
            {e.label}
          </button>
        ))}
      </div>
      <div className="overflow-hidden rounded-[22px] border-2 border-line bg-card shadow-[0_6px_0_var(--line)]">
        <div className="flex items-center justify-between bg-ink px-4 py-2.5 text-sm font-extrabold text-white">
          {/* Gleicher Kopf wie im echten Chat auf der Hilfe-Seite (dort heißt er so). */}
          {hubText("de", "chatTitle")}{" "}
          <span className="truncate pl-2 text-xs font-semibold text-[#d9ccb8]">{accountName}</span>
        </div>
        <div className="grid min-h-64 content-start gap-2.5 bg-background p-3.5">
          <div className="max-w-[88%] justify-self-end rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-[13px] text-white">
            {ex.q}
          </div>
          <div className="max-w-[92%] rounded-2xl rounded-bl-sm border-2 border-line bg-white px-3 py-2 text-[13px] text-ink">
            {box
              ? "Dazu habe ich leider keine passende Anleitung. Unten finden Sie, wie Sie uns direkt erreichen."
              : `Dazu liegen mir keine Informationen vor. Bitte wenden Sie sich direkt an „${accountName}“.`}
            {box && (
              <div className="mt-2 space-y-1.5 rounded-xl border-2 border-line bg-background p-2.5" data-testid="preview-box">
                <p className="text-xs text-ink-2">{box.message}</p>
                {box.methods.map((m) => (
                  <div key={m.type} className="flex items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-extrabold text-white">
                    {m.type === "email" ? <Mail className="size-3.5" /> : m.type === "phone" ? <Phone className="size-3.5" /> : <CalendarClock className="size-3.5" />}
                    <span className="truncate">{m.label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{why}</p>
      <p className="text-[11px] text-faint">Beispiel. Im echten Chat wählt der Assistent die Person anhand der Kundenfrage.</p>
    </aside>
  );
}
