"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type AuthState = { error?: string; message?: string };

function appUrl() {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

/** E-Mail + Passwort Anmeldung */
export async function signInWithPassword(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/app");

  if (!email || !password) return { error: "Bitte E-Mail und Passwort eingeben." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: uebersetzeAuthFehler(error.message) };

  revalidatePath("/", "layout");
  redirect(next.startsWith("/") ? next : "/app");
}

/** Registrierung mit E-Mail + Passwort (Account-Anlage via DB-Trigger) */
export async function signUp(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const accountName = String(formData.get("account_name") ?? "").trim();

  if (!email || !password)
    return { error: "Bitte E-Mail und Passwort eingeben." };
  if (password.length < 8)
    return { error: "Das Passwort muss mindestens 8 Zeichen haben." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${appUrl()}/auth/confirm`,
      data: accountName ? { account_name: accountName } : undefined,
    },
  });
  if (error) return { error: uebersetzeAuthFehler(error.message) };

  return {
    message:
      "Fast geschafft – bitte bestätigen Sie Ihre E-Mail-Adresse über den Link, den wir Ihnen gesendet haben.",
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
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${appUrl()}/auth/confirm` },
  });
  if (error) return { error: uebersetzeAuthFehler(error.message) };

  return { message: "Magic Link gesendet – prüfen Sie Ihr Postfach." };
}

/** Abmelden */
export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}

function uebersetzeAuthFehler(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("invalid login credentials"))
    return "E-Mail oder Passwort ist falsch.";
  if (m.includes("email not confirmed"))
    return "Bitte bestätigen Sie zuerst Ihre E-Mail-Adresse.";
  if (m.includes("user already registered"))
    return "Für diese E-Mail existiert bereits ein Konto.";
  if (m.includes("rate limit"))
    return "Zu viele Versuche. Bitte warten Sie einen Moment.";
  return msg;
}
