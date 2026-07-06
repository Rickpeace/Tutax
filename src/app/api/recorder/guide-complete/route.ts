import { type NextRequest } from "next/server";
import { after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  accountForRecorderToken,
  recorderJson,
  recorderPreflight,
} from "@/lib/recorder";
import { FREE_TUTORIAL_LIMIT, isPro } from "@/lib/plan";
import {
  validateGuideSteps,
  highlightFromRect,
  templateTitle,
  templateBodyText,
  mkBody,
  defaultGuideTitle,
  parseGuideTarget,
  MAX_GUIDE_STEPS,
  type GuideStepInput,
  type GuideTarget,
} from "@/lib/guide";
import { refineGuideSteps } from "@/lib/guide-ai";
import { invalidateTutorialTags } from "@/lib/cache-tags";

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

/**
 * Free-Limit für den token-basierten Pfad (keine Session → Admin-Client).
 * Spiegelt tutorialQuotaReached aus app/app/actions.ts: eigene Tutorials OHNE
 * Template-Forks; Pro/Business = unbegrenzt.
 */
async function quotaReached(
  admin: ReturnType<typeof createAdminClient>,
  accountId: string,
  plan: string | null,
): Promise<boolean> {
  if (isPro({ plan })) return false;
  const [{ count: total }, { count: forks }] = await Promise.all([
    admin.from("tutorials").select("id", { count: "exact", head: true }).eq("account_id", accountId),
    admin
      .from("account_templates")
      .select("template_id", { count: "exact", head: true })
      .eq("account_id", accountId)
      .not("forked_tutorial_id", "is", null),
  ]);
  return (total ?? 0) - (forks ?? 0) >= FREE_TUTORIAL_LIMIT;
}

// Eine gespeicherte Step-Zeile (Rückgabe an den KI-Feinschliff, der nur über NEUE Schritte läuft).
type SavedStep = { id: string; title: string; bodyText: string; label: string; action: "click" | "type" };

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
    highlights: [highlightFromRect(s.rect)],
    // selector (Welle 24): Vorbau für Live-Führung. Fehlt bei alten Extensions -> null.
    selector: s.selector ?? null,
    position: posBase + i + 1,
    is_decision: false,
  }));
}

/** Die neuen Schritte für den after()-Feinschliff aufbereiten (Vorlagen-Texte pro Schritt). */
function refineInput(steps: GuideStepInput[], rows: { id: string }[]): SavedStep[] {
  return rows.map((r, i) => ({
    id: r.id,
    title: templateTitle(steps[i], i),
    bodyText: templateBodyText(steps[i], i > 0 ? steps[i - 1] : null),
    label: steps[i].label,
    action: steps[i].action,
  }));
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
  if (!tut) return { ok: false, reason: "Das Ziel-Tutorial wurde nicht gefunden." };
  if (tut.account_id !== accountId) {
    return { ok: false, reason: "Das Ziel-Tutorial gehört zu einem anderen Konto." };
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
      reason: `Das Ziel-Tutorial hätte damit mehr als ${MAX_GUIDE_STEPS} Schritte.`,
    };
  }
  const maxPos = existingSteps.reduce((m, s) => Math.max(m, Number(s.position) || 0), 0);

  // 3) Anker auflösen: WELCHE Verbindung wird auf den ersten neuen Schritt umgebogen und
  //    WELCHES bisherige Ziel übernimmt der letzte neue Schritt (oldTarget)?
  //    anchorBranchId != null -> bestehende Kante umbiegen; sonst neue Kante ab newBranchFrom.
  let anchorBranchId: string | null = null;
  let newBranchFrom: string | null = null; // afterStep OHNE ausgehende Kante (Blatt/Ende)
  let oldTarget: string | null = null;

  if ("branchId" in target.anchor) {
    const { data: br } = await admin
      .from("step_branches")
      .select("id, step_id, target_step_id")
      .eq("id", target.anchor.branchId)
      .maybeSingle();
    if (!br) return { ok: false, reason: "Der Verzweigungs-Ast wurde nicht gefunden." };
    // Ast gehört zum Ziel-Tutorial? -> sein Quell-Schritt muss einer der Tutorial-Schritte sein.
    if (!stepIds.has(br.step_id as string)) {
      return { ok: false, reason: "Der Ast gehört nicht zu diesem Tutorial." };
    }
    anchorBranchId = br.id as string;
    oldTarget = (br.target_step_id as string | null) ?? null;
  } else {
    const afterStepId = target.anchor.afterStepId;
    if (!stepIds.has(afterStepId)) {
      return { ok: false, reason: "Der Anker-Schritt gehört nicht zu diesem Tutorial." };
    }
    // Die (lineare) Verbindung, die bisher von afterStep weiterführte = erste ausgehende
    // Kante (nach position). Fehlt sie, ist afterStep ein Blatt -> neue Kante anlegen.
    const { data: outs } = await admin
      .from("step_branches")
      .select("id, target_step_id, position")
      .eq("step_id", afterStepId)
      .order("position", { ascending: true });
    if (outs && outs.length) {
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

  // root_step_id wird beim Einfügen NIE angefasst. Cache: Draft-Edits schonen den Kunden-
  // Cache (invalidateTutorialTags kehrt für Entwürfe früh zurück, wie die Nachbar-Mutationen).
  await invalidateTutorialTags(target.tutorialId);

  return { ok: true, rows };
}

/** Neues Tutorial anlegen (heutiges Verhalten) — genutzt vom Standard- und vom Fallback-Pfad. */
async function createNewTutorial(
  admin: SupabaseClient,
  accountId: string,
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

  after(() =>
    refineGuideSteps(admin, refineInput(steps, stepRows)).catch((e) =>
      console.error("[guide-complete] Feinschliff:", e instanceof Error ? e.message : e),
    ),
  );
  return { tutorialId };
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    token?: unknown;
    title?: unknown;
    steps?: unknown;
    target?: unknown;
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

  // ── Aufnahme-Anker (Welle 27): nur wenn ein `target` mitgeschickt wurde ──────────
  // Kein Fallback-Feld, wenn gar kein Ziel dabei war (Abwärtskompatibilität).
  let fallbackReason = "";
  if (body?.target != null) {
    const parsed = parseGuideTarget(body.target);
    if (!parsed) {
      fallbackReason = "Die Zielangabe war unvollständig oder ungültig.";
    } else {
      const ins = await insertIntoTarget(admin, account.id, parsed, steps);
      if (ins.ok) {
        // KI-Feinschliff NUR über die neuen Schritte.
        after(() =>
          refineGuideSteps(admin, refineInput(steps, ins.rows)).catch((e) =>
            console.error("[guide-complete] Feinschliff:", e instanceof Error ? e.message : e),
          ),
        );
        return recorderJson({ tutorialId: parsed.tutorialId, inserted: true });
      }
      fallbackReason = ins.reason;
    }
  }

  // ── Neues Tutorial (Standard-Pfad UND Fallback) — Free-Limit gilt hier ───────────
  const { data: acc } = await admin
    .from("accounts")
    .select("plan")
    .eq("id", account.id)
    .maybeSingle();
  if (await quotaReached(admin, account.id, (acc?.plan as string | null) ?? null)) {
    return recorderJson(
      { error: "Das Tutorial-Limit des kostenlosen Tarifs ist erreicht. Bitte upgraden." },
      403,
    );
  }

  const rawTitle = typeof body?.title === "string" ? body.title.trim() : "";
  const title = rawTitle ? rawTitle.slice(0, 120) : defaultGuideTitle();

  const created = await createNewTutorial(admin, account.id, title, steps);
  if ("error" in created) return recorderJson({ error: created.error }, created.status);

  return recorderJson(
    fallbackReason
      ? { tutorialId: created.tutorialId, fallback: true, fallbackReason }
      : { tutorialId: created.tutorialId },
  );
}
