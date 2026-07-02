// Seedet den STEPLY-HILFE-HUB (/h/steply): Steply erklärt Steply mit Steply.
// Eigenes Konto „Steply“ (KEINE Admin-Templates — die wären für Endkunden der
// Kanzleien, nicht für Steply-Nutzer). Idempotent: vorhandene Titel überspringen.
// Nutzung:  node --env-file=.env.local scripts/seed-steply-help.mjs
import { createClient } from "@supabase/supabase-js";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false },
});
const uuid = () => crypto.randomUUID();
const slugify = (s) =>
  s.toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "").slice(0, 60);
const mkBody = (t) => ({ type: "doc", content: [{ type: "paragraph", content: t ? [{ type: "text", text: t }] : [] }] });

// ---------- Konto „Steply“ sicherstellen ----------
const email = "hilfe@steply.dev";
let uid;
{
  const { data: created, error } = await admin.auth.admin.createUser({
    email, password: crypto.randomUUID() + "Xx1!", email_confirm: true,
    user_metadata: { account_name: "Steply" },
  });
  if (error && /already/i.test(error.message)) {
    const { data: page } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    uid = page.users.find((u) => u.email === email)?.id;
  } else if (error) { console.error(error.message); process.exit(1); }
  else uid = created.user.id;
}
const { data: mem } = await admin.from("account_members").select("account_id").eq("user_id", uid).limit(1).single();
const ACC = mem.account_id;
await admin.from("accounts").update({ slug: "steply", onboarded: true, plan: "pro" }).eq("id", ACC);
console.log("Konto Steply:", ACC, "→ /h/steply\n");

async function ensureCategory(name, pos) {
  const { data } = await admin.from("categories").select("id").eq("account_id", ACC).eq("name", name);
  if (data?.length) return data[0].id;
  const { data: c } = await admin.from("categories").insert({ account_id: ACC, name, position: pos }).select("id").single();
  console.log("＋ Kategorie:", name);
  return c.id;
}

// ---------- Inhalte (Stand: Juli 2026, alle Features live) ----------
// WICHTIG: Anführungszeichen im Text NUR typografisch („…“) — gerade Quotes brechen JS-Strings.
const TUTORIALS = [
  {
    cat: "Erste Schritte", title: "Ihr erstes Tutorial erstellen",
    desc: "Vom leeren Dashboard zur fertigen Klick-Anleitung.",
    steps: [
      ["Neues Tutorial anlegen", "Klicken Sie auf dem Dashboard oben rechts auf „Neues Tutorial“ und vergeben Sie einen Titel. Sie landen direkt im Builder."],
      ["Schritt beschreiben", "Jeder Schritt hat einen Titel (kurz, im Imperativ – z. B. „App öffnen“) und einen Erklärtext. Links, Fett und Listen sind im Text möglich."],
      ["Screenshot hinzufügen", "Fügen Sie pro Schritt einen Screenshot hinzu: anklicken, per Drag & Drop ablegen oder mit Strg+V einfügen. Der Zuschnitt-Dialog hilft beim Rahmen."],
      ["Markierungen setzen", "Markieren Sie das Wichtige direkt im Bild: Rechteck, Kreis, Pfeil – eine Lupe vergrößert Details, und „Blur“ schwärzt sensible Daten unwiderruflich."],
      ["Schritte ordnen", "Mit den Pfeilen im Editor-Kopf ordnen Sie Schritte um; über die Einfügepunkte im Fluss fügen Sie neue Schritte genau dort ein, wo sie hingehören."],
      ["KI-Vorschlag nutzen", "Zu jedem Screenshot kann die KI Titel, Text und Markierung vorschlagen – prüfen, anpassen, speichern. Fertig ist der Schritt."],
    ],
  },
  {
    cat: "Erste Schritte", title: "Tutorial aus einem Video erstellen",
    desc: "Einmal vormachen – Steply baut die Anleitung.",
    steps: [
      ["Aufnahme starten", "Klicken Sie auf dem Dashboard auf „Aus Video“ und dann „Jetzt aufnehmen“. Erlauben Sie Bildschirm und Mikrofon."],
      ["Vormachen und sprechen", "Führen Sie die Aufgabe in Ruhe vor und erklären Sie dabei wie einem Kollegen. Nach jedem fertigen Schritt sagen Sie einfach „Schnitt“."],
      ["Oder: Steply Recorder nutzen", "Mit der Steply-Recorder-Browsererweiterung brauchen Sie kein Kommando: Ihre Klicks werden automatisch erkannt und punktgenau markiert."],
      ["Zusehen, wie es entsteht", "Nach dem Hochladen wächst der Entwurf live („Schritt 3 von 6 …“). Sie können das Fenster schließen – der Entwurf erscheint auf dem Dashboard."],
      ["Nacharbeiten im Builder", "Hat die KI mal den falschen Moment erwischt? „Bild aus Video wählen“ öffnet eine Zeitleiste – Sie ziehen einfach zum richtigen Frame."],
      ["Auch möglich: Datei oder Link", "Statt aufzunehmen können Sie eine Videodatei hochladen (auch mehrere auf einmal) oder einen direkten Video-Link importieren."],
    ],
  },
  {
    cat: "Veröffentlichen", title: "Veröffentlichen und auf Ihre Website bringen",
    desc: "Ein Schalter, vier Wege zu Ihren Kunden.",
    steps: [
      ["Veröffentlichen", "Stellen Sie den Schalter „Auf Hilfe-Seite“ an der Tutorial-Karte um. Sie erhalten sofort den Live-Link – Blur-Markierungen werden dabei fest ins Bild gebrannt."],
      ["Weg 1: Der Link", "Unter Einstellungen → Einbetten finden Sie den Link Ihrer Hilfe-Seite. Als Menüpunkt „Hilfe“ auf Ihrer Website verlinken – fertig, kein Webdesigner nötig."],
      ["Weg 2: Einbetten (iFrame)", "Wenn die Hilfe direkt auf einer Unterseite erscheinen soll, kopieren Sie den iFrame-Code von der Einbetten-Seite."],
      ["Weg 3: Die Chat-Bubble", "Ein einziges Script-Tag, und Ihr KI-Hilfe-Assistent schwebt auf JEDER Seite Ihrer Website – im Look Ihrer Organisation."],
      ["Weg 4: QR-Code", "Für Briefe, Rechnungen oder den Aushang: Zu jeder Anleitung und zur Hilfe-Seite gibt es einen QR-Code zum Ausdrucken."],
      ["Druckansicht", "Jede Anleitung hat eine Druckansicht mit allen Schritten untereinander – für Kunden, die lieber Papier mögen."],
    ],
  },
  {
    cat: "Veröffentlichen", title: "Ihr Design: Farben, Logo und KI-CI",
    desc: "Die Hilfe-Seite im Look Ihrer Organisation.",
    steps: [
      ["Branding öffnen", "Unter Einstellungen → Branding legen Sie Name, Logo und Farben fest – mit Live-Vorschau."],
      ["KI-CI: Farben aus Ihrer Website", "Geben Sie einfach Ihre Website-Adresse an: Die KI liest Farben, Schriften und Logo aus und baut daraus Ihr Design. Zu helle Farben werden automatisch lesbar gemacht."],
      ["Design-Quelle wählen", "Sie entscheiden, was live ist: Ihr manuelles Design, das KI-Design oder das Extrem-Design (komplett generierter Look). Vorschau jederzeit per Klick."],
      ["Verzweigungen nutzen", "Ihre Anleitungen können Fragen stellen („App startet?“) und je nach Antwort unterschiedlich weiterführen – der Schalter „Frage / Verzweigung“ im Schritt macht es möglich."],
    ],
  },
  {
    cat: "KI & Insights", title: "Der KI-Hilfe-Assistent und die Wissensdatenbank",
    desc: "Ihr Chatbot antwortet nur mit Ihren Inhalten.",
    steps: [
      ["Was der Assistent weiß", "Der Chat auf Ihrer Hilfe-Seite beantwortet Kundenfragen ausschließlich aus Ihren veröffentlichten Anleitungen und Ihrer Wissensdatenbank – er erfindet nichts dazu."],
      ["Wissensdatenbank füllen", "Unter „Wissensdatenbank“ legen Sie freies Wissen an: Öffnungszeiten, Zuständigkeiten, FAQs. Veröffentlichte Artikel fließen automatisch in den Chat ein."],
      ["Ansprechpartner hinterlegen", "Unter Einstellungen → Eskalation legen Sie fest, an wen der Chat verweist, wenn er nicht weiterweiß – inklusive Terminbuchung, E-Mail und Telefon pro Fachgebiet."],
      ["Semantische Suche", "Auch das Suchfeld der Hilfe-Seite denkt mit: Findet die Titelsuche nichts, schlägt die KI passende Anleitungen vor („Meinten Sie …“)."],
    ],
  },
  {
    cat: "KI & Insights", title: "Insights: sehen, was Ihre Kunden brauchen",
    desc: "Aufrufe, Feedback – und was noch fehlt.",
    steps: [
      ["Die Insights-Karte", "Sobald Ihre Hilfe-Seite genutzt wird, zeigt das Dashboard: Aufrufe, gestellte Chat-Fragen und die Zufriedenheit („War das hilfreich?“)."],
      ["Wissenslücken erkennen", "Das Wertvollste: Fragen, die der Chat NICHT beantworten konnte, werden gesammelt – Sie sehen genau, welche Anleitung noch fehlt."],
      ["Entwurf per Klick", "Neben jeder offenen Frage gibt es „Entwurf erstellen“: Die KI baut ein Anleitungs-Gerüst, Sie ergänzen nur noch Screenshots und Details."],
      ["Automatisch aktuell bleiben", "Der Aktualitäts-Check prüft Ihre Anleitungen regelmäßig gegen das Web und meldet, wenn sich z. B. eine Software-Oberfläche geändert hat."],
    ],
  },
  {
    cat: "Team", title: "Team einladen und Organisationen",
    desc: "Gemeinsam pflegen, sauber getrennt.",
    steps: [
      ["Einladen", "Unter Einstellungen → Team laden Sie Kolleginnen und Kollegen per E-Mail ein – als Inhaber (verwaltet alles) oder Bearbeiter (pflegt Inhalte)."],
      ["Einladung annehmen", "Die eingeladene Person klickt den Link, legt ein Passwort fest (oder meldet sich an) und landet direkt in Ihrer Organisation."],
      ["Mehrere Organisationen", "Wer zu mehreren Organisationen gehört, wechselt oben links im Kopfbereich – jede Organisation hat ihre eigene Hilfe-Seite, eigenes Design, eigenes Team."],
    ],
  },
];

// ---------- Seeden ----------
const catIds = {};
let pos = 0;
for (const t of TUTORIALS) if (!(t.cat in catIds)) catIds[t.cat] = await ensureCategory(t.cat, pos++);

for (const t of TUTORIALS) {
  const { data: exists } = await admin.from("tutorials").select("id").eq("account_id", ACC).eq("title", t.title);
  if (exists?.length) { console.log("• übersprungen (existiert):", t.title); continue; }
  const tutId = uuid();
  let slug = slugify(t.title);
  for (let n = 1; ; n++) {
    const { data: s } = await admin.from("tutorials").select("id").eq("account_id", ACC).eq("slug", slug);
    if (!s?.length) break;
    slug = `${slugify(t.title)}-${n + 1}`;
  }
  await admin.from("tutorials").insert({
    id: tutId, account_id: ACC, category_id: catIds[t.cat], title: t.title, description: t.desc,
    status: "published", slug, published_at: new Date().toISOString(),
  });
  const rows = t.steps.map(([title, body], i) => ({
    id: uuid(), tutorial_id: tutId, title, body: mkBody(body), position: i + 1, is_decision: false,
  }));
  await admin.from("steps").insert(rows);
  await admin.from("tutorials").update({ root_step_id: rows[0].id }).eq("id", tutId);
  const branches = rows.slice(0, -1).map((r, i) => ({
    id: uuid(), step_id: r.id, label: null, target_step_id: rows[i + 1].id, position: 0,
  }));
  if (branches.length) await admin.from("step_branches").insert(branches);
  console.log(`✓ veröffentlicht: ${t.title} (${rows.length} Schritte, /${slug})`);
}
console.log("\n✓ Steply-Hilfe-Hub geseedet → /h/steply");
