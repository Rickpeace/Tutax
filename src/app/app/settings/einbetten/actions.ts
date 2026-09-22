"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAccount } from "@/lib/account";
import { RECORDER_MAX_CONNECTIONS, recorderLabelFromUserAgent } from "@/lib/recorder-label";

// Steply-Recorder-Verbindungs-Token verwalten. Der Token authentifiziert die Browser-
// Extension gegen /api/recorder/* — statt Cookies/Sessions, weil die Extension cross-origin
// läuft. PRO PERSON und Organisation (Migration 0037), seit Migration 0041 MEHRERE je Person:
// jeder Browser/jedes Gerät bekommt eine eigene Verbindung — wer Edge verbindet, trennt
// Chrome nicht mehr. Nur Inhaber/Bearbeiter (requireAccount weist Mitarbeiter ab).

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Legt eine NEUE Verbindung an (bestehende anderer Browser bleiben gültig). Token wird
 * serverseitig via crypto.randomUUID() erzeugt (hochentropisch, uuid-Format passt zur
 * Spalte). Name grob aus dem User-Agent („Chrome · Windows“). Mehr als 10 Verbindungen je
 * Person/Konto: die am längsten ungenutzte fliegt. Gibt Token + öffentliche Kennung zurück
 * (id: null, solange Migration 0041 fehlt — dann gilt das alte Verhalten: eine je Person).
 */
export async function rotateRecorderToken(opts?: {
  manual?: boolean;
  /**
   * Kennung eines zuvor in derselben Sitzung erzeugten Codes, den der neue ersetzen soll.
   * Entfernt wird er NUR, wenn er nie benutzt wurde (last_used_at is null) und er dieser
   * Person in diesem Konto gehört — eine echte, laufende Verbindung wird nie still getrennt.
   */
  replaceUnusedId?: string | null;
}): Promise<
  { ok: true; token: string; id: string | null } | { ok: false; error: string }
> {
  const { account, userId } = await requireAccount();
  const admin = createAdminClient();
  const ua = (await headers()).get("user-agent");
  const label = (recorderLabelFromUserAgent(ua) + (opts?.manual ? " (Code)" : "")).slice(0, 80);

  const token = crypto.randomUUID();
  const ins = await admin
    .from("recorder_tokens")
    .insert({ token, account_id: account.id, user_id: userId, label })
    .select("id")
    .single();

  if (ins.error) {
    // Vor Migration 0041 (Spalte „label"/„id" fehlt bzw. Unique je Person): altes Verhalten
    // — die eine Verbindung der Person ersetzen. Nach 0041 scheitert dieser Weg (kein Unique
    // mehr) -> dann ist es ein echter Fehler.
    const legacy = await admin
      .from("recorder_tokens")
      .upsert(
        { token, account_id: account.id, user_id: userId, created_at: new Date().toISOString() },
        { onConflict: "account_id,user_id" },
      );
    if (legacy.error) return { ok: false, error: "Der Token konnte nicht erzeugt werden." };
    revalidatePath("/app/settings", "layout");
    return { ok: true, token, id: null };
  }

  const newId = ins.data.id as string;
  // „Neuen Code erzeugen“ ersetzt den Vorgänger aus derselben Sitzung, statt bei jedem
  // Klick eine dauerhaft gültige Karteileiche zu hinterlassen. Die Bedingung
  // last_used_at is null steht in der Abfrage selbst: eine bereits genutzte Verbindung
  // bleibt dadurch auch bei einem falsch mitgeschickten Wert unberührt.
  const replaceId = opts?.replaceUnusedId;
  if (replaceId && replaceId !== newId && UUID_RE.test(replaceId)) {
    await admin
      .from("recorder_tokens")
      .delete()
      .eq("id", replaceId)
      .eq("account_id", account.id)
      .eq("user_id", userId)
      .is("last_used_at", null);
  }
  await pruneConnections(admin, account.id, userId, newId);
  revalidatePath("/app/settings", "layout");
  return { ok: true, token, id: newId };
}

/** Höchstens RECORDER_MAX_CONNECTIONS je Person/Konto: die am längsten ungenutzten löschen. */
async function pruneConnections(
  admin: ReturnType<typeof createAdminClient>,
  accountId: string,
  userId: string,
  keepId: string,
) {
  const { data } = await admin
    .from("recorder_tokens")
    .select("id, created_at, last_used_at")
    .eq("account_id", accountId)
    .eq("user_id", userId);
  const rows = data ?? [];
  if (rows.length <= RECORDER_MAX_CONNECTIONS) return;
  const lastActive = (r: { created_at: string | null; last_used_at: string | null }) =>
    Math.max(Date.parse(r.created_at ?? "") || 0, Date.parse(r.last_used_at ?? "") || 0);
  const drop = rows
    .filter((r) => r.id !== keepId)
    .sort((a, b) => lastActive(a) - lastActive(b))
    .slice(0, rows.length - RECORDER_MAX_CONNECTIONS)
    .map((r) => r.id as string);
  if (drop.length) {
    await admin
      .from("recorder_tokens")
      .delete()
      .eq("account_id", accountId)
      .eq("user_id", userId)
      .in("id", drop);
  }
}

/**
 * Eine eigene Verbindung trennen (Einstellungen → Steply-Erweiterung → „Trennen“). Löscht
 * NUR eine Verbindung dieser Person in der aktiven Organisation — fremde IDs treffen nichts.
 */
export async function disconnectRecorderConnection(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { account, userId } = await requireAccount();
  if (typeof id !== "string" || !UUID_RE.test(id)) return { ok: false, error: "Unbekannte Verbindung." };
  const { data, error } = await createAdminClient()
    .from("recorder_tokens")
    .delete()
    .eq("id", id)
    .eq("account_id", account.id)
    .eq("user_id", userId)
    .select("id");
  if (error) return { ok: false, error: "Die Verbindung konnte nicht getrennt werden." };
  revalidatePath("/app/settings", "layout");
  if (!data?.length) return { ok: false, error: "Diese Verbindung gibt es nicht mehr." };
  return { ok: true };
}
