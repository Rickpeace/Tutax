"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAccount } from "@/lib/account";
import { invalidateHubTag } from "@/lib/cache-tags";
import { slugify } from "@/lib/slug";
import { isExtraLang, type ExtraLang } from "@/lib/i18n-hub";
import { backfillAccountTranslations } from "@/app/app/actions-translate";

export type BrandingInput = {
  name: string;
  slug: string;
  colors: {
    primary?: string;
    background?: string;
    surface?: string;
    text?: string;
  };
};

export async function saveBranding(
  input: BrandingInput,
): Promise<{ ok: true; slug: string } | { ok: false; error: string }> {
  const { account } = await requireAccount();
  const supabase = await createClient();

  const name = input.name.trim();
  const slug = slugify(input.slug || name);
  if (!name) return { ok: false, error: "Name darf nicht leer sein." };

  const { error: ae } = await supabase
    .from("accounts")
    .update({ name, slug })
    .eq("id", account.id);
  if (ae) {
    const dup = ae.code === "23505" || /duplicate|unique/i.test(ae.message);
    return { ok: false, error: dup ? "Dieser Slug ist bereits vergeben." : ae.message };
  }

  const { data: theme } = await supabase
    .from("themes")
    .select("tokens")
    .eq("account_id", account.id)
    .single();
  const prev = (theme?.tokens ?? {}) as { colors?: Record<string, string> };
  const colors = { ...(prev.colors ?? {}) };
  for (const [k, v] of Object.entries(input.colors)) {
    if (v) colors[k] = v;
  }
  const tokens = { ...prev, colors };

  const { error: te } = await supabase
    .from("themes")
    .update({ tokens, status: "ready", updated_at: new Date().toISOString() })
    .eq("account_id", account.id);
  if (te) return { ok: false, error: te.message };

  // Öffentlichen Hub-Cache räumen — alter UND neuer Slug (Slug kann sich ändern).
  invalidateHubTag(account.slug);
  invalidateHubTag(slug);
  revalidatePath("/app/settings/branding");
  revalidatePath("/app");
  return { ok: true, slug };
}

/**
 * Zusätzliche Hilfe-Seiten-Sprachen des Kontos setzen (Welle 13). Deutsch ist immer an
 * und wird NICHT gespeichert. Nur gültige Codes (en/pl/tr), dedupliziert. Gleiche
 * Autorisierung wie die übrigen Branding-Actions (requireAccount = aktives Konto).
 */
export async function saveLanguages(
  langs: string[],
): Promise<{ ok: true; languages: ExtraLang[] } | { ok: false; error: string }> {
  const { account } = await requireAccount();
  const supabase = await createClient();

  // Vorherige Sprachen für den Delta-Backfill (nur NEU aktivierte nachziehen).
  const { data: prevRow } = await supabase
    .from("accounts")
    .select("languages")
    .eq("id", account.id)
    .single();
  const prev = new Set(
    ((prevRow?.languages as string[] | null) ?? []).filter(isExtraLang) as ExtraLang[],
  );

  const clean = [...new Set(langs.filter(isExtraLang))] as ExtraLang[];
  const { error } = await supabase
    .from("accounts")
    .update({ languages: clean })
    .eq("id", account.id);
  if (error) return { ok: false, error: error.message };

  // Sprach-Umschalter erscheint/verschwindet auf der Hilfe-Seite -> Hub-Cache räumen.
  invalidateHubTag(account.slug);
  revalidatePath("/app/settings/branding");

  // Neue Sprache(n) aktiviert -> published+public Tutorials im Hintergrund nachübersetzen
  // (Best-Effort, gedeckelt; Rest fängt der manuelle Button). Nur wenn wirklich etwas
  // dazukam — reines Abwählen löst keinen Backfill aus.
  const added = clean.some((l) => !prev.has(l));
  if (added) {
    const accountId = account.id;
    after(() =>
      backfillAccountTranslations(accountId).catch((e) =>
        console.error("Sprach-Backfill:", e instanceof Error ? e.message : e),
      ),
    );
  }

  return { ok: true, languages: clean };
}

/** Aktive Design-Quelle wählen: Standard-CI (manuell), KI-Design oder Extrem. */
export async function setThemeMode(mode: "manual" | "ai" | "extreme") {
  const { account } = await requireAccount();
  const supabase = await createClient();
  const clean = mode === "extreme" ? "extreme" : mode === "ai" ? "ai" : "manual";
  const { error } = await supabase
    .from("themes")
    .update({ mode: clean })
    .eq("account_id", account.id);
  if (error) throw new Error(error.message);
  invalidateHubTag(account.slug); // Design-Wechsel sofort öffentlich sichtbar
  revalidatePath("/app/settings/branding");
  revalidatePath("/app");
}
