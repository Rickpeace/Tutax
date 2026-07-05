import { type NextRequest } from "next/server";
import { after } from "next/server";
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
} from "@/lib/guide";
import { refineGuideSteps } from "@/lib/guide-ai";

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
// Danach via after() EIN billiger, ausfallsicherer KI-Feinschliff der Texte (kein Vision).
// FREE_TUTORIAL_LIMIT wird respektiert (wie createTutorial). CORS: siehe lib/recorder.ts.

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

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    token?: unknown;
    title?: unknown;
    steps?: unknown;
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

  // Free-Limit prüfen (plan aus dem Konto laden).
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

  // 1) Tutorial-Entwurf anlegen.
  const { data: tut, error: te } = await admin
    .from("tutorials")
    .insert({ account_id: account.id, title, status: "draft" })
    .select("id")
    .single();
  if (te || !tut) {
    return recorderJson({ error: "Der Entwurf konnte nicht angelegt werden." }, 500);
  }
  const tutorialId = tut.id as string;

  // 2) Schritte (mit Bild, Maßen, EINEM Highlight-Rechteck) — Verkabelung wie im Seed.
  const stepRows = steps.map((s, i) => ({
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
    position: i + 1,
    is_decision: false,
  }));

  const { error: se } = await admin.from("steps").insert(stepRows);
  if (se) {
    // Aufräumen: der leere Entwurf soll nicht zurückbleiben.
    await admin.from("tutorials").delete().eq("id", tutorialId);
    return recorderJson({ error: "Die Schritte konnten nicht gespeichert werden." }, 500);
  }

  // 3) root_step_id + lineare null-Label-Branch-Kette (EXAKT wie seed-steply-help.mjs).
  await admin.from("tutorials").update({ root_step_id: stepRows[0].id }).eq("id", tutorialId);
  const branches = stepRows.slice(0, -1).map((r, i) => ({
    id: crypto.randomUUID(),
    step_id: r.id,
    label: null,
    target_step_id: stepRows[i + 1].id,
    position: 0,
  }));
  if (branches.length) await admin.from("step_branches").insert(branches);

  // 4) KI-Feinschliff (billig, ausfallsicher) NACH der Antwort — Vorlagen bleiben bei Fehler.
  after(() =>
    refineGuideSteps(
      admin,
      stepRows.map((r, i) => ({
        id: r.id,
        title: r.title,
        bodyText: templateBodyText(steps[i], i > 0 ? steps[i - 1] : null),
        label: steps[i].label,
        action: steps[i].action,
      })),
    ).catch((e) => console.error("[guide-complete] Feinschliff:", e instanceof Error ? e.message : e)),
  );

  return recorderJson({ tutorialId });
}
