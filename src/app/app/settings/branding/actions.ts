"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAccount } from "@/lib/account";
import { invalidateHubTag } from "@/lib/cache-tags";
import { slugify } from "@/lib/slug";
import { isExtraLang, type ExtraLang } from "@/lib/i18n-hub";
import { isBusiness, BUSINESS_REQUIRED } from "@/lib/plan";
import { backfillAccountTranslations } from "@/lib/translate-jobs";

// Welle 50 (QA): Jedes Einstellungs-Formular schickt NUR sein eigenes Feld. Nicht übergebene
// Felder bleiben in der DB unverändert — sonst überschriebe z. B. ein noch offenes „Aussehen“
// (Farben) eine inzwischen geänderte Adresse mit dem alten Stand.
export type BrandingInput = {
  name?: string;
  slug?: string;
  colors?: {
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

  const accUpdate: { name?: string; slug?: string } = {};
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) return { ok: false, error: "Name darf nicht leer sein." };
    accUpdate.name = name;
  }
  if (input.slug !== undefined) {
    const slug = slugify(input.slug);
    if (!slug) return { ok: false, error: "Die Adresse darf nicht leer sein." };
    accUpdate.slug = slug;
  }
  const slug = accUpdate.slug ?? account.slug;

  if (Object.keys(accUpdate).length) {
    const { error: ae } = await supabase
      .from("accounts")
      .update(accUpdate)
      .eq("id", account.id);
    if (ae) {
      const dup = ae.code === "23505" || /duplicate|unique/i.test(ae.message);
      return { ok: false, error: dup ? "Diese Adresse ist bereits vergeben." : ae.message };
    }
  }

  const colorPatch = Object.entries(input.colors ?? {}).filter(([, v]) => !!v);
  if (colorPatch.length) {
    const { data: theme } = await supabase
      .from("themes")
      .select("tokens")
      .eq("account_id", account.id)
      .single();
    const prev = (theme?.tokens ?? {}) as { colors?: Record<string, string> };
    const colors = { ...(prev.colors ?? {}) };
    for (const [k, v] of colorPatch) colors[k] = v as string;
    const tokens = { ...prev, colors };

    const { error: te } = await supabase
      .from("themes")
      .update({ tokens, status: "ready", updated_at: new Date().toISOString() })
      .eq("account_id", account.id);
    if (te) return { ok: false, error: te.message };
  }

  // Öffentlichen Hub-Cache räumen — alter UND neuer Slug (Slug kann sich ändern).
  invalidateHubTag(account.slug);
  invalidateHubTag(slug);
  // Welle 50c: Name/Adresse/Farben verteilen sich auf mehrere Einstellungs-Seiten.
  revalidatePath("/app/settings", "layout");
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
  // Mehrsprachigkeit ist ein Business-Feature (Abschalten/Leeren bleibt immer erlaubt).
  if (langs.some(isExtraLang) && !isBusiness(account)) {
    return { ok: false, error: BUSINESS_REQUIRED };
  }
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
  revalidatePath("/app/settings", "layout");

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
  // KI-Design (ai/extreme) ist ein Business-Feature; zurück auf manuell geht immer.
  if (mode !== "manual" && !isBusiness(account)) throw new Error(BUSINESS_REQUIRED);
  const supabase = await createClient();
  const clean = mode === "extreme" ? "extreme" : mode === "ai" ? "ai" : "manual";
  const { error } = await supabase
    .from("themes")
    .update({ mode: clean })
    .eq("account_id", account.id);
  if (error) throw new Error(error.message);
  invalidateHubTag(account.slug); // Design-Wechsel sofort öffentlich sichtbar
  revalidatePath("/app/settings", "layout");
  revalidatePath("/app");
}
