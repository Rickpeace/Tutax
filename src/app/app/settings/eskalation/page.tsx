import { requireAccount } from "@/lib/account";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveEscalation } from "./actions";

type CatEsc = { name?: string; calendarUrl?: string; email?: string; phone?: string };
type Esc = {
  enabled?: boolean;
  message?: string;
  contactName?: string;
  calendarUrl?: string;
  email?: string;
  phone?: string;
  byCategory?: Record<string, CatEsc>;
};

export default async function EskalationPage() {
  const { account } = await requireAccount();
  const supabase = await createClient();
  const [{ data: acc }, { data: cats }] = await Promise.all([
    supabase.from("accounts").select("escalation").eq("id", account.id).single(),
    supabase
      .from("categories")
      .select("id, name, account_id, position")
      .or(`account_id.eq.${account.id},account_id.is.null`)
      .order("position", { ascending: true }),
  ]);
  const esc = (acc?.escalation ?? {}) as Esc;
  const byCat = esc.byCategory ?? {};

  // Kategorien nach Name deduplizieren (eigene + globale)
  const seen = new Set<string>();
  const categories = (cats ?? []).filter((c) => {
    if (seen.has(c.name)) return false;
    seen.add(c.name);
    return true;
  });

  return (
    <form action={saveEscalation} className="space-y-8">
      <div>
        <h2 className="text-lg font-bold text-ink">Kontakt &amp; Eskalation</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Wenn der Chatbot eine Frage nicht sicher beantworten kann, verweist er die
          Mandanten automatisch auf Ihre Kontaktwege.
        </p>
      </div>

      <section className="space-y-4 rounded-2xl border border-border bg-card p-5">
        <label className="flex items-center gap-2 text-sm font-medium text-ink">
          <input type="checkbox" name="enabled" defaultChecked={!!esc.enabled} className="size-4 accent-primary" />
          Eskalation aktivieren
        </label>

        <div className="space-y-1.5">
          <Label>Hinweistext an Mandanten</Label>
          <Input name="message" defaultValue={esc.message ?? ""} placeholder="Gerne helfen wir Ihnen persönlich weiter." />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Ansprechpartner / Team</Label>
            <Input name="contactName" defaultValue={esc.contactName ?? ""} placeholder="z. B. Team Kanzlei" />
          </div>
          <div className="space-y-1.5">
            <Label>Online-Kalender (Buchungslink)</Label>
            <Input name="calendarUrl" defaultValue={esc.calendarUrl ?? ""} placeholder="https://calendly.com/…" />
          </div>
          <div className="space-y-1.5">
            <Label>E-Mail</Label>
            <Input name="email" defaultValue={esc.email ?? ""} placeholder="kanzlei@beispiel.de" />
          </div>
          <div className="space-y-1.5">
            <Label>Telefon</Label>
            <Input name="phone" defaultValue={esc.phone ?? ""} placeholder="+49 …" />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Füllen Sie aus, was Sie anbieten – der Chatbot zeigt nur die vorhandenen Wege
          (Termin, E-Mail, Telefon). Nichts davon Pflicht.
        </p>
      </section>

      <section className="space-y-3 rounded-2xl border border-border bg-card p-5">
        <div>
          <h3 className="font-bold text-ink">Zuständigkeit je Kategorie (optional)</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Überschreibt den allgemeinen Kontakt, wenn die Frage thematisch zu dieser
            Kategorie passt – z. B. eine zuständige Person mit eigenem Kalender.
          </p>
        </div>
        {categories.length === 0 && (
          <p className="text-sm text-muted-foreground">Keine Kategorien vorhanden.</p>
        )}
        {categories.map((c) => {
          const v = byCat[c.name] ?? {};
          return (
            <div key={c.id} className="rounded-xl border border-line-2 p-3">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink">
                {c.name}
                {!c.account_id && (
                  <span className="rounded bg-line-2 px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">
                    Standard
                  </span>
                )}
              </div>
              <input type="hidden" name={`catlabel__${c.id}`} value={c.name} />
              <div className="grid gap-2 sm:grid-cols-2">
                <Input name={`cat_name__${c.id}`} defaultValue={v.name ?? ""} placeholder="Name (z. B. Frau Müller)" />
                <Input name={`cat_calendarUrl__${c.id}`} defaultValue={v.calendarUrl ?? ""} placeholder="Kalender-Link" />
                <Input name={`cat_email__${c.id}`} defaultValue={v.email ?? ""} placeholder="E-Mail" />
                <Input name={`cat_phone__${c.id}`} defaultValue={v.phone ?? ""} placeholder="Telefon" />
              </div>
            </div>
          );
        })}
      </section>

      <Button type="submit">Speichern</Button>
    </form>
  );
}
