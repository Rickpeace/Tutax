"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { sendEmail } from "@/lib/email/send";
import { welcomeEmail } from "@/lib/email/templates";
import { createClient } from "@/lib/supabase/server";
import { appBaseUrl, safeNext } from "@/lib/url";
import { uebersetzeAuthFehler } from "@/lib/auth-errors";
import { MEMBER_HOME, asRole } from "@/lib/roles";

/** `values`: Eingaben zurückgeben, damit das Formular nach einem Fehler nicht leer ist (Passwort nie). */
export type AuthState = { error?: string; message?: string; values?: { email?: string; account_name?: string } };

/** Realistische Adresse (Domain mit Endung) — Browser und Supabase nehmen sogar „a@x“ an. */
const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

const appUrl = appBaseUrl;

/** E-Mail + Passwort Anmeldung */
export async function signInWithPassword(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/app");

  const values = { email };
  if (!email || !password) return { error: "Bitte E-Mail und Passwort eingeben.", values };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: uebersetzeAuthFehler(error.message), values };

  revalidatePath("/", "layout");
  let target = safeNext(next, "/app");
  // Mitarbeiter direkt zu den Schulungen: über /app sahen sie sonst ~3 s die Inhaber-Oberfläche
  // (Reiter, ⌘K mit Einstellungen), bis die Umleitung griff (Audit 23.09.).
  if (target === "/app" && data.user) {
    const { data: rows } = await supabase.from("account_members").select("account_id, role").eq("user_id", data.user.id);
    const activeId = (data.user.user_metadata as { active_account_id?: string } | null)?.active_account_id;
    const active = (rows ?? []).find((r) => r.account_id === activeId) ?? rows?.[0];
    if (active && asRole(active.role) === "member") target = MEMBER_HOME;
  }
  redirect(target);
}

/** Registrierung mit E-Mail + Passwort (Account-Anlage via DB-Trigger) */
export async function signUp(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  // Länge begrenzen: der Name landet als Organisation und in der Willkommens-Mail.
  const accountName = String(formData.get("account_name") ?? "").trim().slice(0, 80);

  const values = { email, account_name: accountName };
  if (!email || !password)
    return { error: "Bitte E-Mail und Passwort eingeben.", values };
  if (!EMAIL_OK.test(email))
    return { error: "Bitte prüfen Sie die E-Mail-Adresse (z. B. name@firma.de).", values };
  if (password.length < 8)
    return { error: "Das Passwort muss mindestens 8 Zeichen haben.", values };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${appUrl()}/auth/confirm`,
      data: accountName ? { account_name: accountName } : undefined,
    },
  });
  if (error) return { error: uebersetzeAuthFehler(error.message), values };

  // E-Mail-Bestätigung ist aktuell deaktiviert -> nach Registrierung direkt eingeloggt.
  // Willkommens-Mail als Bestätigung „Konto eingerichtet“ (nach der Antwort, blockiert nicht).
  // Ist die Bestätigung später an, übernimmt das die Supabase-Mail „Adresse bestätigen“.
  if (data.session) {
    const baseUrl = appUrl();
    after(() => sendEmail({ to: email, ...welcomeEmail({ baseUrl, email, orgName: accountName }), tag: "willkommen" }));
    redirect("/app");
  }

  // Falls Bestätigung später aktiviert wird: ehrliche Meldung (kein Fake-„Link gesendet").
  return {
    message: "Konto erstellt – Sie können sich jetzt direkt anmelden.",
  };
}

/** Passwortlose Anmeldung per Magic Link */
export async function signInWithMagicLink(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { error: "Bitte E-Mail eingeben." };

  const supabase = await createClient();
  // shouldCreateUser: false — der Anmelde-Link ist KEINE Registrierung (Audit 23.09.: sonst
  // entstand für jede eingetippte fremde Adresse ein Konto samt Organisation).
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${appUrl()}/auth/confirm`, shouldCreateUser: false },
  });
  // Unbekannte Adresse: dieselbe Antwort wie bei Erfolg (keine Konto-Enumeration).
  // Andere Fehler (z. B. zu viele Anfragen) weiterhin anzeigen.
  if (error && !/signups? not allowed|user not found/i.test(error.message))
    return { error: uebersetzeAuthFehler(error.message) };

  return {
    message: "Wenn es ein Konto mit dieser Adresse gibt, ist der Anmelde-Link unterwegs – prüfen Sie Ihr Postfach. Noch kein Konto? Dann registrieren Sie sich zuerst.",
  };
}

/** Passwort-Reset anfordern (Mail mit Link). */
export async function requestPasswordReset(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { error: "Bitte E-Mail eingeben." };
  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${appUrl()}/auth/confirm?next=/reset`,
  });
  // Generische Meldung (keine Konto-Enumeration).
  return {
    message: "Wenn ein Konto existiert, haben wir Ihnen einen Link zum Zurücksetzen geschickt. Prüfen Sie Ihr Postfach.",
  };
}

/** Neues Passwort setzen (innerhalb der Recovery-Session). */
export async function updatePassword(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const password = String(formData.get("password") ?? "");
  if (password.length < 8)
    return { error: "Das Passwort muss mindestens 8 Zeichen haben." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return { error: "Der Link ist ungültig oder abgelaufen. Bitte fordern Sie einen neuen an." };
  // Nur mit frischem E-Mail-Nachweis: Die Sitzung muss in den letzten 30 Minuten über einen
  // E-Mail-Link entstanden sein (Supabase-amr „otp“ — Zurücksetzen- und Magic-Link, geprüft
  // 23.09.2026). Eine normale Passwort-Sitzung („password“) darf hier NICHT ohne altes
  // Passwort ein neues setzen — sonst Konto-Übernahme am entsperrten Gerät. Passwort
  // ändern mit altem Passwort: Einstellungen → Profil.
  const { data: claims } = await supabase.auth.getClaims();
  const amr = (claims?.claims?.amr ?? []) as { method?: string; timestamp?: number }[];
  const freshLink = amr.some(
    (a) => a.method === "otp" && typeof a.timestamp === "number" && Date.now() / 1000 - a.timestamp < 30 * 60,
  );
  if (!freshLink)
    return {
      error:
        "Aus Sicherheitsgründen geht das nur direkt über den Link aus der E-Mail. Bitte fordern Sie unter „Passwort vergessen“ einen neuen Link an.",
    };
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: uebersetzeAuthFehler(error.message) };
  redirect("/app");
}

/** Abmelden */
export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
