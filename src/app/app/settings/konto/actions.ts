"use server";

import { redirect } from "next/navigation";
import { createClient as createPlainClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { requireAccount } from "@/lib/account";
import { uebersetzeAuthFehler } from "@/lib/auth-errors";
import { passwordProblem } from "@/lib/password-rule";

/**
 * Prüft das aktuelle Passwort per Wegwerf-Anmeldung (eigener Client ohne Cookies); deren
 * Sitzung wird sofort verworfen, die laufende Sitzung bleibt unberührt.
 */
async function currentPasswordOk(email: string, currentPassword: string): Promise<boolean> {
  const probe = createPlainClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { error } = await probe.auth.signInWithPassword({ email, password: currentPassword });
  if (error) return false;
  await probe.auth.signOut({ scope: "local" }).catch(() => {});
  return true;
}

/**
 * Passwort ändern — nur mit dem AKTUELLEN Passwort. Sonst könnte jeder, der kurz an ein
 * entsperrtes Gerät kommt, das Passwort neu setzen und das Konto übernehmen.
 * Geprüft wird per Wegwerf-Anmeldung (eigener Client ohne Cookies), deren Sitzung
 * sofort wieder verworfen wird; die laufende Sitzung bleibt unberührt.
 */
export async function changePassword(
  currentPassword: string,
  password: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!currentPassword) return { ok: false, error: "Bitte geben Sie Ihr aktuelles Passwort ein." };
  const pwProblem = passwordProblem(password);
  if (pwProblem) return { ok: false, error: pwProblem };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { ok: false, error: "Sitzung abgelaufen – bitte neu anmelden." };

  if (!(await currentPasswordOk(user.email, currentPassword)))
    return { ok: false, error: "Das aktuelle Passwort stimmt nicht." };

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { ok: false, error: uebersetzeAuthFehler(error.message) };
  return { ok: true };
}

/**
 * E-Mail-Adresse ändern — wie beim Passwort nur mit dem AKTUELLEN Passwort (Audit 23.09.:
 * Supabase stellt schon nach EINEM Bestätigungs-Klick um; wer kurz an ein entsperrtes Gerät
 * kam, konnte die Adresse auf seine eigene setzen, selbst bestätigen und per „Passwort
 * vergessen“ das Konto übernehmen). Supabase verschickt Links an alte + neue Adresse.
 */
export async function changeEmail(
  email: string,
  currentPassword: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!currentPassword) return { ok: false, error: "Bitte geben Sie Ihr aktuelles Passwort ein." };
  const clean = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean))
    return { ok: false, error: "Bitte eine gültige E-Mail-Adresse eingeben." };
  const supabase = await createClient();
  // Eigene Adresse: Supabase meldet dann Erfolg, verschickt aber nichts — die App zeigte
  // trotzdem „Bestätigungs-Links verschickt“.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user?.email && user.email.toLowerCase() === clean)
    return { ok: false, error: "Mit dieser E-Mail-Adresse melden Sie sich bereits an." };
  if (!user?.email) return { ok: false, error: "Sitzung abgelaufen – bitte neu anmelden." };
  if (!(await currentPasswordOk(user.email, currentPassword)))
    return {
      ok: false,
      error: "Das aktuelle Passwort stimmt nicht. (Noch kein Passwort? Legen Sie über „Passwort vergessen“ eines fest.)",
    };
  const { error } = await supabase.auth.updateUser({ email: clean });
  if (error) return { ok: false, error: uebersetzeAuthFehler(error.message) };
  return { ok: true };
}

/**
 * Onboarding erneut durchlaufen (Einrichtung nochmal zeigen). Setzt BEWUSST nicht mehr
 * `accounts.onboarded=false`: der Merker gilt für die ganze Organisation — früher wurden
 * dadurch alle anderen Inhaber/Bearbeiter beim nächsten Klick in die Einrichtung gezwungen
 * (und kamen per „Zurück“ nicht mehr heraus). Die Einrichtung öffnet nur für diese Person.
 */
export async function reopenOnboarding(): Promise<void> {
  await requireAccount(); // nur Inhaber/Bearbeiter (die Einrichtung ändert Organisations-Daten)
  redirect("/onboarding?erneut=1");
}
