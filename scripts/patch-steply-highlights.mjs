// Nachtrags-Skript (Welle 35, Teil B): setzt die EXPLIZITEN Markierungs-Entscheidungen aus
// scripts/steply-help-content.mjs (Feld `highlight`) auf die Steply-Doku-Schritte — OHNE die
// komplette Screenshot-Pipeline neu laufen zu lassen (die Bilder existieren und sind gut).
//
//   • highlight: { x, y, w, h }  -> Hand-Markierung (rect, Primaerfarbe, rounded) setzen
//   • highlight: null            -> BEWUSST ohne Markierung: sicherstellen, dass keine da ist
//   • highlight fehlt            -> Schritt NICHT anfassen (behaelt seine Auto-Markierung)
//
// SICHERHEIT: strikt KONTO-scoped auf das Steply-Doku-Konto (slug „steply"); es wird KEIN
// anderes Konto adressiert (Lehre aus dem Template-Incident). Reine rect-Highlights -> kein
// Blur-Einbrennen, keine Bildkopie noetig. IDEMPOTENT: schon korrekte Schritte werden nicht
// erneut geschrieben (kein id-Churn). Alle IDs werden geloggt.
//
// CACHE: Der Viewer/die Guide-API lesen published Highlights direkt aus steps.highlights. Dieses
// Skript schreibt per Admin-Client (kein updateTag); die oeffentlichen Seiten frischen via
// cacheLife('hours') binnen 1 h nach — akzeptabel (kein Sofort-Bedarf).
//
// Nutzung:  node --env-file=.env.local scripts/patch-steply-highlights.mjs
import { createClient } from "@supabase/supabase-js";
import { TUTORIALS } from "./steply-help-content.mjs";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false },
});
const PRIMARY = "#ef6a4e"; // Koralle (Warm-Redesign 07/2026)
const EPS = 1e-6;

// Konto „Steply" (slug „steply") — HART verdrahtet, kein anderes Konto.
const { data: acc, error: accErr } = await admin.from("accounts").select("id, slug").eq("slug", "steply").single();
if (accErr || !acc) { console.error("Steply-Konto (slug steply) nicht gefunden."); process.exit(1); }
console.log("Konto Steply:", acc.id, "\n");

function wantHighlights(h) {
  if (h == null) return [];
  return [{ type: "rect", x: h.x, y: h.y, w: h.w, h: h.h, color: PRIMARY, rounded: true }];
}
// Geometrie-Gleichheit (id ignorieren) — fuer Idempotenz.
function sameGeom(cur, want) {
  const a = Array.isArray(cur) ? cur : [];
  if (a.length !== want.length) return false;
  for (let i = 0; i < want.length; i++) {
    const c = a[i] || {}, w = want[i];
    if (c.type !== w.type || c.color !== w.color || !!c.rounded !== !!w.rounded) return false;
    for (const k of ["x", "y", "w", "h"]) if (Math.abs((c[k] || 0) - w[k]) > EPS) return false;
  }
  return true;
}
const hlCount = (arr) => (Array.isArray(arr) ? arr.length : 0);

let setHand = 0, clearedNull = 0, keptNull = 0, unchangedHand = 0, skipped = 0, missing = 0;
const beforeAfter = []; // { title, before, after, class1 }

for (const t of TUTORIALS) {
  const { data: tut } = await admin
    .from("tutorials").select("id, title, slug").eq("account_id", acc.id).eq("slug", t.slug).maybeSingle();
  if (!tut) { console.log(`? Tutorial fehlt in DB (slug ${t.slug}) — uebersprungen`); continue; }

  const { data: steps } = await admin
    .from("steps").select("id, position, title, highlights").eq("tutorial_id", tut.id).order("position");
  const byPos = new Map((steps || []).map((s) => [s.position, s]));
  const before = (steps || []).filter((s) => hlCount(s.highlights) > 0).length;
  const class1Titles = [];

  console.log(`▓ ${tut.title}  (${tut.id})`);
  for (let i = 0; i < t.steps.length; i++) {
    const st = t.steps[i];
    if (st.highlight === undefined) continue; // normaler Schritt: nicht anfassen
    const dbStep = byPos.get(i + 1);
    if (!dbStep) { console.log(`   ! Schritt ${i + 1} fehlt in DB — uebersprungen`); missing++; continue; }

    const want = wantHighlights(st.highlight);
    const isHand = st.highlight != null;
    const already = sameGeom(dbStep.highlights, want);

    if (isHand) {
      if (already) { unchangedHand++; console.log(`   = Schritt ${i + 1} „${st.title}" — Hand-Markierung bereits gesetzt (${dbStep.id})`); continue; }
      const highlights = [{ id: crypto.randomUUID(), ...want[0] }];
      const { error } = await admin.from("steps").update({ highlights }).eq("id", dbStep.id);
      if (error) { console.error(`   ✗ Schritt ${i + 1}:`, error.message); continue; }
      setHand++;
      console.log(`   ✓ Schritt ${i + 1} „${st.title}" — Hand-Markierung gesetzt (${dbStep.id}) [${want[0].x}, ${want[0].y}, ${want[0].w}, ${want[0].h}]`);
    } else {
      // bewusst ohne (null)
      class1Titles.push(st.title);
      if (hlCount(dbStep.highlights) === 0) { keptNull++; console.log(`   · Schritt ${i + 1} „${st.title}" — bewusst ohne (bereits leer) (${dbStep.id})`); }
      else {
        const { error } = await admin.from("steps").update({ highlights: [] }).eq("id", dbStep.id);
        if (error) { console.error(`   ✗ Schritt ${i + 1}:`, error.message); continue; }
        clearedNull++;
        console.log(`   ✓ Schritt ${i + 1} „${st.title}" — bewusst ohne: Markierung entfernt (${dbStep.id})`);
      }
    }
  }

  // Nachher-Zaehlung frisch aus der DB.
  const { data: after } = await admin.from("steps").select("highlights").eq("tutorial_id", tut.id);
  const afterCount = (after || []).filter((s) => hlCount(s.highlights) > 0).length;
  beforeAfter.push({ title: tut.title, before, after: afterCount, class1: class1Titles });
  console.log("");
}

console.log("── Zusammenfassung (Markierungen je Tutorial: vorher → nachher) ──");
for (const r of beforeAfter) {
  console.log(`  ${String(r.before).padStart(2)} → ${String(r.after).padStart(2)}  ${r.title}`);
  for (const c of r.class1) console.log(`        · bewusst ohne: „${c}"`);
}
console.log(`\n✓ Fertig: ${setHand} Hand-Markierungen neu gesetzt, ${unchangedHand} schon korrekt, ` +
  `${clearedNull} geleert, ${keptNull} bewusst-ohne bestaetigt` + (missing ? `, ${missing} fehlend` : "") + (skipped ? `, ${skipped} uebersprungen` : "") + ".");
