import type { SupabaseClient } from "@supabase/supabase-js";

// Vor dem LÖSCHEN einer globalen Vorlage (Admin → deleteTemplate).
//
// Das Löschen entfernt per Cascade auch die account_templates-Zeilen der Kunden. Eine
// angepasste Kopie (Fork) ist danach eine ganz normale eigene Anleitung — Hilfe-Seite,
// Direkt-Link, Druck und Chatbot behandeln sie wie jede andere. Kopien, die der Kunde
// ABGESCHALTET hatte oder die verborgen waren, weil die Vorlage zentral zurückgezogen war,
// wären dadurch plötzlich wieder öffentlich. Solche Kopien setzen wir deshalb auf Entwurf:
// der Inhalt des Kunden bleibt erhalten, nur nichts wird ungefragt sichtbar.
//
// Bewusst ohne Next-/Alias-Imports → aus scripts/test-areas-e2e.mjs direkt testbar.

export type RetiredFork = { accountId: string; tutorialId: string };

export async function retireHiddenTemplateForks(
  admin: SupabaseClient,
  templateId: string,
): Promise<RetiredFork[]> {
  const [{ data: tpl }, { data: rows, error }] = await Promise.all([
    admin.from("tutorials").select("status").eq("id", templateId).maybeSingle(),
    admin
      .from("account_templates")
      .select("account_id, enabled, forked_tutorial_id")
      .eq("template_id", templateId)
      .not("forked_tutorial_id", "is", null),
  ]);
  if (error) throw new Error("Kopien der Vorlage konnten nicht geladen werden: " + error.message);
  const templateLive = tpl?.status === "published";
  const hidden = (rows ?? []).filter((r) => !templateLive || !r.enabled) as {
    account_id: string;
    forked_tutorial_id: string;
  }[];
  if (!hidden.length) return [];
  // Nur Kopien, die wirklich dem verknüpften Konto gehören (Schutz gegen gefälschte
  // Verknüpfungen auf fremde Anleitungen; seit Migration 0043 zusätzlich in der DB).
  const { data: owned } = await admin
    .from("tutorials")
    .select("id, account_id")
    .in("id", hidden.map((r) => r.forked_tutorial_id));
  const ownerOf = new Map((owned ?? []).map((t) => [t.id as string, t.account_id as string]));
  const own = hidden.filter((r) => ownerOf.get(r.forked_tutorial_id) === r.account_id);
  const ids = own.map((r) => r.forked_tutorial_id);
  if (!ids.length) return [];
  const { error: upErr } = await admin
    .from("tutorials")
    .update({ status: "draft" })
    .in("id", ids)
    .eq("status", "published");
  if (upErr) throw new Error("Verborgene Kopien konnten nicht zurückgezogen werden: " + upErr.message);
  return own.map((r) => ({ accountId: r.account_id, tutorialId: r.forked_tutorial_id }));
}
