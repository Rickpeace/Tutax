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

// Prod-Route je Shot -> page_url (Startseite der Live-Führung für diesen Schritt).
// null: keine stabile Adresse — Editor (dynamische URL; die Führung sucht dann auf der gerade
// offenen Editor-Seite), öffentliche Hilfe-Seiten (liegen unter der KUNDEN-Adresse, nur
// Illustration) und Montagen mit der Seitenleiste der Steply-Erweiterung (kein App-Ziel).
// Welle 52a: auf die neue Oberfläche (Welle 50) umgestellt — Einstellungen mit Seitenleiste.
export const SHOT_ROUTES = {
  dashboard: "/app",
  "dashboard-insights": "/app",
  "dashboard-job": "/app",
  "new-dialog": "/app",
  "video-dialog": "/app",
  builder: null,
  "builder-menu": null,
  "builder-empty": null,
  "dashboard-catmenu": "/app",
  aussehen: "/app/settings/aussehen",
  teilen: "/app/settings/teilen",
  "teilen-iframe": "/app/settings/teilen",
  chat: "/app/settings/chat",
  sprachen: "/app/settings/sprachen",
  "erweiterung-neu": "/app/settings/erweiterung",
  erweiterung: "/app/settings/erweiterung",
  team: "/app/settings/team",
  eskalation: "/app/assistent/eskalation",
  knowledge: "/app/assistent/wissen",
  fragen: "/app/assistent/fragen",
  lernen: "/app/lernen",
  hub: null,
  "hub-chat": null,
  "wizard-public": null,
  "panel-start": null,
  "panel-guides": null,
  "panel-run": null,
  "panel-review": null,
};

// Reihenfolge der Kategorien (Position). Bestehende Namen beibehalten (alte Struktur).
export const CATEGORIES = ["Erste Schritte", "Veröffentlichen", "KI & Insights", "Team"];

// Reihenfolge der Tutorials = Anzeige-Reihenfolge im Hub (innerhalb der Kategorie nach
// Einfuege-Reihenfolge). Sofort-Anleitung steht als STANDARD direkt hinter „Erste Schritte“.
// slug: bestehende Slugs beibehalten, wo das Thema gleich bleibt (alte Links!).
// Welle 52a: Texte + Klickfolge gegen die neue Oberfläche geprüft; Hand-Markierungen durch
// Auto-Markierungen ersetzt (shoot-steply-help.mjs findet die Ziele jetzt selbst).
// 09/2026: Editor-Kopf mit „Veröffentlichen“ + „…“-Menü, Zielgruppen-Chips, „+“ fügt direkt ein
// (Blitz = ab hier aufnehmen), leere Anleitung, „Texte mit KI verbessern“, Eingaben beim Prüfen,
// Kategorie-„…“-Menü.
export const TUTORIALS = [
  // ═══════════════════════ Erste Schritte ═══════════════════════
  {
    slug: "konto-und-hilfe-seite-einrichten",
    cat: "Erste Schritte",
    title: "Erste Schritte: Konto & Hilfe-Seite einrichten",
    desc: "Organisation, Design und eigene Hilfe-Seite – in wenigen Minuten startklar.",
    steps: [
      { shot: "dashboard", target: "switcher",
        title: "Konto und Organisation",
        body: "Bei der ersten Anmeldung legt Steply automatisch eine Organisation für Sie an – ihren Namen sehen Sie im Menü hinter Ihrem Profilbild oben rechts. Über das Hauptmenü erreichen Sie „Anleitungen“, „Schulungen“, „Automationen“ und den „KI-Assistenten“." },
      { shot: "aussehen", target: "nav",
        title: "Aussehen öffnen",
        body: "Im Menü hinter Ihrem Profilbild öffnen Sie die „Einstellungen“ und wählen in der Seitenleiste unter „Hilfe-Seite“ den Punkt „Aussehen“. Den Namen Ihrer Organisation ändern Sie unter „Allgemein“, die Adresse der Hilfe-Seite unter „Adresse & Teilen“." },
      { shot: "aussehen", target: "website",
        title: "Design von Ihrer Website übernehmen (KI)",
        body: "Sie müssen nichts von Hand einstellen: Geben Sie unter „Design von Ihrer Website übernehmen“ Ihre Website-Adresse ein und klicken Sie auf „Analysieren“. Die KI liest Farben, Schrift und Logo aus – zu helle Farben werden automatisch lesbar gemacht (Business)." },
      { shot: "aussehen", target: "modus",
        title: "Design-Grundlage wählen",
        body: "Oben entscheiden Sie, welches Design live ist: „Steply-Standard“, „Von Ihrer Website“ oder „Nachgebaut“. Mit „Live-Vorschau“ prüfen Sie jede Variante, mit „Verwenden“ schalten Sie sie aktiv." },
      { shot: "hub", target: "marke",
        title: "Ihre Hilfe-Seite ansehen",
        body: "Ihre öffentliche Hilfe-Seite liegt unter Ihrer eigenen Adresse (…/h/ihr-name) im Look Ihrer Organisation. Über den Knopf „Hilfe-Seite“ oben in Steply öffnen Sie sie jederzeit in einem neuen Tab." },
      { shot: "dashboard", target: "neu",
        title: "Jetzt mit Inhalten füllen",
        body: "Als Nächstes füllen Sie die Seite mit Anleitungen. Am schnellsten geht das mit der Sofort-Anleitung per Steply-Erweiterung (nächstes Kapitel) – alternativ aus einem Video oder von Hand, jeweils über „Neue Anleitung“." },
    ],
  },
  {
    slug: "sofort-anleitung-mit-der-browser-erweiterung",
    cat: "Erste Schritte",
    title: "Sofort-Anleitung mit der Steply-Erweiterung",
    desc: "Der schnellste Weg – und unser Standard: einfach klicken, fertige Anleitung.",
    steps: [
      { shot: "new-dialog", target: "sofort",
        title: "Der schnellste Weg – und unser Standard",
        body: "Die Sofort-Anleitung ist der empfohlene Standard-Weg: Die Steply-Erweiterung nimmt bei jedem Klick automatisch einen Screenshot auf und markiert das geklickte Element. In Sekunden entsteht ein fertiger Entwurf – ohne Video, ohne Kommandos." },
      { shot: "erweiterung-neu", target: "status",
        title: "Steply-Erweiterung installieren",
        body: "Unter „Einstellungen“ → „Steply-Erweiterung“ sehen Sie, ob die Erweiterung schon installiert ist. Falls nicht, klicken Sie auf „Erweiterung installieren“ und fügen Sie sie einmalig zu Chrome oder Edge hinzu." },
      { shot: "erweiterung", target: "verbinden",
        title: "Mit Ihrem Konto verbinden",
        body: "Ist die Erweiterung installiert, klicken Sie auf derselben Seite auf „Jetzt verbinden“ – schon ist sie mit Ihrem Konto gekoppelt, ganz ohne Code-Kopieren. Klappt das einmal nicht, hilft „Code manuell eingeben“." },
      { shot: "panel-start", target: "aufnahme",
        title: "Aufnahme starten",
        body: "Öffnen Sie die Seite, auf der Ihr Ablauf beginnt, und dann die Seitenleiste der Steply-Erweiterung. Im Reiter „Aufnehmen“ klicken Sie auf „Aufnahme starten“ und führen die Aufgabe ganz normal durch – jeder Klick wird zu einem Schritt." },
      { shot: "panel-review", target: "typed",
        title: "Aufnahme prüfen",
        body: "Mit „Fertig“ beenden Sie die Aufnahme und sehen alle Schritte im Überblick. Eingetippte Werte (z. B. eine Kundennummer) übernimmt Steply in den Schritt-Titel – sie stehen als „Eingabe: …“ unter dem Schritt und lassen sich mit „weglassen“ entfernen. Passwörter und andere sensible Felder werden nie übernommen." },
      { shot: "dashboard-job", target: "karte",
        title: "Anleitung erstellen",
        body: "Vergeben Sie im Prüfen-Bildschirm Titel und Kategorie und klicken Sie auf „Anleitung erstellen“. Der Entwurf erscheint automatisch unter „Anleitungen“, kurz mit „Wird erstellt …“." },
      { shot: "builder", target: "verbessern",
        title: "Texte mit KI verbessern",
        body: "Öffnen Sie den Entwurf und klicken Sie über dem Ablauf auf „Texte mit KI verbessern“. Die KI formuliert Titel und Erklärtexte natürlicher; Sie sehen jeden Vorschlag vorher und übernehmen nur, was passt. Die Meldung unten rechts bietet danach „Rückgängig“." },
      { shot: "builder", target: "verpixeln",
        title: "Verpixelung prüfen",
        body: "Steply erkennt sensible Felder (z. B. Namen oder Beträge) und verpixelt sie automatisch. Prüfen Sie die Stellen im Editor – mit „Verpixeln“ ergänzen Sie weitere. Beim Veröffentlichen wird die Verpixelung fest ins Bild gebrannt." },
    ],
  },
  {
    slug: "tutorial-aus-einem-video-erstellen",
    cat: "Erste Schritte",
    title: "Anleitung aus einem Video",
    desc: "Die Alternative, wenn Sie den Ablauf lieber einmal erzählen.",
    steps: [
      { shot: "dashboard", target: "neu",
        title: "Wann sich Video lohnt",
        body: "Die Alternative zur Sofort-Anleitung: Wenn Sie den Ablauf lieber einmal erzählen oder schon eine Bildschirmaufnahme haben, baut Steply daraus die Anleitung. Klicken Sie oben rechts auf „Neue Anleitung“." },
      { shot: "new-dialog", target: "video",
        title: "„Aus Video“ wählen",
        body: "Im Fenster „Neue Anleitung“ wählen Sie „Aus Video“. In der Steply-Erweiterung finden Sie dasselbe im Hilfe-Menü (?) unter „Video mit Ton aufnehmen“." },
      { shot: "video-dialog", target: "aufnehmen",
        title: "Aufnahme starten",
        body: "Klicken Sie auf „Jetzt aufnehmen (Bildschirm + Mikro)“ und erlauben Sie Bildschirm und Mikrofon." },
      { shot: "video-dialog", target: "infobox",
        title: "Vormachen und „Schnitt“ sagen",
        body: "Führen Sie die Aufgabe in Ruhe vor und erklären Sie sie wie einem Kollegen. Nach jedem fertigen Schritt sagen Sie einfach „Schnitt“ – das trennt die Schritte sauber." },
      { shot: "video-dialog", target: "url",
        title: "Auch möglich: Datei oder Link",
        body: "Statt aufzunehmen laden Sie eine Videodatei hoch (auch mehrere auf einmal) oder holen über „Von URL importieren“ ein Video von einem direkten Link." },
      { shot: "dashboard-job", target: "karte",
        title: "Live zusehen, wie es entsteht",
        body: "Nach dem Hochladen wächst der Entwurf live mit („Schritt 3 von 6 …“). Sie können das Fenster schließen – die fertige Anleitung erscheint unter „Anleitungen“." },
      { shot: "builder", target: null,
        highlight: null, // bewusst ohne: „Bild aus Video wählen“ gibt es nur bei Anleitungen mit Quellvideo
        title: "Bild nachjustieren",
        body: "Hat die KI den falschen Moment erwischt? In Anleitungen aus einem Video öffnet „Bild aus Video wählen“ in jedem Schritt eine Zeitleiste, auf der Sie zum richtigen Bild ziehen." },
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
        body: "Für Feinschliff, Sonderfälle und Ja/Nein-Verzweigungen bauen Sie eine Anleitung Schritt für Schritt selbst. Klicken Sie oben rechts auf „Neue Anleitung“, wählen Sie „Selbst bauen“ und vergeben Sie einen Titel." },
      { shot: "builder-empty", target: "handanlegen",
        title: "Ersten Schritt anlegen",
        body: "Eine neue Anleitung ist zunächst leer. Mit „Schritt von Hand anlegen“ beginnen Sie selbst – oder Sie nehmen den Ablauf mit „Mit der Steply-Erweiterung aufnehmen“ direkt in diese Anleitung auf." },
      { shot: "builder", target: "titel",
        title: "Schritt beschreiben",
        body: "Rechts öffnet sich der Schritt: oben ein kurzer Titel im Imperativ (z. B. „App öffnen“), darunter der Erklärtext. Fett, Listen und Links sind im Text möglich." },
      { shot: "builder", target: "bild",
        title: "Screenshot hinzufügen",
        body: "Unter dem Erklärtext fügen Sie das Bild hinzu: anklicken, per Drag & Drop ablegen oder mit Strg+V einfügen. Der Zuschnitt-Dialog hilft beim passenden Rahmen." },
      { shot: "builder", target: "rechteck",
        title: "Wichtiges markieren",
        body: "Markieren Sie das Entscheidende direkt im Bild: Rechteck, Kreis oder Pfeil – eine Markierung lässt sich zusätzlich als Lupe vergrößert zeigen. „Verpixeln“ macht sensible Daten unkenntlich." },
      { shot: "builder", target: "frage",
        title: "Ja/Nein-Verzweigung",
        body: "Unter dem Screenshot lässt der Schalter „Frage / Verzweigung“ die Anleitung eine Frage stellen (z. B. „App startet?“) und je nach Antwort unterschiedlich weiterführen." },
      { shot: "builder", target: "einfuegen",
        title: "Schritt einfügen oder ab hier aufnehmen",
        body: "Das „+“ zwischen zwei Schritten fügt sofort einen leeren Schritt an dieser Stelle ein. Das Blitz-Symbol daneben nimmt ab hier mit der Steply-Erweiterung auf – die neuen Schritte landen genau dort." },
      { shot: "builder", target: "hoch",
        title: "Ordnen und Vorschau",
        body: "Mit den Pfeilen im Schritt-Editor ordnen Sie Schritte um. Die „Vorschau“ oben im Editor zeigt alles so, wie Ihre Kunden es sehen." },
      { shot: "dashboard-catmenu", target: "loeschen",
        title: "Kategorien aufräumen",
        body: "Die Kategorie einer Anleitung wählen Sie oben im Editor. Eine eigene Kategorie löschen Sie unter „Anleitungen“ über „…“ neben ihrem Namen – die Anleitungen darin bleiben erhalten und wandern nach „Sonstiges“." },
    ],
  },
  // ═══════════════════════ Veröffentlichen ═══════════════════════
  {
    slug: "anleitungen-live-fuehren-lassen",
    cat: "Veröffentlichen",
    title: "Anleitungen auf der Seite zeigen",
    desc: "Nutzer direkt auf der echten Seite Schritt für Schritt führen.",
    steps: [
      { shot: "panel-run", target: null,
        highlight: null, // bewusst ohne: reiner Hinweis-Schritt (Überblick)
        title: "Was „Auf der Seite zeigen“ bedeutet",
        body: "Statt nur zu lesen, führt Steply Ihre Nutzer direkt auf der echten Website: Schritt für Schritt wird markiert, wohin sie klicken müssen. So finden auch ungeübte Nutzer sicher ans Ziel." },
      { shot: "erweiterung", target: "verbinden",
        title: "Voraussetzung: Steply-Erweiterung verbinden",
        body: "Das Zeigen auf der Seite läuft über die Steply-Erweiterung. Verbinden Sie sie einmalig unter „Einstellungen“ → „Steply-Erweiterung“ mit „Jetzt verbinden“ (siehe „Sofort-Anleitung“)." },
      { shot: "panel-start", target: "seite",
        title: "„Für diese Seite“ öffnen",
        body: "Öffnen Sie die Seitenleiste der Steply-Erweiterung. „Für diese Seite“ zeigt, wie viele Anleitungen zur gerade geöffneten Website passen – welche Website das ist, legen Sie im Editor unter „Gilt für Website“ fest. Ein Klick öffnet die Liste im Reiter „Anleitungen“." },
      { shot: "panel-guides", target: "zeigen",
        title: "Führung starten",
        body: "Wählen Sie eine Anleitung aus und klicken Sie auf „Auf der Seite zeigen“. Passt der aktuelle Tab nicht zur Anleitung, öffnet Steply automatisch die richtige Startseite." },
      { shot: "panel-run", target: "ziel",
        title: "Schritt für Schritt auf der echten Seite",
        body: "Steply markiert das Ziel-Element live auf der Seite und erklärt jeden Schritt in der Seitenleiste. Reine Hinweis-Schritte ohne Klick-Ziel zeigen ehrlich den hinterlegten Screenshot." },
    ],
  },
  {
    slug: "veroeffentlichen-und-auf-ihre-website-bringen",
    cat: "Veröffentlichen",
    title: "Veröffentlichen & verbreiten",
    desc: "Ein Schalter, viele Wege zu Ihren Kunden.",
    steps: [
      { shot: "builder", target: "status",
        title: "Veröffentlichen",
        body: "Wählen Sie oben im Editor, wer die Anleitung sieht („Hilfe-Seite (für alle)“, „Team“ oder beides), und klicken Sie auf „Veröffentlichen“ – danach steht dort „✓ Veröffentlicht“. Zurück auf Entwurf geht über das „…“-Menü daneben. Verpixelte Stellen werden beim Veröffentlichen fest ins Bild gebrannt." },
      { shot: "teilen", target: "link",
        title: "Weg 1: Der Link",
        body: "Unter „Einstellungen“ → „Adresse & Teilen“ finden Sie bei „Link teilen“ die Adresse Ihrer Hilfe-Seite. Verlinken Sie sie als Menüpunkt „Hilfe“ auf Ihrer Website – fertig. Den Link zu einer einzelnen Anleitung kopieren Sie im Editor über „…“ → „Link zur Hilfe-Seite kopieren“." },
      { shot: "teilen-iframe", target: "iframe",
        title: "Weg 2: Einbetten (iFrame)",
        body: "Soll die Hilfe direkt auf einer Unterseite Ihrer Website erscheinen, kopieren Sie auf derselben Seite den Code unter „Auf Ihrer Website einbetten (iFrame)“." },
      { shot: "chat", target: "bubble",
        title: "Weg 3: Der KI-Assistent auf Ihrer Website",
        body: "Unter „Einstellungen“ → „Chat auf Ihrer Website“ kopieren Sie eine einzige Zeile Code in Ihre Website – dann schwebt Ihr KI-Assistent unten rechts auf jeder Seite, im Look Ihrer Organisation." },
      { shot: "teilen", target: "qr",
        title: "Weg 4: QR-Code",
        body: "Für Briefe, Rechnungen oder den Aushang: Unter „Adresse & Teilen“ finden Sie den QR-Code zu Ihrer Hilfe-Seite. Den Code zu einer einzelnen Anleitung öffnen Sie im Menü ihrer Karte mit „QR-Code öffnen“." },
      { shot: "wizard-public", target: "drucken",
        title: "Druckansicht",
        body: "Jede Anleitung hat auf der Hilfe-Seite eine Druckansicht mit allen Schritten untereinander – für Kunden, die lieber Papier mögen." },
    ],
  },
  {
    slug: "mehrsprachig-und-vorlesen",
    cat: "Veröffentlichen",
    title: "Mehrsprachig & Vorlesen",
    desc: "Hilfe-Seite in mehreren Sprachen und zum Anhören (Business).",
    steps: [
      { shot: "sprachen", target: "sprachen",
        title: "Sprachen aktivieren (Business)",
        body: "Unter „Einstellungen“ → „Sprachen & Vorlesen“ schalten Sie zusätzliche Sprachen ein (Englisch, Polnisch, Türkisch). Deutsch ist immer an." },
      { shot: "sprachen", target: "uebersetzung",
        title: "Automatische Übersetzung",
        body: "Beim Veröffentlichen wird eine Anleitung vollständig übersetzt; spätere Änderungen nur als Delta – jeweils automatisch im Hintergrund. Sie pflegen also nur die deutsche Fassung; im Editor stoßen Sie die Übersetzung über „…“ → „Übersetzen“ auch sofort an." },
      { shot: "hub", target: "sprache",
        title: "Sprachumschalter auf der Hilfe-Seite",
        body: "Besucher wählen ihre Sprache oben auf der Hilfe-Seite; die gewählte Sprache steckt in der Adresse und bleibt erhalten. Suchmaschinen erhalten passende hreflang-Angaben." },
      { shot: "wizard-public", target: "vorlesen",
        title: "Vorlesen (Business)",
        body: "Jeder Schritt lässt sich vorlesen: Über das Lautsprecher-Symbol neben dem Schritt-Titel hören Nutzer den Erklärtext. Steply erzeugt die Audios automatisch beim Veröffentlichen." },
      { shot: "wizard-public", target: null,
        highlight: null, // bewusst ohne: reiner Hinweis-Schritt
        title: "Immer aktuell – ohne Doppelkosten",
        body: "Ändert sich ein Text, frischt Steply Übersetzung und Audio automatisch nach. Ein Zwischenspeicher sorgt dafür, dass unveränderte Schritte nichts kosten." },
    ],
  },
  // ═══════════════════════ KI & Insights ═══════════════════════
  {
    slug: "der-ki-hilfe-assistent-und-die-wissensdatenbank",
    cat: "KI & Insights",
    title: "KI-Assistent & Wissensdatenbank",
    desc: "Ein KI-Assistent, der nur mit Ihren Inhalten antwortet – und mitdenkt.",
    steps: [
      { shot: "hub-chat", target: "frage",
        title: "KI-Assistent testen",
        body: "Der KI-Assistent auf Ihrer Hilfe-Seite beantwortet Kundenfragen ausschließlich aus Ihren veröffentlichten Anleitungen und Ihrer Wissensdatenbank – er erfindet nichts dazu. Testen Sie ihn mit einer echten Frage." },
      { shot: "knowledge", target: "neu",
        title: "Wissensdatenbank füllen",
        body: "Unter „KI-Assistent“ → „Wissensdatenbank“ legen Sie freies Wissen an: Öffnungszeiten, Zuständigkeiten, häufige Fragen. Veröffentlichte Artikel fließen automatisch in die Antworten ein." },
      { shot: "knowledge", target: "import",
        title: "Wissen importieren",
        body: "Statt alles zu tippen, importieren Sie „Von Ihrer Website“ oder aus einem Dokument (PDF/Word). Steply erzeugt daraus Entwürfe – nichts wird automatisch veröffentlicht." },
      { shot: "eskalation", target: "person",
        title: "Ansprechpartner hinterlegen",
        body: "Unter „KI-Assistent“ → „Persönlicher Kontakt“ legen Sie fest, wie Kunden Sie erreichen, wenn der KI-Assistent nicht weiterweiß – mit „Zuständige Person hinzufügen“ auch je Thema, mit Terminbuchung, E-Mail und Telefon. Die Vorschau daneben zeigt, was der Kunde sieht." },
      { shot: "fragen", target: "entwurf",
        title: "Offene Fragen zu Entwürfen machen",
        body: "Fragen, die der KI-Assistent nicht beantworten konnte, sammelt Steply unter „KI-Assistent“ → „Offene Fragen“. Neben jeder Frage baut „Entwurf erstellen“ ein Anleitungs-Gerüst, das Sie nur noch ergänzen." },
      { shot: "builder-menu", target: "aktualitaet",
        title: "Aktualität prüfen",
        body: "Steply prüft Ihre Anleitungen jede Woche automatisch gegen das Web und meldet über die Glocke oben, wenn sich z. B. eine Software-Oberfläche geändert hat. Im Editor starten Sie die Prüfung über „…“ → „Aktualität prüfen“ auch sofort." },
      { shot: "dashboard-insights", target: "insights",
        title: "Nutzung im Blick",
        body: "Unter „Anleitungen“ zeigt „Nutzung (letzte 30 Tage)“, wie oft Ihre Anleitungen aufgerufen wurden, was der KI-Assistent gefragt wurde und wie hilfreich Ihre Kunden die Anleitungen fanden – samt den offenen Fragen als Wissenslücken." },
    ],
  },
  // ═══════════════════════ Team ═══════════════════════
  {
    slug: "team-einladen-und-organisationen",
    cat: "Team",
    title: "Team & Schulungen",
    desc: "Gemeinsam pflegen, im Team schulen, sauber getrennt.",
    steps: [
      { shot: "team", target: "einladen",
        title: "Team einladen",
        body: "Unter „Einstellungen“ → „Team“ laden Sie Kolleginnen und Kollegen per E-Mail ein – als „Inhaber“ (verwaltet alles) oder als „Bearbeiter“ (pflegt Inhalte)." },
      { shot: "team", target: "offen",
        title: "Einladung annehmen",
        body: "Die eingeladene Person klickt den Link in der E-Mail, legt ein Passwort fest (oder meldet sich an) und landet direkt in Ihrer Organisation. Bis dahin steht sie bei den offenen Einladungen." },
      { shot: "dashboard", target: "switcher",
        title: "Mehrere Organisationen",
        body: "Wer zu mehreren Organisationen gehört, wechselt im Menü hinter dem Profilbild oben rechts („Organisation wechseln“) oder unter „Einstellungen“ → „Allgemein“. Jede Organisation hat ihre eigene Hilfe-Seite, ihr eigenes Design und ihr eigenes Team." },
      { shot: "builder", target: "audience",
        title: "Anleitungen nur fürs Team",
        body: "Oben im Editor schalten Sie die Chips „Hilfe-Seite (für alle)“ und „Team“ (Business) unabhängig voneinander ein – einer bleibt immer an. Nur „Team“: Die Anleitung erscheint nie auf der Hilfe-Seite und nie im KI-Assistenten, sondern nur in den Schulungen Ihres Teams. Beides: öffentlich und zusätzlich in den Schulungen – „mit Schulungsnachweis“." },
      { shot: "lernen", target: "karte",
        title: "Schulungen & Schulungsnachweis",
        body: "Unter „Schulungen“ arbeitet das Team seine Anleitungen durch und markiert sie als absolviert. Jede Karte zeigt, wie viele im Team schon fertig sind; Inhaber sehen in der Schulung, wer was wann erledigt hat." },
    ],
  },
];
