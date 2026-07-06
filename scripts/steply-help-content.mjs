// GETEILTE Doku-Definition fuer den Steply-Hilfe-Hub (/h/steply) — Welle 34.
// EINE Quelle der Wahrheit fuer seed-steply-help.mjs (Inhalt + site_domains + page_url +
// KB-Index) UND shoot-steply-help.mjs (Screenshots + Auto-Markierungen + Selektoren).
// So bleiben Schritt-Texte, Bild-Zuordnung (shot/target) und Seiten-Route garantiert synchron.
//
// WICHTIG: Alle deutschen Texte mit TYPOGRAFISCHEN Anfuehrungszeichen („…“) — gerade Quotes
// haben schon JS-Strings zerlegt. Sie-Form (keine Du-Form), 2–3 Saetze je Schritt.
//
// Pro Schritt:
//   title, body   — Anzeige-Text (Sie-Form)
//   shot          — welcher Screenshot (Schluessel in shoot-steply-help.mjs SHOTS)
//   target        — welches Element im Shot markiert/als Selektor erfasst wird (oder null)
//   highlight     — (Welle 35, OPTIONAL) explizite Markierungs-Entscheidung fuer Schritte, die
//                   die Playwright-Pipeline NICHT automatisch trifft:
//                     • { x, y, w, h }  — Hand-Markierung (relative 0..1); Primaerfarbe + rounded
//                                          setzen shoot-steply-help.mjs bzw. patch-steply-highlights.mjs
//                     • null            — BEWUSST ohne Markierung (reiner Hinweis-/Ergebnis-Schritt
//                                          oder Ziel nicht im Screenshot) — Entscheidung, keine Luecke
//                     • fehlt           — normaler Schritt: Markierung kommt aus target (Auto-Box)
// Die App-Route je Shot steht in SHOT_ROUTES (fuer page_url). null = keine stabile Prod-URL
// (Builder ist dynamisch; oeffentliche Hub-Shots sind nur illustrativ).

// ── App-URL der PRODUKTION (fuer page_url + site_domains) ────────────────────────────────
// Die Doku fuehrt Nutzer auf der ECHTEN App (Prod), nicht auf localhost. .env.local traegt
// lokal http://localhost:3000 — daher faellt die Aufloesung auf die bekannte Prod-URL zurueck.
// Ueberschreibbar per STEPLY_DOC_APP_URL.
export function resolveAppUrl() {
  const clean = (s) => (s || "").trim().replace(/[/*\s]+$/, "");
  const explicit = clean(process.env.STEPLY_DOC_APP_URL);
  if (explicit) return explicit;
  const env = clean(process.env.NEXT_PUBLIC_APP_URL);
  if (env && !/(localhost|127\.0\.0\.1|0\.0\.0\.0)/i.test(env)) return env;
  return "https://tutax-ivory.vercel.app";
}

// Multi-Tenant-PaaS-Domains: hier ist die „Basis-Domain“ (letzte zwei Labels) ZU generisch
// (vercel.app wuerde JEDE Vercel-Seite matchen). Dann den VOLLEN Hostnamen als site_domain
// nehmen — matchesDomain (extension/site-match.js) trifft ihn exakt. Spiegelt die Absicht
// von normalizeDomain/mergeDomains (src/lib/site-domains.ts).
const GENERIC_HOSTS = new Set([
  "vercel.app", "netlify.app", "pages.dev", "github.io", "onrender.com", "render.com",
  "herokuapp.com", "web.app", "firebaseapp.com", "workers.dev", "fly.dev", "railway.app",
  "surge.sh", "now.sh", "glitch.me", "repl.co", "replit.dev", "azurewebsites.net", "amplifyapp.com",
]);

/** site_domains (Array) fuer die Doku-Tutorials aus der App-URL. Leer bei kaputter URL. */
export function appSiteDomains(appUrl) {
  let host;
  try {
    host = new URL(appUrl).hostname.toLowerCase().replace(/^www\./, "").replace(/\.+$/, "");
  } catch {
    return [];
  }
  if (!host) return [];
  const labels = host.split(".");
  if (labels.length < 2) return [host];
  const base = labels.slice(-2).join(".");
  // Basis generisch ODER Host = Basis (2 Labels) -> vollen Host; sonst Basis (deckt Subdomains).
  return GENERIC_HOSTS.has(base) ? [host] : [base];
}

// Prod-Route je Shot -> page_url. null: keine stabile oeffentliche URL (Builder dynamisch,
// oeffentliche Hub-Seiten liegen unter der KUNDEN-Domain, hier nur als Illustration).
export const SHOT_ROUTES = {
  dashboard: "/app",
  "dashboard-job": "/app",
  "video-dialog": "/app",
  builder: null,
  einbetten: "/app/settings/einbetten",
  branding: "/app/settings/branding",
  team: "/app/settings/team",
  eskalation: "/app/assistent/eskalation",
  knowledge: "/app/assistent/wissen",
  fragen: "/app/assistent/fragen",
  lernen: "/app/lernen",
  hub: null,
  "hub-chat": null,
  "wizard-public": null,
};

// Reihenfolge der Kategorien (Position). Bestehende Namen beibehalten (alte Struktur).
export const CATEGORIES = ["Erste Schritte", "Veröffentlichen", "KI & Insights", "Team"];

// Reihenfolge der Tutorials = Anzeige-Reihenfolge im Hub (innerhalb der Kategorie nach
// Einfuege-Reihenfolge). Sofort-Anleitung steht als STANDARD direkt hinter „Erste Schritte“.
// slug: bestehende Slugs beibehalten, wo das Thema gleich bleibt (alte Links!).
export const TUTORIALS = [
  // ═══════════════════════ Erste Schritte ═══════════════════════
  {
    slug: "konto-und-hilfe-seite-einrichten",
    cat: "Erste Schritte",
    title: "Erste Schritte: Konto & Hilfe-Seite einrichten",
    desc: "Konto einrichten, Design festlegen, eigene Hilfe-Seite ansehen.",
    steps: [
      { shot: "dashboard", target: "switcher",
        title: "Konto und Organisation",
        body: "Bei der ersten Anmeldung legt Steply automatisch eine Organisation für Sie an – oben links sehen Sie ihren Namen. Von hier aus verwalten Sie Anleitungen, Design, Team und Ihre öffentliche Hilfe-Seite." },
      { shot: "branding", target: null,
        highlight: { x: 0.251, y: 0.211, w: 0.049, h: 0.036 }, // Hand (Welle 35): „Branding“-Reiter in den Einstellungen
        title: "Branding öffnen",
        body: "Unter „Einstellungen“ → „Branding“ legen Sie Name, Adresse (Slug), Logo und Farben Ihrer Hilfe-Seite fest. Eine Live-Vorschau zeigt jede Änderung sofort." },
      { shot: "branding", target: "website",
        title: "CI automatisch übernehmen (KI)",
        body: "Sie müssen nichts von Hand einstellen: Geben Sie einfach Ihre Website-Adresse an und klicken Sie auf „Analysieren“. Die KI liest Farben, Schriften und Logo aus – zu helle Farben werden automatisch lesbar gemacht." },
      { shot: "branding", target: "modus",
        title: "Design-Quelle wählen",
        body: "Sie entscheiden, welches Design live ist: Ihr manuelles Design, das KI-Design oder ein komplett generiertes Extrem-Design. Über die Vorschau prüfen Sie jede Variante, bevor Sie sie aktivieren." },
      { shot: "hub", target: null,
        highlight: { x: 0.021, y: 0.009, w: 0.313, h: 0.058 }, // Hand (Welle 35): Marken-Kopf (Logo + Name) der Hilfe-Seite
        title: "Ihre Hilfe-Seite ansehen",
        body: "Ihre öffentliche Hilfe-Seite liegt unter Ihrer eigenen Adresse (steply.dev/h/…) im Look Ihrer Organisation. Über das „?“ in der App-Leiste erreichen Sie sie jederzeit." },
      { shot: "dashboard", target: "ausvideo",
        title: "Jetzt mit Inhalten füllen",
        body: "Als Nächstes füllen Sie die Seite mit Anleitungen. Am schnellsten geht das mit der Sofort-Anleitung per Browser-Erweiterung (nächstes Kapitel) – alternativ aus einem Video oder von Hand." },
    ],
  },
  {
    slug: "sofort-anleitung-mit-der-browser-erweiterung",
    cat: "Erste Schritte",
    title: "Sofort-Anleitung mit der Browser-Erweiterung",
    desc: "Der schnellste Weg – und unser Standard: einfach klicken, fertige Anleitung.",
    steps: [
      { shot: "dashboard", target: null,
        highlight: null, // bewusst ohne (Welle 35): reiner Hinweis-Schritt (Standard-Empfehlung)
        title: "Der schnellste Weg – und unser Standard",
        body: "Die Sofort-Anleitung ist der empfohlene Standard-Weg: Die Steply-Erweiterung nimmt bei jedem Klick automatisch einen Screenshot auf und markiert das geklickte Element punktgenau. In Sekunden entsteht ein fertiger Entwurf – ohne Video, ohne Kommandos." },
      { shot: "einbetten", target: null,
        highlight: null, // bewusst ohne (Welle 35): Ziel (Browser-Store/Recorder-Bereich) nicht im Screenshot
        title: "Erweiterung installieren",
        body: "Installieren Sie die Steply-Recorder-Erweiterung einmalig für Chrome oder Edge. Danach erscheint sie als Seitenleiste in Ihrem Browser." },
      { shot: "einbetten", target: "token",
        title: "Mit Ihrem Konto verbinden",
        body: "Unter „Einstellungen“ → „Einbetten“ finden Sie den Bereich „Steply Recorder verbinden“ mit Ihrem persönlichen Verbindungs-Token. Ein Klick auf „Extension verbinden“ koppelt die Erweiterung mit Ihrem Konto." },
      { shot: "einbetten", target: null,
        highlight: null, // bewusst ohne (Welle 35): Ziel (Extension-Seitenleiste) nicht im Screenshot
        title: "Aufnahme mit Titel und Kategorie starten",
        body: "In der Seitenleiste geben Sie Titel und Kategorie an und starten die Aufnahme. Führen Sie die Aufgabe dann einfach normal durch – jeder Klick wird zu einem Schritt." },
      { shot: "builder", target: null,
        highlight: { x: 0.592, y: 0.533, w: 0.023, h: 0.033 }, // Hand (Welle 35): „Blur“-Werkzeug in der Editor-Leiste
        title: "Automatische Schwärzung prüfen",
        body: "Steply erkennt sensible Felder (z. B. Namen oder Beträge) und schlägt vor, sie zu schwärzen. Prüfen Sie die Vorschläge vor dem Hochladen – beim Veröffentlichen wird die Schwärzung unwiderruflich ins Bild gebrannt." },
      { shot: "dashboard-job", target: "karte",
        title: "Entwurf erscheint auf dem Dashboard",
        body: "Nach dem Hochladen entsteht der Entwurf automatisch; auf dem Dashboard sehen Sie kurz „Wird erstellt …“ und danach die fertige Anleitung. Zum Feinschliff öffnen Sie sie im Builder." },
    ],
  },
  {
    slug: "tutorial-aus-einem-video-erstellen",
    cat: "Erste Schritte",
    title: "Anleitung aus einem Video",
    desc: "Die Alternative, wenn Sie den Ablauf lieber einmal erzählen.",
    steps: [
      { shot: "dashboard", target: "ausvideo",
        title: "Wann sich Video lohnt",
        body: "Die Alternative zur Sofort-Anleitung: Wenn Sie den Ablauf lieber einmal erzählen oder schon einen Screencast haben, baut Steply daraus die Anleitung. Klicken Sie auf dem Dashboard auf „Aus Video“." },
      { shot: "video-dialog", target: "aufnehmen",
        title: "Aufnahme starten",
        body: "Klicken Sie auf „Jetzt aufnehmen“ und erlauben Sie Bildschirm und Mikrofon. Alternativ laden Sie eine fertige Videodatei hoch." },
      { shot: "video-dialog", target: "infobox",
        title: "Vormachen und „Schnitt“ sagen",
        body: "Führen Sie die Aufgabe in Ruhe vor und erklären Sie sie wie einem Kollegen. Nach jedem fertigen Schritt sagen Sie einfach „Schnitt“ – das trennt die Schritte sauber." },
      { shot: "dashboard-job", target: "karte",
        title: "Live zusehen, wie es entsteht",
        body: "Nach dem Hochladen wächst der Entwurf live mit („Schritt 3 von 6 …“). Sie können das Fenster schließen – die fertige Anleitung erscheint auf dem Dashboard." },
      { shot: "builder", target: "video",
        highlight: null, // bewusst ohne (Welle 35): „Bild aus Video wählen“ fehlt (kein Quellvideo im Demo-Builder)
        title: "Frame nachjustieren",
        body: "Hat die KI den falschen Moment erwischt? „Bild aus Video wählen“ öffnet in jedem Schritt eine Zeitleiste, auf der Sie zum richtigen Frame ziehen." },
      { shot: "video-dialog", target: "url",
        title: "Auch möglich: Datei oder Link",
        body: "Statt aufzunehmen können Sie eine Videodatei hochladen (auch mehrere auf einmal) oder einen direkten Video-Link importieren." },
    ],
  },
  {
    slug: "ihr-erstes-tutorial-erstellen",
    cat: "Erste Schritte",
    title: "Eine Anleitung von Hand erstellen",
    desc: "Die Alternative für Feinschliff, Sonderfälle und Verzweigungen.",
    steps: [
      { shot: "dashboard", target: "neu",
        title: "Wann von Hand?",
        body: "Für Feinschliff, Sonderfälle und Ja/Nein-Verzweigungen bauen Sie eine Anleitung Schritt für Schritt selbst. Klicken Sie oben rechts auf „Neues Tutorial“ und vergeben Sie einen Titel." },
      { shot: "builder", target: "titel",
        title: "Schritt beschreiben",
        body: "Jeder Schritt hat einen kurzen Titel im Imperativ (z. B. „App öffnen“) und einen Erklärtext. Fett, Listen und Links sind im Text möglich." },
      { shot: "builder", target: null,
        highlight: { x: 0.49, y: 0.57, w: 0.338, h: 0.356 }, // Hand (Welle 35): Screenshot-Bereich des Schritt-Editors
        title: "Screenshot hinzufügen",
        body: "Fügen Sie pro Schritt ein Bild hinzu: anklicken, per Drag & Drop ablegen oder mit Strg+V einfügen. Der Zuschnitt-Dialog hilft beim passenden Rahmen." },
      { shot: "builder", target: "rechteck",
        title: "Wichtiges markieren",
        body: "Markieren Sie das Entscheidende direkt im Bild: Rechteck, Kreis oder Pfeil, dazu eine Lupe für Details. „Blur“ schwärzt sensible Daten unwiderruflich." },
      { shot: "builder", target: "frage",
        title: "Ja/Nein-Verzweigung",
        body: "Der Schalter „Frage / Verzweigung“ lässt eine Anleitung eine Frage stellen (z. B. „App startet?“) und je nach Antwort unterschiedlich weiterführen." },
      { shot: "builder", target: "hoch",
        title: "Ordnen und Vorschau",
        body: "Mit den Pfeilen im Editor-Kopf ordnen Sie Schritte um; über die Einfügepunkte im Fluss setzen Sie neue Schritte genau an die richtige Stelle. Die Vorschau zeigt alles wie für den Kunden." },
    ],
  },
  // ═══════════════════════ Veröffentlichen ═══════════════════════
  {
    slug: "anleitungen-live-fuehren-lassen",
    cat: "Veröffentlichen",
    title: "Anleitungen live führen lassen",
    desc: "Nutzer direkt auf der echten Seite Schritt für Schritt führen.",
    steps: [
      { shot: "dashboard", target: null,
        highlight: null, // bewusst ohne (Welle 35): reiner Hinweis-Schritt
        title: "Was „Live führen“ bedeutet",
        body: "Statt nur zu lesen, führt Steply Ihre Nutzer direkt auf der echten Website: Ein Overlay zeigt Schritt für Schritt, wohin sie klicken müssen. So finden auch ungeübte Nutzer sicher ans Ziel." },
      { shot: "einbetten", target: "token",
        title: "Voraussetzung: Erweiterung verbinden",
        body: "Die Live-Führung läuft über die Steply-Erweiterung. Verbinden Sie sie einmalig mit Ihrem Konto (siehe „Sofort-Anleitung“) – der Verbindungs-Token steht unter „Einstellungen“ → „Einbetten“." },
      { shot: "dashboard", target: null,
        highlight: null, // bewusst ohne (Welle 35): Ziel (Extension-Seitenleiste) nicht im Screenshot
        title: "„Für diese Seite“ öffnen",
        body: "Öffnen Sie die Seitenleiste der Erweiterung. Unter „Für diese Seite“ listet Steply automatisch die Anleitungen, deren Website zur gerade geöffneten Seite passt." },
      { shot: "wizard-public", target: null,
        highlight: null, // bewusst ohne (Welle 35): Ziel (Seitenleisten-Knopf) nicht im Screenshot
        title: "Führung starten",
        body: "Ein Klick auf „Anleitung führen“ startet das Overlay. Passt der aktuelle Tab nicht zur Anleitung, öffnet Steply automatisch die richtige Startseite." },
      { shot: "wizard-public", target: null,
        highlight: null, // bewusst ohne (Welle 35): Ziel (Live-Overlay auf der echten Seite) nicht im Screenshot
        title: "Schritt für Schritt auf der echten Seite",
        body: "Das Overlay markiert das Ziel-Element live auf der Seite und begleitet jeden Schritt. Reine Hinweis-Schritte ohne Klick-Ziel zeigen ehrlich den hinterlegten Screenshot." },
    ],
  },
  {
    slug: "veroeffentlichen-und-auf-ihre-website-bringen",
    cat: "Veröffentlichen",
    title: "Veröffentlichen & verbreiten",
    desc: "Ein Schalter, viele Wege zu Ihren Kunden.",
    steps: [
      { shot: "dashboard", target: "toggle",
        title: "Veröffentlichen",
        body: "Stellen Sie den Schalter „Auf Hilfe-Seite“ an der Tutorial-Karte um. Sie erhalten sofort den Live-Link – Blur-Markierungen werden dabei fest ins Bild gebrannt." },
      { shot: "einbetten", target: "link",
        title: "Weg 1: Der Link",
        body: "Unter „Einstellungen“ → „Einbetten“ finden Sie den Link Ihrer Hilfe-Seite. Verlinken Sie ihn als Menüpunkt „Hilfe“ auf Ihrer Website – fertig, kein Webdesigner nötig." },
      { shot: "einbetten", target: "iframe",
        title: "Weg 2: Einbetten (iFrame)",
        body: "Soll die Hilfe direkt auf einer Unterseite erscheinen, kopieren Sie den iFrame-Code von der Einbetten-Seite." },
      { shot: "einbetten", target: "bubble",
        title: "Weg 3: Die Chat-Bubble",
        body: "Ein einziges Script-Tag, und Ihr KI-Hilfe-Assistent schwebt auf jeder Seite Ihrer Website – im Look Ihrer Organisation." },
      { shot: "einbetten", target: "qr",
        title: "Weg 4: QR-Code",
        body: "Für Briefe, Rechnungen oder den Aushang: Zu jeder Anleitung und zur Hilfe-Seite gibt es einen QR-Code zum Ausdrucken." },
      { shot: "wizard-public", target: "drucken",
        title: "Druckansicht",
        body: "Jede Anleitung hat eine Druckansicht mit allen Schritten untereinander – für Kunden, die lieber Papier mögen." },
    ],
  },
  {
    slug: "mehrsprachig-und-vorlesen",
    cat: "Veröffentlichen",
    title: "Mehrsprachig & Vorlesen",
    desc: "Hilfe-Seite in mehreren Sprachen und zum Anhören (Business).",
    steps: [
      { shot: "branding", target: "sprachen",
        title: "Sprachen aktivieren (Business)",
        body: "Unter „Einstellungen“ → „Branding“ aktivieren Sie im Abschnitt „Sprachen“ zusätzliche Sprachen (Englisch, Polnisch, Türkisch). Deutsch ist immer an." },
      { shot: "branding", target: null,
        highlight: null, // bewusst ohne (Welle 35): reiner Hinweis-Schritt (kein Bedien-Ziel im Branding-Shot)
        title: "Automatische Übersetzung",
        body: "Beim Veröffentlichen wird eine Anleitung vollständig übersetzt; spätere Änderungen nur als Delta – jeweils automatisch im Hintergrund. Sie pflegen also nur die deutsche Fassung." },
      { shot: "hub", target: null,
        highlight: { x: 0.934, y: 0.036, w: 0.044, h: 0.024 }, // Hand (Welle 35): DE·EN-Sprachumschalter oben rechts
        title: "Sprachumschalter auf der Hilfe-Seite",
        body: "Besucher wählen ihre Sprache oben auf der Hilfe-Seite; die gewählte Sprache steckt in der Adresse und bleibt erhalten. Suchmaschinen erhalten passende hreflang-Angaben." },
      { shot: "wizard-public", target: "vorlesen",
        highlight: null, // bewusst ohne (Welle 35): ▶-Symbol im Wizard-Shot nicht vorhanden (kein Audio im Demo)
        title: "Vorlesen (Business)",
        body: "Jeder Schritt lässt sich vorlesen: Über das ▶-Symbol im Wizard hören Nutzer den Erklärtext. Steply erzeugt die Audios automatisch beim Veröffentlichen." },
      { shot: "wizard-public", target: null,
        highlight: null, // bewusst ohne (Welle 35): reiner Hinweis-Schritt
        title: "Immer aktuell – ohne Doppelkosten",
        body: "Ändert sich ein Text, frischt Steply Übersetzung und Audio automatisch nach. Ein Hash-Cache sorgt dafür, dass unveränderte Schritte nichts kosten." },
    ],
  },
  // ═══════════════════════ KI & Insights ═══════════════════════
  {
    slug: "der-ki-hilfe-assistent-und-die-wissensdatenbank",
    cat: "KI & Insights",
    title: "KI-Assistent & Wissensdatenbank",
    desc: "Ein Chatbot, der nur mit Ihren Inhalten antwortet – und mitdenkt.",
    steps: [
      { shot: "hub-chat", target: "frage",
        title: "Chat testen",
        body: "Der Chat auf Ihrer Hilfe-Seite beantwortet Kundenfragen ausschließlich aus Ihren veröffentlichten Anleitungen und Ihrer Wissensdatenbank – er erfindet nichts dazu. Testen Sie ihn mit einer echten Frage." },
      { shot: "knowledge", target: "neu",
        title: "Wissensdatenbank füllen",
        body: "Unter „Assistent“ → „Wissensdatenbank“ legen Sie freies Wissen an: Öffnungszeiten, Zuständigkeiten, FAQs. Veröffentlichte Artikel fließen automatisch in den Chat ein." },
      { shot: "knowledge", target: "import",
        title: "Wissen importieren",
        body: "Statt alles zu tippen, importieren Sie „Von Ihrer Website“ oder aus einem Dokument (PDF/Word). Steply erzeugt daraus Entwürfe – nichts wird automatisch veröffentlicht." },
      { shot: "eskalation", target: null,
        highlight: { x: 0.172, y: 0.878, w: 0.115, h: 0.042 }, // Hand (Welle 35): „Person hinzufügen“ (Ansprechpartner & Schwerpunkte)
        title: "Ansprechpartner hinterlegen",
        body: "Unter „Assistent“ → „Kontakt & Eskalation“ legen Sie fest, an wen der Chat verweist, wenn er nicht weiterweiß – mit Terminbuchung, E-Mail und Telefon je Fachgebiet." },
      { shot: "fragen", target: null,
        highlight: null, // bewusst ohne (Welle 35): „Entwurf erstellen“ fehlt (leerer Zustand ohne offene Fragen)
        title: "Offene Fragen zu Entwürfen machen",
        body: "Fragen, die der Chat nicht beantworten konnte, sammelt Steply unter „Assistent“ → „Offene Fragen“. Neben jeder Frage baut „Entwurf erstellen“ ein Anleitungs-Gerüst, das Sie nur noch ergänzen." },
      { shot: "dashboard", target: "insights",
        title: "Aktualitäts-Autopilot",
        body: "Der Autopilot prüft Ihre Anleitungen regelmäßig gegen das Web und meldet, wenn sich z. B. eine Software-Oberfläche geändert hat. Auf dem Dashboard sehen Sie Nutzung und Hinweise auf einen Blick." },
    ],
  },
  // ═══════════════════════ Team ═══════════════════════
  {
    slug: "team-einladen-und-organisationen",
    cat: "Team",
    title: "Team & internes Wissen",
    desc: "Gemeinsam pflegen, intern schulen, sauber getrennt.",
    steps: [
      { shot: "team", target: "einladen",
        title: "Team einladen",
        body: "Unter „Einstellungen“ → „Team“ laden Sie Kolleginnen und Kollegen per E-Mail ein – als Inhaber (verwaltet alles) oder als Bearbeiter (pflegt Inhalte)." },
      { shot: "team", target: null,
        highlight: null, // bewusst ohne (Welle 35): Annahme-Flow (Einladungs-Link der eingeladenen Person) nicht im Team-Screenshot
        title: "Einladung annehmen",
        body: "Die eingeladene Person klickt den Link, legt ein Passwort fest (oder meldet sich an) und landet direkt in Ihrer Organisation." },
      { shot: "dashboard", target: "switcher",
        title: "Mehrere Organisationen",
        body: "Wer zu mehreren Organisationen gehört, wechselt oben links im Kopfbereich. Jede Organisation hat ihre eigene Hilfe-Seite, ihr eigenes Design und ihr eigenes Team." },
      { shot: "builder", target: null,
        highlight: { x: 0.404, y: 0.203, w: 0.204, h: 0.032 }, // Hand (Welle 35): „Im Lern-Bereich (Team, mit Nachweis)“-Schalter
        title: "Interne Anleitungen",
        body: "Anleitungen können „Intern“ statt „Öffentlich“ sein: Sie erscheinen nie auf der Hilfe-Seite und nie im Chatbot, sondern nur für Ihr Team." },
      { shot: "lernen", target: null,
        highlight: { x: 0.158, y: 0.189, w: 0.682, h: 0.087 }, // Hand (Welle 35): Schulungskarte mit „0 von 2 im Team“-Nachweis
        title: "Lernen & Schulungsnachweis",
        body: "Unter „Lernen“ arbeitet das Team interne Anleitungen durch und markiert sie als absolviert. Inhaber sehen im Schulungsnachweis, wer was erledigt hat." },
    ],
  },
];
