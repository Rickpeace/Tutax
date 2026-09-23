"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { assertActiveAccount, orgSwitchedError, requireAccount } from "@/lib/account";
import { withUserErrors } from "@/lib/action-error";
import { ORG_NAME_MAX } from "@/lib/text-limits";

// Org-Wechsel in einem anderen Tab: nur die Organisation einrichten, die die Seite zeigt.
export const completeOnboarding = withUserErrors(async function completeOnboarding(
  expectedAccountId: string,
  input: {
    name: string;
    websiteUrl: string;
  },
) {
  const ctx = await requireAccount();
  assertActiveAccount(expectedAccountId, ctx);
  const { account } = ctx;
  const supabase = await createClient();
  // Einrichtung soll nie an einer zu langen Eingabe scheitern -> hier gekappt (das
  // Formular begrenzt bereits auf ORG_NAME_MAX), Einstellungen lehnen dagegen ab.
  const name =
    input.name.replace(/\p{Cc}/gu, " ").replace(/\s+/g, " ").trim().slice(0, ORG_NAME_MAX) ||
    account.name;

  await supabase
    .from("accounts")
    .update({ name, onboarded: true })
    .eq("id", account.id);

  const url = input.websiteUrl.trim();
  if (url) {
    await supabase
      .from("themes")
      .update({ source_url: url })
      .eq("account_id", account.id);
  }
  redirect("/app");
});

export async function skipOnboarding(expectedAccountId: string) {
  const ctx = await requireAccount();
  // Gewechselt: nichts markieren, die App zeigt die jetzt aktive Organisation.
  if (orgSwitchedError(expectedAccountId, ctx)) redirect("/app");
  const { account } = ctx;
  const supabase = await createClient();
  await supabase.from("accounts").update({ onboarded: true }).eq("id", account.id);
  redirect("/app");
}
