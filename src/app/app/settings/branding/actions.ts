"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { assertActiveAccount, orgSwitchedError, requireAccount } from "@/lib/account";
import { invalidateHubTag } from "@/lib/cache-tags";
import { slugify, SLUG_UNUSABLE } from "@/lib/slug";
import { ORG_NAME_MAX, ORG_NAME_TOO_LONG } from "@/lib/text-limits";
import { isExtraLang, type ExtraLang } from "@/lib/i18n-hub";
import { isBusiness, isPro, BUSINESS_REQUIRED, PRO_REQUIRED } from "@/lib/plan";
import { backfillAccountTranslations } from "@/lib/translate-jobs";
import { withUserErrors, UserError } from "@/lib/action-error";

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

// Org-Wechsel in einem anderen Tab: alle Aktionen hier bekommen die auf der Seite angezeigte
// Organisation (`expectedAccountId`) und lehnen ab, wenn inzwischen eine andere aktiv ist.
export async function saveBranding(
  expectedAccountId: string,
  input: BrandingInput,
): Promise<{ ok: true; slug: string } | { ok: false; error: string }> {
  const ctx = await requireAccount();
  const switched = orgSwitchedError(expectedAccountId, ctx);
  if (switched) return { ok: false, error: switched };
  const { account } = ctx;
  const supabase = await createClient();

  const accUpdate: { name?: string; slug?: string } = {};
  if (input.name !== undefined) {
    // Steuerzeichen raus, Leerraum zusammenfassen (ein 3000-Zeichen-Name zerlegte sonst
    // den Kopf der Hilfe-Seite). Gekappt wird NICHT still — wir lehnen mit Meldung ab.
    const name = input.name.replace(/\p{Cc}/gu, " ").replace(/\s+/g, " ").trim();
    if (!name) return { ok: false, error: "Name darf nicht leer sein." };
    if (name.length > ORG_NAME_MAX) return { ok: false, error: ORG_NAME_TOO_LONG };
    accUpdate.name = name;
  }
  if (input.slug !== undefined) {
    // Kein stiller Ersatzwert mehr: „###“ ergibt leer -> ablehnen, alte Adresse bleibt.
    if (!input.slug.trim()) return { ok: false, error: "Die Adresse darf nicht leer sein." };
    const slug = slugify(input.slug);
    if (!slug) return { ok: false, error: SLUG_UNUSABLE };
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
  // Eigene CI-Farben erst ab Pro (Tarifseite). Name/Adresse bleiben für alle frei.
  if (colorPatch.length && !isPro(account)) return { ok: false, error: PRO_REQUIRED };
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
  expectedAccountId: string,
  langs: string[],
): Promise<{ ok: true; languages: ExtraLang[] } | { ok: false; error: string }> {
  const ctx = await requireAccount();
  const switched = orgSwitchedError(expectedAccountId, ctx);
  if (switched) return { ok: false, error: switched };
  const { account } = ctx;
  const supabase = await createClient();

  // Vorherige Sprachen: für das Tarif-Gate und den Delta-Backfill (nur NEU aktivierte nachziehen).
  const { data: prevRow } = await supabase
    .from("accounts")
    .select("languages")
    .eq("id", account.id)
    .single();
  const prev = new Set(
    ((prevRow?.languages as string[] | null) ?? []).filter(isExtraLang) as ExtraLang[],
  );

  const clean = [...new Set(langs.filter(isExtraLang))] as ExtraLang[];
  // Mehrsprachigkeit ist ein Business-Feature: nur das EINSCHALTEN ist gesperrt. Abschalten —
  // auch einzeln, etwa nach einem Herabstufen mit noch zwei aktiven Sprachen — geht immer
  // (vorher scheiterte das Abschalten von einer von zwei Sprachen an diesem Gate).
  if (clean.some((l) => !prev.has(l)) && !isBusiness(account)) {
    return { ok: false, error: BUSINESS_REQUIRED };
  }
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
export const setThemeMode = withUserErrors(async function setThemeMode(
  expectedAccountId: string,
  mode: "manual" | "ai" | "extreme",
) {
  const ctx = await requireAccount();
  assertActiveAccount(expectedAccountId, ctx);
  const { account } = ctx;
  // KI-Design (ai/extreme) ist ein Business-Feature; zurück auf manuell geht immer.
  if (mode !== "manual" && !isBusiness(account)) throw new UserError(BUSINESS_REQUIRED);
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
});
