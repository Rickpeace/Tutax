// Seedet VERÖFFENTLICHTE Demo-Tutorials (mit Slug) über mehrere Kategorien,
// damit die Hilfe-Seite voll & repräsentativ aussieht (für Design-Demos).
// Idempotent: vorhandene Titel werden übersprungen.
// Nutzung:  node --env-file=.env.local scripts/seed-demo.mjs [accountId]
import { createClient } from "@supabase/supabase-js";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY,
  { auth: { persistSession: false } },
);
const uuid = () => crypto.randomUUID();
const slugify = (s) =>
  s.toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "").slice(0, 60) || "tutorial";
const mkBody = (text) => ({
  type: "doc",
  content: [{ type: "paragraph", content: text ? [{ type: "text", text }] : [] }],
});

// Konto: Argument oder RichardTax (per Name), sonst Abbruch.
let ACC = process.argv[2];
if (!ACC) {
  const { data } = await admin.from("accounts").select("id,name").eq("name", "RichardTax").maybeSingle();
  ACC = data?.id;
}
if (!ACC) {
  console.error("Kein Konto gefunden. accountId als Argument übergeben.");
  process.exit(1);
}
console.log("Seede Demo in Konto:", ACC, "\n");

async function ensureCategory(name, pos) {
  const { data } = await admin.from("categories").select("id").eq("account_id", ACC).eq("name", name);
  if (data?.length) return data[0].id;
  const { data: c } = await admin
    .from("categories")
    .insert({ account_id: ACC, name, position: pos })
    .select("id")
    .single();
  console.log("＋ Kategorie:", name);
  return c.id;
}

async function existsTitle(title) {
  const { data } = await admin.from("tutorials").select("id").eq("account_id", ACC).eq("title", title);
  return (data ?? []).length > 0;
}

async function uniqueSlug(base) {
  let slug = base;
  let n = 1;
  // pro Konto eindeutig halten
  while (true) {
    const { data } = await admin.from("tutorials").select("id").eq("account_id", ACC).eq("slug", slug);
    if (!data?.length) return slug;
    slug = `${base}-${++n}`;
  }
}

async function addLinear(catId, title, description, steps) {
  if (await existsTitle(title)) return console.log("· übersprungen (existiert):", title);
  const tutId = uuid();
  const slug = await uniqueSlug(slugify(title));
  await admin.from("tutorials").insert({
    id: tutId,
    account_id: ACC,
    category_id: catId,
    title,
    description,
    status: "published",
    slug,
  });
  const ids = steps.map(() => uuid());
  await admin.from("steps").insert(
    steps.map((s, i) => ({
      id: ids[i],
      tutorial_id: tutId,
      title: s.t,
      body: mkBody(s.b),
      position: i + 1,
      is_decision: false,
    })),
  );
  await admin.from("tutorials").update({ root_step_id: ids[0] }).eq("id", tutId);
  const branches = [];
  for (let i = 0; i < ids.length - 1; i++)
    branches.push({ id: uuid(), step_id: ids[i], label: null, target_step_id: ids[i + 1], position: 0 });
  if (branches.length) await admin.from("step_branches").insert(branches);
  console.log("✓ veröffentlicht:", title, `(${steps.length} Schritte, /${slug})`);
}

const cErste = await ensureCategory("Erste Schritte", 0);
const cLogin = await ensureCategory("SmartLogin & Anmeldung", 1);
const cBelege = await ensureCategory("Belege & Dokumente", 2);
const cLohn = await ensureCategory("Lohn & Gehalt", 3);
const cSteuer = await ensureCategory("Steuererklärung", 4);

await addLinear(cErste, "Willkommen: So nutzen Sie die Hilfe-Seite", "In 1 Minute startklar.", [
  { t: "Überblick", b: "Auf dieser Seite finden Sie Schritt-für-Schritt-Anleitungen rund um Ihre Kanzlei und DATEV." },
  { t: "Anleitung suchen", b: "Nutzen Sie das Suchfeld oben oder stöbern Sie nach Kategorien." },
  { t: "Schritt für Schritt folgen", b: "Öffnen Sie eine Anleitung und klicken Sie sich Schritt für Schritt durch." },
  { t: "Frage offen?", b: "Nutzen Sie unten rechts den Chat – er hilft sofort weiter oder verbindet Sie mit uns." },
]);

await addLinear(cErste, "Sicher anmelden: Passwort & Zwei-Faktor", "Schützen Sie Ihren Zugang.", [
  { t: "Sicheres Passwort wählen", b: "Verwenden Sie ein langes, einzigartiges Passwort (mind. 12 Zeichen)." },
  { t: "Zwei-Faktor aktivieren", b: "Aktivieren Sie die Zwei-Faktor-Authentifizierung (z. B. SmartLogin-App)." },
  { t: "Wiederherstellung sichern", b: "Bewahren Sie Wiederherstellungscodes sicher auf." },
  { t: "Fertig", b: "Ihr Zugang ist jetzt deutlich besser geschützt." },
]);

await addLinear(cLogin, "DATEV SmartLogin einrichten", "App installieren und startklar.", [
  { t: "App installieren", b: "Laden Sie DATEV SmartLogin aus dem App Store oder Google Play Store." },
  { t: "Registrierung starten", b: "Öffnen Sie die App und tippen Sie auf Registrieren." },
  { t: "Zugangsdaten eingeben", b: "Geben Sie Benutzernamen und Initialkennwort ein." },
  { t: "Eigenes Kennwort vergeben", b: "Legen Sie ein sicheres persönliches Kennwort fest." },
  { t: "Biometrie aktivieren", b: "Aktivieren Sie auf Wunsch Face ID oder Fingerabdruck." },
  { t: "Fertig", b: "SmartLogin ist eingerichtet." },
]);

await addLinear(cLogin, "Neues Smartphone für SmartLogin registrieren", "Gerätewechsel ohne Stress.", [
  { t: "Voraussetzung prüfen", b: "Sie benötigen Ihr altes Gerät oder die Unterstützung der Kanzlei." },
  { t: "App installieren", b: "Installieren Sie SmartLogin auf dem neuen Smartphone." },
  { t: "Registrierung starten", b: "Wählen Sie die Option zum Registrieren eines neuen Geräts." },
  { t: "Gerät freigeben", b: "Geben Sie das neue Gerät frei oder lassen Sie es freischalten." },
  { t: "Fertig", b: "Das neue Smartphone ist einsatzbereit." },
]);

await addLinear(cBelege, "Belege in DATEV Unternehmen online hochladen", "Rechnungen digital übermitteln.", [
  { t: "Anmelden", b: "Melden Sie sich bei DATEV Unternehmen online an." },
  { t: "Belege online öffnen", b: "Öffnen Sie im Menü den Bereich Belege online." },
  { t: "Beleg hochladen", b: "Laden Sie Scan, Foto oder PDF hoch." },
  { t: "Beleg zuordnen", b: "Ordnen Sie den Beleg dem richtigen Bereich zu." },
  { t: "Übermitteln", b: "Prüfen und übermitteln Sie den Beleg an die Kanzlei." },
]);

await addLinear(cBelege, "DATEV Meine Steuern: Unterlagen bereitstellen", "Unterlagen einfach übergeben.", [
  { t: "Einladung öffnen", b: "Öffnen Sie die Einladung Ihrer Kanzlei (E-Mail-Link)." },
  { t: "Anmelden", b: "Melden Sie sich an bzw. erstellen Sie ein Konto." },
  { t: "Checkliste ansehen", b: "Sehen Sie, welche Unterlagen benötigt werden." },
  { t: "Dokumente hochladen", b: "Laden Sie die angeforderten Dokumente hoch." },
  { t: "Freigeben", b: "Geben Sie die Unterlagen für die Kanzlei frei." },
]);

await addLinear(cLohn, "Digitale Lohnabrechnung abrufen", "Gehaltsabrechnung online einsehen.", [
  { t: "Portal öffnen", b: "Öffnen Sie das DATEV Arbeitnehmer online Portal." },
  { t: "Anmelden", b: "Melden Sie sich mit Ihren Zugangsdaten an." },
  { t: "Abrechnung wählen", b: "Wählen Sie den gewünschten Monat aus." },
  { t: "Herunterladen", b: "Laden Sie die Abrechnung als PDF herunter." },
]);

await addLinear(cLohn, "Krankmeldung & Fehlzeiten melden", "Abwesenheiten korrekt übermitteln.", [
  { t: "Krankmeldung erhalten", b: "Sie erhalten die Krankschreibung in der Regel digital (eAU)." },
  { t: "Kanzlei informieren", b: "Melden Sie Beginn und voraussichtliche Dauer der Kanzlei." },
  { t: "Folgebescheinigung beachten", b: "Reichen Sie Folgebescheinigungen rechtzeitig nach." },
  { t: "Fertig", b: "Die Fehlzeit ist erfasst." },
]);

await addLinear(cSteuer, "Unterlagen für die Steuererklärung sammeln", "Nichts vergessen.", [
  { t: "Einnahmen zusammenstellen", b: "Sammeln Sie Lohnsteuerbescheinigung und weitere Einnahmen." },
  { t: "Ausgaben sammeln", b: "Sammeln Sie Belege zu Werbungskosten, Versicherungen und Spenden." },
  { t: "Bescheinigungen prüfen", b: "Prüfen Sie Bescheinigungen von Banken und Versicherungen." },
  { t: "Digital bereitstellen", b: "Laden Sie alles in DATEV Meine Steuern hoch." },
  { t: "Fertig", b: "Ihre Kanzlei kann mit der Bearbeitung starten." },
]);

await addLinear(cSteuer, "Belege fotografieren – so wird's lesbar", "Gute Scans per Handy.", [
  { t: "Gutes Licht", b: "Sorgen Sie für gleichmäßiges Licht ohne Schatten." },
  { t: "Gerade ausrichten", b: "Fotografieren Sie den Beleg von oben, gerade und vollständig." },
  { t: "Scharf prüfen", b: "Kontrollieren Sie, dass alle Zahlen scharf lesbar sind." },
  { t: "Hochladen", b: "Laden Sie das Foto in das DATEV-Portal hoch." },
]);

console.log("\n✓ Demo-Seeding abgeschlossen (veröffentlicht, auf der Hilfe-Seite sichtbar).");
