"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAccount } from "@/lib/account";

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

export async function saveEscalation(input: EscalationIn) {
  const { account } = await requireAccount();
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

  const { error } = await supabase.from("accounts").update({ escalation }).eq("id", account.id);
  if (error) throw new Error(error.message);
  revalidatePath("/app/assistent/eskalation");
}
