import { type NextRequest } from "next/server";
import { after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  accountForRecorderToken,
  recorderJson,
  recorderPreflight,
} from "@/lib/recorder";
import {
  PLAN_LIMIT_CODE,
  TUTORIAL_QUOTA_MESSAGE,
  tutorialQuotaReachedFor,
} from "@/lib/tutorial-quota";
import { takeHourlyAiRun } from "@/lib/ai-run-limit";
import {
  validateGuideSteps,
  highlightFromRect,
  suggestedBlurHighlights,
  templateTitle,
  templateBodyText,
  mkBody,
  defaultGuideTitle,
  parseGuideTarget,
  parseGuideCategory,
  MAX_GUIDE_STEPS,
  type GuideStepInput,
  type GuideTarget,
} from "@/lib/guide";
import {
  refineGuideSteps,
  refineStepFromGuide,
  refineContextFromGuide,
  isResultStep,
  type RefineStep,
} from "@/lib/guide-ai";
import { invalidateTutorialTags } from "@/lib/cache-tags";
import { normalizeDomain, mergeDomains } from "@/lib/site-domains";

// Sofort-Anleitung (Welle 22), Schritt 2: complete.
// Nachdem die Extension alle WebPs an die signierten URLs hochgeladen hat, meldet sie
// hier Titel + die Schritte (Pfad, Label, Aktion, rect, url, Bildmaße). Wir prüfen den
// Token erneut, validieren streng (Pfad-Präfix aufs Konto, rect 0..1 geklemmt, Label/
// Titel gekappt, ≤40 Schritte) und legen daraus einen Tutorial-ENTWURF an:
//   • title = übergebener Titel oder „Anleitung vom {Datum}"
//   • je Schritt: Vorlagen-Titel/-Text, ein Highlight-Rechteck (Primärfarbe, rounded),
//     image_path/width/height
//   • lineare Verkettung (null-Label-Branches) + root_step_id — Verkabelung EXAKT wie
//     scripts/seed-steply-help.mjs.
//
// AUFNAHME-ANKER (Welle 27, ADDITIV): Ist optional ein `target` mitgeschickt, wird die
// Aufnahme in ein BESTEHENDES Entwurfs-Tutorial an genau dieser Stelle eingehängt statt
// als neues Tutorial. Streng gegen die DB validiert (Konto-Eigentum, Entwurf, Anker
// gehört zum Tutorial, ≤40 Schritte gesamt). Bei JEDEM ungültigen Ziel: FALLBACK auf das
// heutige Verhalten (neues Tutorial), Antwort mit `fallback: true` + Grund — eine
// Aufnahme geht NIE verloren. Fehlt `target` ganz: exakt wie bisher (kein fallback-Feld).
//
// Danach via after() EIN billiger, ausfallsicherer KI-Feinschliff der (NEUEN) Texte.
// FREE_TUTORIAL_LIMIT gilt nur fürs NEUE-Tutorial (auch beim Fallback). CORS: siehe lib/recorder.ts.

export const maxDuration = 30;

export async function OPTIONS() {
  return recorderPreflight();
}

// Kostenbremse (v2.19.2): KI-Feinschliff nach einer Aufnahme höchstens so oft je Stunde und
// Person (eigener Zähler neben dem Editor-Knopf „Texte mit KI verbessern“, 30/h). Darüber
// wird NUR der Feinschliff übersprungen — die Aufnahme selbst landet immer (Vorlagen-Texte).
const GUIDE_REFINE_RUNS_PER_HOUR = 30;

// Wiederholungs-Schutz (v2.19.2): Geht die Antwort verloren und die Erweiterung schickt
// dieselbe Aufnahme erneut (gleicher Upload-Ordner aus dem Handshake), liefern wir das schon
// angelegte Ergebnis zurück statt eine zweite Anleitung anzulegen. Gesucht wird in den jüngst
// angelegten Anleitungen des Kontos (+ dem Einfüge-Ziel) — signierte Upload-URLs gelten ohnehin
// nur ~2 h, 24 h Rückblick reichen also sicher. Keine neue Spalte nötig.
const IDEMPOTENCY_LOOKBACK_MS = 24 * 60 * 60 * 1000;

/** Gemeinsamer Upload-Ordner aller Schritt-Bilder ({konto}/guide-{uuid}) — oder null. */
function uploadFolderOf(steps: GuideStepInput[]): string | null {
  const folders = new Set(steps.map((s) => s.path.slice(0, s.path.lastIndexOf("/"))));
  if (folders.size !== 1) return null;
  const folder = [...folders][0];
  return /\/guide-[0-9a-f-]{36}$/i.test(folder) ? folder : null;
}

/** Anleitung, die schon Schritte aus diesem Upload-Ordner hat (oder null). Wirft nie. */
async function tutorialFromUpload(
  admin: SupabaseClient,
  accountId: string,
  folder: string,
  targetTutorialId: string | null,
): Promise<string | null> {
  try {
    const since = new Date(Date.now() - IDEMPOTENCY_LOOKBACK_MS).toISOString();
    const { data: recent } = await admin
      .from("tutorials")
      .select("id")
      .eq("account_id", accountId)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(100);
    const ids = (recent ?? []).map((t) => t.id as string);
    if (targetTutorialId) {
      const { data: tgt } = await admin
        .from("tutorials")
        .select("id")
        .eq("id", targetTutorialId)
        .eq("account_id", accountId)
        .maybeSingle();
      if (tgt && !ids.includes(tgt.id as string)) ids.push(tgt.id as string);
    }
    if (!ids.length) return null;
    const { data: hit } = await admin
      .from("steps")
      .select("tutorial_id")
      .in("tutorial_id", ids)
      .like("image_path", `${folder}/%`)
      .limit(1);
    return hit && hit.length ? (hit[0].tutorial_id as string) : null;
  } catch (e) {
    console.error("[guide-complete] Wiederholungs-Prüfung:", e instanceof Error ? e.message : e);
    return null;
  }
}

// Eine gespeicherte Step-Zeile (Eingabe des KI-Feinschliffs, der nur über NEUE Schritte läuft).
type SavedStep = RefineStep & { id: string };

/**
 * Baut die DB-Zeilen für die (neuen) Schritte — identisch für den Neu-Tutorial- und den
 * Einfüge-Pfad. `posBase` verschiebt die Positionen (beim Einfügen hinter die bestehenden).
 */
function buildStepRows(steps: GuideStepInput[], tutorialId: string, posBase: number) {
  return steps.map((s, i) => ({
    id: crypto.randomUUID(),
    tutorial_id: tutorialId,
    title: templateTitle(s, i),
    body: mkBody(templateBodyText(s, i > 0 ? steps[i - 1] : null)),
    image_path: s.path,
    image_width: s.w,
    image_height: s.h,
    // Seiten-Kontext (Welle 31c): URL der Seite zum Klick-Zeitpunkt. Bisher verworfen —
    // jetzt persistiert (Basis für „Für diese Seite" + site_domains-Seeding). Leer → null.
    page_url: s.url || null,
    // Klick-Rechteck + (Welle 28) je ein „blur“-Highlight pro sensiblem Feld (suggested:true).
    // Ohne `sensitive` bleibt es beim einen Rechteck – exakt das heutige Verhalten.
    highlights: [highlightFromRect(s.rect), ...suggestedBlurHighlights(s.sensitive)],
    // selector (Welle 24): Vorbau für Live-Führung. Fehlt bei alten Extensions -> null.
    selector: s.selector ?? null,
    // file_meta (Welle 39, Datei-Brücke): {role:download|upload, filename, mime, size} — NUR
    // Metadaten, nie Datei-Bytes. Fehlt bei normalen Schritten/alten Extensions -> null.
    file_meta: s.file_meta ?? null,
    // condition (Welle 42, bedingte Schritte): {kind:element|url, …} — vom Menschen ignoriert,
    // vom Automations-Lauf ausgewertet. Fehlt bei normalen Schritten/alten Extensions -> null.
    condition: s.condition ?? null,
    // jump (Welle 47, bedingter Sprung/Block-Überspringen): {when, to_position} — vom Menschen
    // ignoriert, vom Automations-Lauf ausgewertet. Fehlt bei normalen Schritten -> null.
    jump: s.jump ?? null,
    // interaction (Welle 48): Enter/Rechtsklick/Doppelklick/Ziehen/Kürzel/Hover/iframe — Text,
    // Live-Führung und Automations-Lauf werten es aus. NUR mitschicken, wenn vorhanden: so
    // bleiben normale Aufnahmen auch dann heil, falls Migration 0036 noch fehlt.
    ...(s.interaction ? { interaction: s.interaction } : {}),
    position: posBase + i + 1,
    is_decision: false,
  }));
}

/**
 * Seiten-Kontext säen (Welle 31c): aus den (neuen) Schritt-URLs die distinct normalisierten
 * Basis-Domains ableiten und `tutorials.site_domains` als Union mit dem Bestand setzen (max
 * 10, dedupliziert, sortiert). Läuft für BEIDE Pfade (neues Tutorial + Einfügen in ein
 * bestehendes). Wirft NIE — ein Fehler hier darf die Aufnahme-Antwort niemals kippen.
 */
async function seedSiteDomains(
  admin: SupabaseClient,
  tutorialId: string,
  steps: GuideStepInput[],
): Promise<void> {
  try {
    const add: string[] = [];
    const seen = new Set<string>();
    for (const s of steps) {
      const d = normalizeDomain(s.url || "");
      if (d && !seen.has(d)) {
        seen.add(d);
        add.push(d);
      }
    }
    if (!add.length) return; // keine plausiblen Domains → nichts zu tun

    const { data: tut } = await admin
      .from("tutorials")
      .select("site_domains")
      .eq("id", tutorialId)
      .maybeSingle();
    const existing = Array.isArray(tut?.site_domains) ? (tut.site_domains as string[]) : [];
    const merged = mergeDomains(existing, add);
    // Nur schreiben, wenn sich etwas ändert (spart ein Update beim reinen Einfügen).
    if (merged.length === existing.length && merged.every((d, i) => d === existing[i])) return;
    await admin.from("tutorials").update({ site_domains: merged }).eq("id", tutorialId);
  } catch (e) {
    console.error("[guide-complete] site_domains:", e instanceof Error ? e.message : e);
  }
}

/**
 * Kategorie zuordnen (Welle 31d, ADDITIV): das optionale `category` aus dem Body auf das
 * NEU angelegte Tutorial anwenden. ENTWEDER { id } (bestehende) ODER { name } (neu/vorhanden).
 *   • { id }:   gehört die Kategorie dem Konto? → category_id setzen; fremde/unbekannte id →
 *               still ignorieren (kein Fehler, Aufnahme geht nie verloren).
 *   • { name }: existiert (case-insensitiv) schon eine Kategorie dieses Namens → die nehmen;
 *               sonst anlegen (max-position+1, wie createCategory in tutorials/[id]/actions.ts).
 * Wirft NIE — jeder Fehler wird geloggt, schlimmstenfalls bleibt das Tutorial ohne Kategorie.
 * NUR für den Neu-Tutorial-Pfad gedacht (der Einfüge-Pfad ruft dies gar nicht auf).
 */
async function applyGuideCategory(
  admin: SupabaseClient,
  accountId: string,
  tutorialId: string,
  raw: unknown,
): Promise<void> {
  try {
    const cat = parseGuideCategory(raw);
    if (!cat) return; // fehlt/kaputt → still ignorieren

    let categoryId: string | null = null;
    if ("id" in cat) {
      // Eigentums-Check: nur Kategorien DES Kontos (globale mit account_id IS NULL zählen nicht).
      const { data: row } = await admin
        .from("categories")
        .select("id")
        .eq("id", cat.id)
        .eq("account_id", accountId)
        .maybeSingle();
      if (!row) return; // fremde/unbekannte id → still ignorieren
      categoryId = row.id as string;
    } else {
      // name: case-insensitiver Abgleich gegen die Konto-Kategorien; sonst neu anlegen.
      const { data: existing } = await admin
        .from("categories")
        .select("id, name, position")
        .eq("account_id", accountId);
      const list = existing ?? [];
      const wanted = cat.name.toLocaleLowerCase("de-DE");
      const hit = list.find(
        (c) => String(c.name ?? "").toLocaleLowerCase("de-DE") === wanted,
      );
      if (hit) {
        categoryId = hit.id as string;
      } else {
        const maxPos = list.reduce((m, c) => Math.max(m, Number(c.position) || 0), -1);
        const { data: created } = await admin
          .from("categories")
          .insert({ account_id: accountId, name: cat.name, position: maxPos + 1 })
          .select("id")
          .single();
        categoryId = created ? (created.id as string) : null;
      }
    }

    if (categoryId) {
      await admin.from("tutorials").update({ category_id: categoryId }).eq("id", tutorialId);
    }
  } catch (e) {
    console.error("[guide-complete] category:", e instanceof Error ? e.message : e);
  }
}

/**
 * Die neuen Schritte für den after()-Feinschliff aufbereiten (Vorlagen-Texte pro Schritt).
 * Datenschutz (Welle 54): ein getippter Wert geht NICHT an die KI — guide-ai.ts ersetzt ihn im
 * Prompt durch {{WERT}} und setzt ihn danach wieder ein; so werden auch Eingaben geglättet.
 */
function refineInput(steps: GuideStepInput[], rows: { id: string }[]): SavedStep[] {
  return rows
    .map((r, i) => ({ id: r.id, ...refineStepFromGuide(steps, i) }))
    // Abschluss-Bild (Welle 55): kein KI-Feinschliff — „Ergebnis“ bleibt stehen.
    .filter((_, i) => !isResultStep(steps[i]));
}

/** Feinschliff im Hintergrund starten (Titel des Ziel-Tutorials wird dafür nachgeschlagen). */
function scheduleRefine(
  admin: SupabaseClient,
  userId: string,
  tutorialId: string,
  steps: GuideStepInput[],
  rows: { id: string }[],
) {
  after(async () => {
    try {
      if (!(await takeHourlyAiRun(userId, "guide_refine_runs", GUIDE_REFINE_RUNS_PER_HOUR))) {
        console.warn("[guide-complete] Feinschliff übersprungen: Stunden-Limit erreicht.");
        return;
      }
      const { data: tut } = await admin.from("tutorials").select("title").eq("id", tutorialId).maybeSingle();
      await refineGuideSteps(
        admin,
        refineContextFromGuide((tut?.title as string | null) ?? null, steps),
        refineInput(steps, rows),
      );
    } catch (e) {
      console.error("[guide-complete] Feinschliff:", e instanceof Error ? e.message : e);
    }
  });
}

type InsertResult =
  | { ok: true; rows: { id: string }[] }
  | { ok: false; reason: string };

/**
 * Aufnahme in ein BESTEHENDES Entwurfs-Tutorial an einem Anker einhängen (Welle 27).
 * Validiert streng gegen die DB und verweigert bei jedem Zweifel (die Route macht dann
 * Fallback auf ein neues Tutorial). Kettenverdrahtung EXAKT wie das Builder-Einfügen
 * (§7.4, insertIntoBranch/insertAfter): die Anker-Verbindung zeigt auf den ersten neuen
 * Schritt, der letzte neue Schritt übernimmt das bisherige Ziel. root_step_id bleibt.
 */
async function insertIntoTarget(
  admin: SupabaseClient,
  accountId: string,
  target: GuideTarget,
  steps: GuideStepInput[],
): Promise<InsertResult> {
  // 1) Ziel-Tutorial: existiert, gehört dem Konto, ist ENTWURF.
  const { data: tut } = await admin
    .from("tutorials")
    .select("id, account_id, status")
    .eq("id", target.tutorialId)
    .maybeSingle();
  if (!tut) return { ok: false, reason: "Die Ziel-Anleitung wurde nicht gefunden." };
  if (tut.account_id !== accountId) {
    return { ok: false, reason: "Die Ziel-Anleitung gehört zu einem anderen Konto." };
  }
  if (tut.status !== "draft") {
    return { ok: false, reason: "Nur Entwürfe können ergänzt werden — das Ziel ist bereits veröffentlicht." };
  }

  // 2) Bestehende Schritte laden (Eigentums-Check des Ankers + Schrittzahl-Grenze + max. Position).
  const { data: existing } = await admin
    .from("steps")
    .select("id, position")
    .eq("tutorial_id", target.tutorialId);
  const existingSteps = existing ?? [];
  const stepIds = new Set(existingSteps.map((s) => s.id as string));
  if (stepIds.size + steps.length > MAX_GUIDE_STEPS) {
    return {
      ok: false,
      reason: `Die Ziel-Anleitung hätte damit mehr als ${MAX_GUIDE_STEPS} Schritte.`,
    };
  }
  const maxPos = existingSteps.reduce((m, s) => Math.max(m, Number(s.position) || 0), 0);

  // 3) Anker auflösen: WELCHE Verbindung wird auf den ersten neuen Schritt umgebogen und
  //    WELCHES bisherige Ziel übernimmt der letzte neue Schritt (oldTarget)?
  //    anchorBranchId != null -> bestehende Kante umbiegen; sonst neue Kante ab newBranchFrom.
  let anchorBranchId: string | null = null;
  let newBranchFrom: string | null = null; // afterStep OHNE ausgehende Kante (Blatt/Ende)
  let oldTarget: string | null = null;
  // Anfang einer LEEREN Anleitung (Welle 53): afterStepId === tutorialId ist der vereinbarte
  // Anker „ganz am Anfang“ (die Steply-Erweiterung reicht Anker-IDs unverändert durch). Nur
  // gültig, solange die Anleitung wirklich keine Schritte hat; der erste neue Schritt wird Start.
  let atStart = false;

  if ("branchId" in target.anchor) {
    const { data: br } = await admin
      .from("step_branches")
      .select("id, step_id, target_step_id")
      .eq("id", target.anchor.branchId)
      .maybeSingle();
    if (!br) return { ok: false, reason: "Der Verzweigungs-Ast wurde nicht gefunden." };
    // Ast gehört zum Ziel-Tutorial? -> sein Quell-Schritt muss einer der Tutorial-Schritte sein.
    if (!stepIds.has(br.step_id as string)) {
      return { ok: false, reason: "Der Ast gehört nicht zu dieser Anleitung." };
    }
    anchorBranchId = br.id as string;
    oldTarget = (br.target_step_id as string | null) ?? null;
  } else {
    const afterStepId = target.anchor.afterStepId;
    atStart = afterStepId === target.tutorialId;
    if (atStart && stepIds.size > 0) {
      return {
        ok: false,
        reason: "Die Anleitung hat inzwischen Schritte — bitte an einer Stelle im Ablauf aufnehmen.",
      };
    }
    if (!atStart && !stepIds.has(afterStepId)) {
      return { ok: false, reason: "Der Anker-Schritt gehört nicht zu dieser Anleitung." };
    }
    // Die (lineare) Verbindung, die bisher von afterStep weiterführte = erste ausgehende
    // Kante (nach position). Fehlt sie, ist afterStep ein Blatt -> neue Kante anlegen.
    const { data: outs } = atStart
      ? { data: [] as { id: string; target_step_id: string | null; position: number }[] }
      : await admin
          .from("step_branches")
          .select("id, target_step_id, position")
          .eq("step_id", afterStepId)
          .order("position", { ascending: true });
    if (atStart) {
      // keine Anker-Kante: die neue Kette wird selbst der Anfang (root_step_id unten)
    } else if (outs && outs.length) {
      anchorBranchId = outs[0].id as string;
      oldTarget = (outs[0].target_step_id as string | null) ?? null;
    } else {
      newBranchFrom = afterStepId;
      oldTarget = null;
    }
  }

  // 4) Neue Schritte + lineare Kette anlegen (hinter die bestehenden Positionen).
  const rows = buildStepRows(steps, target.tutorialId, maxPos);
  const { error: se } = await admin.from("steps").insert(rows);
  if (se) return { ok: false, reason: "Die Schritte konnten nicht gespeichert werden." };

  // Kette N1->N2->…; der LETZTE neue Schritt übernimmt oldTarget (falls vorhanden = Rejoin).
  type ChainRow = {
    id: string;
    step_id: string;
    label: null;
    target_step_id: string | null;
    position: number;
  };
  const chain: ChainRow[] = rows.slice(0, -1).map((r, i) => ({
    id: crypto.randomUUID(),
    step_id: r.id,
    label: null,
    target_step_id: rows[i + 1].id,
    position: 0,
  }));
  if (oldTarget) {
    chain.push({
      id: crypto.randomUUID(),
      step_id: rows[rows.length - 1].id,
      label: null,
      target_step_id: oldTarget,
      position: 0,
    });
  }
  if (chain.length) {
    const { error: ce } = await admin.from("step_branches").insert(chain);
    if (ce) {
      await admin.from("steps").delete().in("id", rows.map((r) => r.id)); // Aufräumen (kaskadiert die Ketten-Kanten)
      return { ok: false, reason: "Die Verkettung konnte nicht gespeichert werden." };
    }
  }

  // 5) ZULETZT die Anker-Verbindung auf den ersten neuen Schritt umbiegen (Kette ist fertig).
  if (anchorBranchId) {
    const { error: ue } = await admin
      .from("step_branches")
      .update({ target_step_id: rows[0].id })
      .eq("id", anchorBranchId);
    if (ue) {
      await admin.from("steps").delete().in("id", rows.map((r) => r.id));
      return { ok: false, reason: "Die Anker-Verbindung konnte nicht aktualisiert werden." };
    }
  } else if (newBranchFrom) {
    const { error: be } = await admin.from("step_branches").insert({
      id: crypto.randomUUID(),
      step_id: newBranchFrom,
      label: null,
      target_step_id: rows[0].id,
      position: 0,
    });
    if (be) {
      await admin.from("steps").delete().in("id", rows.map((r) => r.id));
      return { ok: false, reason: "Die Anker-Verbindung konnte nicht angelegt werden." };
    }
  }

  if (atStart) {
    const { error: re } = await admin
      .from("tutorials")
      .update({ root_step_id: rows[0].id })
      .eq("id", target.tutorialId);
    if (re) {
      await admin.from("steps").delete().in("id", rows.map((r) => r.id));
      return { ok: false, reason: "Der Anfang der Anleitung konnte nicht gesetzt werden." };
    }
  }

  // root_step_id wird beim Einfügen sonst NIE angefasst. Cache: Draft-Edits schonen den Kunden-
  // Cache (invalidateTutorialTags kehrt für Entwürfe früh zurück, wie die Nachbar-Mutationen).
  await invalidateTutorialTags(target.tutorialId);

  return { ok: true, rows };
}

/** Neues Tutorial anlegen (heutiges Verhalten) — genutzt vom Standard- und vom Fallback-Pfad. */
async function createNewTutorial(
  admin: SupabaseClient,
  accountId: string,
  userId: string,
  title: string,
  steps: GuideStepInput[],
): Promise<{ tutorialId: string } | { error: string; status: number }> {
  const { data: tut, error: te } = await admin
    .from("tutorials")
    .insert({ account_id: accountId, title, status: "draft" })
    .select("id")
    .single();
  if (te || !tut) return { error: "Der Entwurf konnte nicht angelegt werden.", status: 500 };
  const tutorialId = tut.id as string;

  const stepRows = buildStepRows(steps, tutorialId, 0);
  const { error: se } = await admin.from("steps").insert(stepRows);
  if (se) {
    await admin.from("tutorials").delete().eq("id", tutorialId);
    return { error: "Die Schritte konnten nicht gespeichert werden.", status: 500 };
  }

  // root_step_id + lineare null-Label-Branch-Kette (EXAKT wie seed-steply-help.mjs).
  await admin.from("tutorials").update({ root_step_id: stepRows[0].id }).eq("id", tutorialId);
  const branches = stepRows.slice(0, -1).map((r, i) => ({
    id: crypto.randomUUID(),
    step_id: r.id,
    label: null,
    target_step_id: stepRows[i + 1].id,
    position: 0,
  }));
  if (branches.length) await admin.from("step_branches").insert(branches);

  scheduleRefine(admin, userId, tutorialId, steps, stepRows);
  return { tutorialId };
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    token?: unknown;
    title?: unknown;
    steps?: unknown;
    target?: unknown;
    category?: unknown;
  };

  const account = await accountForRecorderToken(body?.token);
  if (!account) {
    return recorderJson({ error: "Ungültiger oder unbekannter Verbindungs-Token." }, 401);
  }

  // Schritte streng validieren (Pfad-Präfix aufs Konto, rect clampen, ≤40). Wirft mit
  // deutscher Meldung → 400.
  let steps;
  try {
    steps = validateGuideSteps(body?.steps, account.id);
  } catch (e) {
    return recorderJson({ error: e instanceof Error ? e.message : "Ungültige Schritte." }, 400);
  }

  const admin = createAdminClient();
  const parsed = body?.target != null ? parseGuideTarget(body.target) : null;

  // ── Wiederholung derselben Aufnahme (gleicher Upload-Ordner) → vorhandenes Ergebnis ──
  // Vor dem Free-Limit: sonst bekäme ein Retry nach verlorener Antwort beim 5. Entwurf ein 403.
  const folder = uploadFolderOf(steps);
  if (folder) {
    const existingId = await tutorialFromUpload(admin, account.id, folder, parsed?.tutorialId ?? null);
    if (existingId) {
      if (parsed && existingId === parsed.tutorialId) {
        return recorderJson({ tutorialId: existingId, inserted: true, repeated: true });
      }
      return recorderJson(
        body?.target != null
          ? {
              tutorialId: existingId,
              fallback: true,
              fallbackReason: "Die Aufnahme war bereits als eigene Anleitung gespeichert.",
              repeated: true,
            }
          : { tutorialId: existingId, repeated: true },
      );
    }
  }

  // ── Aufnahme-Anker (Welle 27): nur wenn ein `target` mitgeschickt wurde ──────────
  // Kein Fallback-Feld, wenn gar kein Ziel dabei war (Abwärtskompatibilität).
  let fallbackReason = "";
  if (body?.target != null) {
    if (!parsed) {
      fallbackReason = "Die Zielangabe war unvollständig oder ungültig.";
    } else {
      const ins = await insertIntoTarget(admin, account.id, parsed, steps);
      if (ins.ok) {
        // Seiten-Kontext (Welle 31c): site_domains als Union mit dem Ziel-Tutorial säen.
        await seedSiteDomains(admin, parsed.tutorialId, steps);
        // KI-Feinschliff NUR über die neuen Schritte.
        scheduleRefine(admin, account.userId, parsed.tutorialId, steps, ins.rows);
        return recorderJson({ tutorialId: parsed.tutorialId, inserted: true });
      }
      fallbackReason = ins.reason;
    }
  }

  // ── Neues Tutorial (Standard-Pfad UND Fallback) — Free-Limit gilt hier ───────────
  if (await tutorialQuotaReachedFor(admin, account.id)) {
    return recorderJson({ error: TUTORIAL_QUOTA_MESSAGE, code: PLAN_LIMIT_CODE }, 403);
  }

  const rawTitle = typeof body?.title === "string" ? body.title.trim() : "";
  const title = rawTitle ? rawTitle.slice(0, 120) : defaultGuideTitle();

  const created = await createNewTutorial(admin, account.id, account.userId, title, steps);
  if ("error" in created) return recorderJson({ error: created.error }, created.status);

  // Seiten-Kontext (Welle 31c): site_domains des neuen Tutorials aus den Schritt-URLs säen.
  await seedSiteDomains(admin, created.tutorialId, steps);

  // Kategorie (Welle 31d): optionales `category` NUR im Neu-Tutorial-Pfad (Standard + Fallback)
  // anwenden. Fehlerresistent — kippt die Aufnahme-Antwort niemals (schlimmstenfalls ohne Kategorie).
  await applyGuideCategory(admin, account.id, created.tutorialId, body?.category);

  return recorderJson(
    fallbackReason
      ? { tutorialId: created.tutorialId, fallback: true, fallbackReason }
      : { tutorialId: created.tutorialId },
  );
}
