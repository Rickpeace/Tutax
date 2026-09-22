// Welle 52a: Spielt die Screenshots + Markierungen + Live-Führungs-Selektoren aus einem
// shoot-steply-help.mjs-Lauf in die Steply-Selbstdoku (/h/steply) ein.
//
// Getrennt vom Fotografieren, damit (a) das Fotografieren NIE in die Doku schreibt und (b) vor
// dem Einspielen ein Mensch die Bilder sichten kann. Liest <ordner>/manifest.json + PNGs.
//
// SICHERHEIT: strikt auf das Doku-Konto (slug „steply“) beschränkt. Vor dem ersten Schreiben
// wird ALLES geprüft (jeder Schritt hat ein Bild; Anleitung per Slug + Schrittzahl + Schritt-
// Titel stimmen mit scripts/steply-help-content.mjs überein). Passt etwas nicht, wird nichts
// geschrieben — dann zuerst delete-steply-help.mjs + seed-steply-help.mjs laufen lassen.
//
// Pro Schritt: Bild (WebP) in tutorial-images UND tutorial-images-public (Doku ist
// veröffentlicht), highlights (explizites `highlight` im Inhalt hat Vorrang vor der Auto-Box),
// selector (nur Ziele mit geprüfter Live-Führung). Die öffentlichen Seiten frischen über
// cacheLife binnen ~1 h nach.
//
// Nutzung:
//   node --env-file=.env.local scripts/apply-steply-help-shots.mjs [--in <ordner>] --dry-run
//   node --env-file=.env.local scripts/apply-steply-help-shots.mjs [--in <ordner>]
// Standard-Ordner: scripts/.shots-steply-help/
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { TUTORIALS } from "./steply-help-content.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const argOf = (n) => {
  const i = argv.indexOf(n);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : null;
};
const DRY = argv.includes("--dry-run");
const IN = path.resolve(argOf("--in") || path.join(__dirname, ".shots-steply-help"));
const HIGHLIGHT_COLOR = "#ef6a4e"; // Primär-Koralle (Warm-Redesign 07/2026)

const manifestPath = path.join(IN, "manifest.json");
if (!existsSync(manifestPath)) {
  console.error("Kein manifest.json in", IN, "— zuerst shoot-steply-help.mjs laufen lassen.");
  process.exit(1);
}
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const shots = manifest.shots || {};
console.log(`${DRY ? "TROCKENLAUF — es wird nichts geschrieben.\n" : ""}Bilder aus ${IN} (fotografiert ${manifest.createdAt})\n`);

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false },
});
const { data: acc } = await admin.from("accounts").select("id").eq("slug", "steply").maybeSingle();
if (!acc) {
  console.error("Steply-Konto (slug „steply“) nicht gefunden — zuerst seed-steply-help.mjs.");
  process.exit(1);
}

// ── 1. Alles prüfen, bevor irgendetwas geschrieben wird ──────────────────────────────────
const plan = []; // { t, st, i, stepId, tutId, shot }
const problems = [];
for (const t of TUTORIALS) {
  const { data: tut } = await admin
    .from("tutorials").select("id, title").eq("account_id", acc.id).eq("slug", t.slug).maybeSingle();
  if (!tut) { problems.push(`Anleitung fehlt (slug ${t.slug}) — erst seeden`); continue; }
  if (tut.title !== t.title) problems.push(`„${t.slug}“: Titel in der DB „${tut.title}“ ≠ Inhalt „${t.title}“ — Inhalt veraltet, erst delete + seed`);
  const { data: steps } = await admin.from("steps").select("id, position, title").eq("tutorial_id", tut.id).order("position");
  if ((steps || []).length !== t.steps.length) {
    problems.push(`„${t.title}“: ${steps?.length ?? 0} Schritte in der DB, ${t.steps.length} im Inhalt — erst delete + seed`);
    continue;
  }
  t.steps.forEach((st, i) => {
    const row = steps[i];
    if (row.title !== st.title) problems.push(`„${t.title}“ Schritt ${i + 1}: DB „${row.title}“ ≠ Inhalt „${st.title}“ — erst delete + seed`);
    const shot = shots[st.shot];
    if (!shot || !existsSync(path.join(IN, shot.file))) problems.push(`„${t.title}“ Schritt ${i + 1}: kein Bild „${st.shot}“`);
    else if (st.target && st.highlight === undefined && !shot.boxes?.[st.target]) problems.push(`„${t.title}“ Schritt ${i + 1}: Markierung „${st.target}“ fehlt`);
    plan.push({ t, st, i, stepId: row.id, tutId: tut.id, shot });
  });
}
if (problems.length) {
  for (const p of problems) console.log("✗ " + p);
  console.log(`\n✗ ${problems.length} Problem(e) — nichts geschrieben.`);
  process.exit(1);
}

// ── 2. Schreiben (bzw. im Trockenlauf nur anzeigen) ─────────────────────────────────────
const rect = (b) => [{ id: crypto.randomUUID(), type: "rect", x: b.x, y: b.y, w: b.w, h: b.h, color: HIGHLIGHT_COLOR, rounded: true }];
const webpCache = new Map();
let written = 0, withSel = 0, withHl = 0;
let lastTitle = "";
for (const { t, st, i, stepId, tutId, shot } of plan) {
  if (t.title !== lastTitle) { console.log(`▓ ${t.title}`); lastTitle = t.title; }
  const autoBox = st.target ? shot.boxes[st.target] : null;
  const highlights = st.highlight !== undefined ? (st.highlight ? rect(st.highlight) : []) : autoBox ? rect(autoBox) : [];
  const selector = st.target ? shot.selectors?.[st.target] ?? null : null;
  const p = `${acc.id}/${tutId}/${stepId}.webp`;
  if (highlights.length) withHl++;
  if (selector) withSel++;
  console.log(
    `   ${i + 1}. ${st.title}  ← ${st.shot}` +
      (highlights.length ? (st.highlight !== undefined ? " +Hand-Markierung" : ` +Markierung(${st.target})`) : " (ohne Markierung)") +
      (selector ? ` +Selektor ${JSON.stringify(selector)}` : ""),
  );
  if (DRY) continue;

  if (!webpCache.has(shot.file)) {
    const webp = await sharp(path.join(IN, shot.file)).webp({ quality: 82 }).toBuffer();
    webpCache.set(shot.file, { webp, meta: await sharp(webp).metadata() });
  }
  const { webp, meta } = webpCache.get(shot.file);
  for (const bucket of ["tutorial-images", "tutorial-images-public"]) {
    const { error } = await admin.storage.from(bucket).upload(p, webp, { upsert: true, contentType: "image/webp" });
    if (error) { console.error("Upload", bucket, error.message); process.exit(1); }
  }
  const { error } = await admin
    .from("steps")
    .update({ image_path: p, image_width: meta.width, image_height: meta.height, highlights, selector })
    .eq("id", stepId);
  if (error) { console.error("Schritt", stepId, error.message); process.exit(1); }
  written++;
}
console.log(
  DRY
    ? `\n✓ Trockenlauf: ${plan.length} Schritte würden bebildert (${withHl} mit Markierung, ${withSel} mit Selektor) — nichts geschrieben.`
    : `\n✓ ${written} Schritte bebildert (${withHl} mit Markierung, ${withSel} mit Selektor).`,
);
