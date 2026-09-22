"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAccount } from "@/lib/account";
import { ORG_NAME_MAX } from "@/lib/text-limits";

export async function completeOnboarding(input: {
  name: string;
  websiteUrl: string;
}) {
  const { account } = await requireAccount();
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
}

export async function skipOnboarding() {
  const { account } = await requireAccount();
  const supabase = await createClient();
  await supabase.from("accounts").update({ onboarded: true }).eq("id", account.id);
  redirect("/app");
}
