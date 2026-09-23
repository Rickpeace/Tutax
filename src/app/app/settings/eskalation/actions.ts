"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { assertActiveAccount, requireAccount } from "@/lib/account";
import { safeEmail, safeHttpUrl, safePhone } from "@/lib/escalation";
import { withUserErrors, UserError } from "@/lib/action-error";
import { isPro, PRO_REQUIRED } from "@/lib/plan";

type ExpertIn = {
  name?: string;
  expertise?: string;
  calendarUrl?: string;
  email?: string;
  phone?: string;
};
type EscalationIn = {
  enabled?: boolean;
  message?: string;
  contactName?: string;
  calendarUrl?: string;
  email?: string;
  phone?: string;
  experts?: ExpertIn[];
};

const clean = (s: unknown) => String(s ?? "").trim();

export const saveEscalation = withUserErrors(async function saveEscalation(
  expectedAccountId: string,
  input: EscalationIn,
) {
  const ctx = await requireAccount();
  // Org in einem anderen Tab gewechselt -> nicht still in die falsche Organisation schreiben.
  assertActiveAccount(expectedAccountId, ctx);
  // Persönlicher Kontakt erscheint nur im KI-Assistenten → erst ab Pro (Tarifseite).
  if (!isPro(ctx.account)) throw new UserError(PRO_REQUIRED);
  const { account } = ctx;
  const supabase = await createClient();

  const experts = Array.isArray(input.experts)
    ? input.experts
        .map((e) => ({
          name: clean(e.name),
          expertise: clean(e.expertise),
          calendarUrl: clean(e.calendarUrl),
          email: clean(e.email),
          phone: clean(e.phone),
        }))
        .filter((e) => e.name || e.expertise || e.calendarUrl || e.email || e.phone)
    : [];

  const escalation = {
    enabled: !!input.enabled,
    message: clean(input.message),
    contactName: clean(input.contactName),
    calendarUrl: clean(input.calendarUrl),
    email: clean(input.email),
    phone: clean(input.phone),
    experts,
  };

  // Werte landen als Link im öffentlichen Chat -> nur gültige Formate speichern.
  const check = (v: string, ok: (x: string) => string | null, what: string, who: string) => {
    if (v && !ok(v)) throw new UserError(`${what} ${who} ist ungültig: „${v}“`);
  };
  const people = [{ ...escalation, who: "(allgemeiner Kontakt)" }, ...experts.map((e) => ({ ...e, who: `(${e.name || "Person"})` }))];
  for (const p of people) {
    check(p.calendarUrl, safeHttpUrl, "Der Termin-Link", p.who);
    check(p.email, safeEmail, "Die E-Mail-Adresse", p.who);
    check(p.phone, safePhone, "Die Telefonnummer", p.who);
  }

  const { error } = await supabase.from("accounts").update({ escalation }).eq("id", account.id);
  if (error) throw new Error(error.message);
  revalidatePath("/app/assistent/eskalation");
});
