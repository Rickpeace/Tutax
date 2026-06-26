"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAccount } from "@/lib/account";

const FIELDS = ["name", "calendarUrl", "email", "phone"] as const;

export async function saveEscalation(formData: FormData) {
  const { account } = await requireAccount();
  const supabase = await createClient();

  // Pro-Kategorie-Felder einsammeln: cat_<feld>__<id>, Label: catlabel__<id>
  const labels: Record<string, string> = {};
  const perCat: Record<string, Record<string, string>> = {};
  for (const [k, v] of formData.entries()) {
    const val = String(v);
    if (k.startsWith("catlabel__")) {
      labels[k.slice(10)] = val;
    } else {
      const m = k.match(/^cat_(\w+)__(.+)$/);
      if (m) {
        const [, field, id] = m;
        (perCat[id] ??= {})[field] = val;
      }
    }
  }

  const byCategory: Record<string, Record<string, string>> = {};
  for (const id of Object.keys(labels)) {
    const entry: Record<string, string> = {};
    for (const f of FIELDS) {
      const val = (perCat[id]?.[f] ?? "").trim();
      if (val) entry[f] = val;
    }
    if (Object.keys(entry).length) byCategory[labels[id]] = entry;
  }

  const escalation = {
    enabled: formData.get("enabled") === "on",
    message: String(formData.get("message") ?? "").trim(),
    contactName: String(formData.get("contactName") ?? "").trim(),
    calendarUrl: String(formData.get("calendarUrl") ?? "").trim(),
    email: String(formData.get("email") ?? "").trim(),
    phone: String(formData.get("phone") ?? "").trim(),
    byCategory,
  };

  const { error } = await supabase.from("accounts").update({ escalation }).eq("id", account.id);
  if (error) throw new Error(error.message);
  revalidatePath("/app/settings/eskalation");
}
