// Seedet echte DATEV-Tutorials (ohne Bilder) in das (einzige) reale Konto.
// Idempotent: vorhandene Titel werden übersprungen. Tutorials = Entwurf.
// Nutzung:  node --env-file=.env.local scripts/seed-datev.mjs
import { createClient } from "@supabase/supabase-js";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY,
  { auth: { persistSession: false } },
);
const uuid = () => crypto.randomUUID();
const YES = "#0f9d72";
const NO = "#d6455d";
const slugify = (s) =>
  s.toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "").slice(0, 60) || "tutorial";
const mkBody = (text) => ({
  type: "doc",
  content: [{ type: "paragraph", content: text ? [{ type: "text", text }] : [] }],
});

const AS_TEMPLATE = process.argv.includes("--templates");
let ACC = null;
if (AS_TEMPLATE) {
  console.log("Seede als globale TEMPLATES (account_id = NULL, veröffentlicht)\n");
} else {
  const accs = (await admin.from("accounts").select("id, name").order("created_at")).data ?? [];
  if (accs.length !== 1) {
    console.error(`Erwarte genau 1 Konto, gefunden: ${accs.length}. Abbruch.`);
    process.exit(1);
  }
  ACC = accs[0].id;
  console.log(`Seede in Konto: ${accs[0].name} (${ACC})\n`);
}

async function ensureCategory(name) {
  const { data } = await admin.from("categories").select("id").eq("account_id", ACC).eq("name", name);
  if (data?.length) return data[0].id;
  const cnt = (await admin.from("categories").select("id", { count: "exact", head: true }).eq("account_id", ACC)).count ?? 0;
  const { data: c } = await admin.from("categories").insert({ account_id: ACC, name, position: cnt }).select("id").single();
  return c.id;
}
async function exists(title) {
  const q = admin.from("tutorials").select("id").eq("title", title);
  const { data } = AS_TEMPLATE
    ? await q.eq("is_template", true)
    : await q.eq("account_id", ACC);
  return (data ?? []).length > 0;
}
const tutFields = (catId, title, description) =>
  AS_TEMPLATE
    ? { account_id: null, is_template: true, category_id: null, title, description, status: "published", slug: slugify(title) }
    : { account_id: ACC, category_id: catId, title, description, status: "draft" };

async function insertLinear(catId, title, description, steps) {
  if (await exists(title)) return console.log("· übersprungen (existiert):", title);
  const tutId = uuid();
  await admin.from("tutorials").insert({ id: tutId, ...tutFields(catId, title, description) });
  const ids = steps.map(() => uuid());
  await admin.from("steps").insert(
    steps.map((s, i) => ({ id: ids[i], tutorial_id: tutId, title: s.t, body: mkBody(s.b), position: i + 1, is_decision: false })),
  );
  await admin.from("tutorials").update({ root_step_id: ids[0] }).eq("id", tutId);
  const branches = [];
  for (let i = 0; i < ids.length - 1; i++)
    branches.push({ id: uuid(), step_id: ids[i], label: null, target_step_id: ids[i + 1], position: 0 });
  if (branches.length) await admin.from("step_branches").insert(branches);
  console.log("✓ angelegt:", title, `(${steps.length} Schritte)`);
}

async function insertTroubleshooter(catId) {
  const title = "SmartLogin: App startet nicht – Problembehebung";
  if (await exists(title)) return console.log("· übersprungen (existiert):", title);
  const tutId = uuid();
  await admin.from("tutorials").insert({ id: tutId, ...tutFields(catId, title, "Geführte Lösung – je nach Situation der richtige Weg.") });
  const S = {};
  const def = (k, t, b, decision = false) => (S[k] = { id: uuid(), t, b, decision });
  def("s1", "App öffnen", "Öffnen Sie die DATEV SmartLogin-App auf Ihrem Smartphone.");
  def("s2", "Lädt die App ohne Fehler?", "Startet die App und zeigt den Anmeldebildschirm – ohne Fehlermeldung?", true);
  def("s3", "Sind Sie angemeldet?", "Sehen Sie oben Ihren Namen bzw. Ihr Profil?", true);
  def("s4", "Anmelden", "Melden Sie sich mit Ihrem Benutzernamen und Kennwort an.");
  def("s5", "Funktioniert die DATEV-Anwendung?", "Können Sie sich an der gewünschten DATEV-Anwendung (z. B. Unternehmen online) anmelden?", true);
  def("s6", "Gerätebindung erneuern", "Tippen Sie in der App auf Einstellungen, dann Gerät neu binden, und folgen Sie den Schritten.");
  def("s7", "Geschafft", "Alles erledigt – die Anmeldung funktioniert wieder.");
  def("s8", "App neu installieren", "Löschen Sie die App und installieren Sie sie erneut aus dem App Store bzw. Google Play Store.");
  def("s9", "Startet die App jetzt?", "Öffnet die App nun ohne Fehlermeldung?", true);
  def("s10", "Support kontaktieren", "Bitte wenden Sie sich an Ihre Kanzlei oder den DATEV-Support.");

  const keys = Object.keys(S);
  await admin.from("steps").insert(
    keys.map((k, i) => ({ id: S[k].id, tutorial_id: tutId, title: S[k].t, body: mkBody(S[k].b), position: i + 1, is_decision: S[k].decision })),
  );
  await admin.from("tutorials").update({ root_step_id: S.s1.id }).eq("id", tutId);

  const B = [];
  const br = (from, label, to, color) =>
    B.push({ id: uuid(), step_id: S[from].id, label, color: color ?? null, target_step_id: to ? S[to].id : null, position: B.filter((x) => x.step_id === S[from].id).length });
  br("s1", null, "s2");
  br("s2", "Ja", "s3", YES); br("s2", "Nein", "s8", NO);
  br("s3", "Ja", "s5", YES); br("s3", "Nein", "s4", NO);
  br("s4", null, "s5");
  br("s5", "Ja", "s7", YES); br("s5", "Nein", "s6", NO);
  br("s6", null, "s7");
  br("s8", null, "s9");
  br("s9", "Ja", "s3", YES); br("s9", "Nein", "s10", NO);
  await admin.from("step_branches").insert(B);
  console.log("✓ angelegt:", title, "(Verzweigungs-Troubleshooter)");
}

const cErste = AS_TEMPLATE ? null : await ensureCategory("Erste Schritte");
const cLogin = AS_TEMPLATE ? null : await ensureCategory("SmartLogin & Anmeldung");
const cBelege = AS_TEMPLATE ? null : await ensureCategory("Belege & Dokumente");

await insertLinear(cErste, "DATEV SmartLogin einrichten", "App installieren und in wenigen Schritten startklar.", [
  { t: "App installieren", b: "Laden Sie die App DATEV SmartLogin aus dem App Store (iPhone) oder Google Play Store (Android) und installieren Sie sie." },
  { t: "Registrierung starten", b: "Öffnen Sie die App und tippen Sie auf die Schaltfläche zum Registrieren. Sie benötigen die SmartLogin-Zugangsdaten Ihrer Kanzlei." },
  { t: "Zugangsdaten eingeben", b: "Geben Sie Benutzernamen und Initialkennwort ein und bestätigen Sie." },
  { t: "Eigenes Kennwort vergeben", b: "Legen Sie ein sicheres, persönliches Kennwort fest (mind. 8 Zeichen, Groß-/Kleinbuchstaben und eine Zahl) und wiederholen Sie es." },
  { t: "Biometrie aktivieren", b: "Aktivieren Sie auf Wunsch Face ID oder Fingerabdruck für die schnelle Anmeldung und bestätigen Sie die Geräteregistrierung." },
  { t: "Fertig", b: "SmartLogin ist eingerichtet. Künftig melden Sie sich bei DATEV-Anwendungen bequem per App an." },
]);

await insertTroubleshooter(cLogin);

await insertLinear(cLogin, "Neues Smartphone für SmartLogin registrieren", "Gerätewechsel ohne Stress.", [
  { t: "Voraussetzung prüfen", b: "Für die Freigabe benötigen Sie entweder Ihr altes Gerät oder die Unterstützung Ihrer Kanzlei." },
  { t: "App auf neuem Gerät installieren", b: "Installieren Sie DATEV SmartLogin auf dem neuen Smartphone." },
  { t: "Registrierung starten", b: "Öffnen Sie die App und wählen Sie die Option zum Registrieren eines neuen Geräts." },
  { t: "Gerät freigeben", b: "Geben Sie das neue Gerät am alten Gerät frei oder lassen Sie es von Ihrer Kanzlei freischalten." },
  { t: "Gerätebindung bestätigen", b: "Bestätigen Sie die neue Gerätebindung und richten Sie ggf. die Biometrie erneut ein." },
  { t: "Fertig", b: "Das neue Smartphone ist einsatzbereit." },
]);

await insertLinear(cBelege, "DATEV Unternehmen online: Belege hochladen", "Rechnungen und Belege digital übermitteln.", [
  { t: "Anmelden", b: "Melden Sie sich bei DATEV Unternehmen online an (per SmartLogin oder SmartCard)." },
  { t: "Belege online öffnen", b: "Öffnen Sie im Menü den Bereich Belege online." },
  { t: "Beleg hochladen", b: "Laden Sie den Beleg als Scan, Foto oder PDF hoch – per Drag-and-drop oder über die Hochladen-Funktion." },
  { t: "Beleg zuordnen", b: "Ordnen Sie den Beleg dem richtigen Bereich zu (z. B. Eingangs- oder Ausgangsrechnung)." },
  { t: "Prüfen und übermitteln", b: "Prüfen Sie die Angaben und übermitteln Sie den Beleg an Ihre Kanzlei." },
  { t: "Fertig", b: "Der Beleg liegt jetzt sicher in DATEV bereit." },
]);

await insertLinear(cBelege, "DATEV Meine Steuern: Unterlagen bereitstellen", "Steuerunterlagen einfach an die Kanzlei geben.", [
  { t: "Einladung öffnen", b: "Öffnen Sie die Einladung Ihrer Kanzlei zu DATEV Meine Steuern (per E-Mail-Link)." },
  { t: "Anmelden", b: "Melden Sie sich an bzw. erstellen Sie ein Konto (SmartLogin)." },
  { t: "Checkliste ansehen", b: "Gehen Sie die Checkliste durch – sie zeigt, welche Unterlagen benötigt werden." },
  { t: "Dokumente hochladen", b: "Laden Sie die angeforderten Dokumente hoch (Foto, Scan oder Datei)." },
  { t: "Freigeben", b: "Geben Sie die Unterlagen für Ihre Kanzlei frei." },
  { t: "Fertig", b: "Ihre Kanzlei kann nun mit der Bearbeitung starten." },
]);

await insertLinear(cErste, "Sicher anmelden: Passwort und Zwei-Faktor", "Schützen Sie Ihren DATEV-Zugang.", [
  { t: "Sicheres Passwort wählen", b: "Verwenden Sie ein langes, einzigartiges Passwort (mind. 12 Zeichen) und nutzen Sie es nirgendwo sonst." },
  { t: "Zwei-Faktor aktivieren", b: "Aktivieren Sie die Zwei-Faktor-Authentifizierung (z. B. die SmartLogin-App) für Ihren Zugang." },
  { t: "Wiederherstellung sichern", b: "Bewahren Sie etwaige Wiederherstellungscodes an einem sicheren Ort auf." },
  { t: "Fertig", b: "Ihr Zugang ist jetzt deutlich besser geschützt." },
]);

console.log("\n✓ Seeding abgeschlossen. Tutorials liegen als Entwurf im Dashboard.");
