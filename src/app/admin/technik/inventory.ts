/**
 * Technik-Inventar für /admin/technik — die Landkarte für Entwickler:
 * welche Fremddienste laufen, wofür, wo im Code, was noch fehlt.
 *
 * PFLEGE: Neuer Dienst / neue Env-Variable / erledigter Punkt → hier nachziehen.
 * Env-Namen werden auf der Seite nur als „gesetzt / fehlt" geprüft — nie Werte zeigen.
 */

export type Where = "vercel" | "hetzner" | "lokal";

export type EnvVar = {
  name: string;
  /** Pflicht = ohne sie bricht etwas; optional = Feature fällt still zurück. */
  required: boolean;
  /** Wo die Variable gesetzt sein muss. Nur "vercel" ist auf der Seite prüfbar. */
  where: Where;
  note?: string;
};

export type Service = {
  name: string;
  group: "Datenbank & Dateien" | "KI" | "E-Mail" | "Hosting & Betrieb" | "Kleinere Dienste";
  purpose: string;
  details: string[];
  code: string[];
  env: EnvVar[];
  /** Serverstandort / Datenschutz-Hinweis (AVV-relevant). */
  region: string;
  privacyWarning?: boolean;
};

export const SERVICES: Service[] = [
  {
    name: "Supabase",
    group: "Datenbank & Dateien",
    purpose: "Postgres-Datenbank, Login, Dateispeicher, Vektor-Suche — das Rückgrat.",
    details: [
      "Postgres mit RLS über my_account_ids() — jede Organisation sieht nur ihre Daten.",
      "Auth: E-Mail+Passwort, Magic Link, Passwort-Reset (Token-Hash-Flow über /auth/confirm).",
      "Storage-Buckets: tutorial-images (privat, signierte URLs), tutorial-images-public (beim Publish befüllt), tutorial-videos (privat, Worker-Input), dazu MP3s fürs Vorlesen.",
      "pgvector: Embeddings für Chatbot + Hub-Suche (match_kb).",
      "Migrationen in supabase/migrations/ (0001–0038), angewandt per scripts/apply-migrations.mjs — kein Supabase-CLI.",
    ],
    code: ["src/lib/supabase/{server,client,admin,proxy-session}.ts", "supabase/migrations/", "src/proxy.ts"],
    env: [
      { name: "NEXT_PUBLIC_SUPABASE_URL", required: true, where: "vercel" },
      { name: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", required: true, where: "vercel" },
      { name: "SUPABASE_SECRET_KEY", required: true, where: "vercel", note: "Service-Role — nur serverseitig" },
      { name: "SUPABASE_DB_URL", required: false, where: "lokal", note: "Nur für Migrationen/Skripte (Session-Pooler)" },
      { name: "SUPABASE_URL", required: true, where: "hetzner", note: "Video-Worker" },
    ],
    region: "EU — AWS eu-west-1 (Irland), Projekt „ClickTax“",
  },
  {
    name: "OpenAI",
    group: "KI",
    purpose: "Haupt-KI: Chatbot, Bilderkennung, Übersetzung, Transkription, Embeddings.",
    details: [
      "gpt-5.4-mini — Chatbot (RAG), Schritt-Vorschläge aus Screenshot, CI-Analyse, Drift-Check, Übersetzungen EN/PL/TR, Wissens-Import, Video-Segmentierung.",
      "whisper-1 — Sprache aus Videos → Text mit Wort-Zeitstempeln (Video-Worker).",
      "text-embedding-3-small (1536 Dim.) — Suchindex für Chatbot + Hub-Suche.",
      "gpt-4o-mini-tts (Stimme onyx) — Vorlesen, nur als Fallback wenn ElevenLabs fehlt.",
      "Direkt über das openai-SDK — bewusst NICHT das Vercel AI SDK.",
    ],
    code: ["src/lib/ai.ts (Modelle)", "src/lib/openai.ts (Client)", "src/lib/ai-prompts.ts (Prompts)", "video-worker/index.mjs"],
    env: [
      { name: "OPENAI_API_KEY", required: true, where: "vercel", note: "Ohne Key laufen alle KI-Features als No-op" },
      { name: "OPENAI_API_KEY", required: true, where: "hetzner", note: "Video-Worker + agent-bridge" },
    ],
    region: "USA",
    privacyWarning: true,
  },
  {
    name: "ElevenLabs",
    group: "KI",
    purpose: "Vorlesen (TTS) der Schritte — natürlichere deutsche Stimme als OpenAI.",
    details: [
      "Modell eleven_multilingual_v2, MP3 je Schritt beim Publish, Hash-Cache (steps.audio_hash).",
      "Fehlt der Key, fällt das Vorlesen STILL auf OpenAI-TTS zurück.",
      "Nur im Business-Tarif.",
    ],
    code: ["src/lib/tts.ts", "src/lib/tts-core.ts", "scripts/backfill-tts.mjs"],
    env: [
      { name: "ELEVENLABS_API_KEY", required: false, where: "vercel" },
      { name: "ELEVENLABS_VOICE_ID", required: false, where: "vercel", note: "Standard-Stimme ist im Code hinterlegt" },
    ],
    region: "USA",
    privacyWarning: true,
  },
  {
    name: "Anthropic (Claude Code)",
    group: "KI",
    purpose: "Baut Code-Änderungen aus Kundenwünschen (agent-bridge auf Hetzner).",
    details: [
      "Läuft isoliert im Docker-Container „claude-box“ — sieht nur den Steply-Klon.",
      "Kein Teil der Kunden-App; betrifft nur den internen Entwicklungs-Bot.",
    ],
    code: ["agent-bridge/ (eigenes Repo)"],
    env: [{ name: "CLAUDE_CODE_OAUTH_TOKEN", required: true, where: "hetzner" }],
    region: "USA (verarbeitet nur Code, keine Kundendaten)",
  },
  {
    name: "Resend",
    group: "E-Mail",
    purpose: "Transaktions-Mails: Team-Einladungen + Autopilot-Wochenmail.",
    details: [
      "Direkt per REST (api.resend.com), kein SDK.",
      "Ohne Key: Einladungen zeigen nur den Link zum Kopieren, Autopilot loggt nur.",
      "Absender-Domain ist bei Resend verifiziert.",
    ],
    code: ["src/app/app/settings/team/actions.ts", "src/app/api/cron/drift/route.ts"],
    env: [
      { name: "RESEND_API_KEY", required: false, where: "vercel" },
      { name: "INVITE_FROM_EMAIL", required: false, where: "vercel", note: "z. B. „Steply“ <noreply@…>" },
    ],
    region: "USA",
    privacyWarning: true,
  },
  {
    name: "Supabase Auth-Mails",
    group: "E-Mail",
    purpose: "Registrierung, Magic Link, Passwort vergessen.",
    details: [
      "Laufen über Supabase selbst — OHNE eigenes SMTP nur an Projekt-Teammitglieder (~2/h)!",
      "Soll: Supabase → Auth → SMTP auf Resend stellen (siehe „Was fehlt“).",
    ],
    code: ["src/app/(auth)/actions.ts", "src/app/auth/confirm/route.ts"],
    env: [],
    region: "EU (Supabase), mit Resend-SMTP dann USA",
  },
  {
    name: "Vercel",
    group: "Hosting & Betrieb",
    purpose: "Hostet die Web-App; Auto-Deploy von main, Vorschau-URL je Branch, Cron.",
    details: [
      "Produktion: main → https://tutax-ivory.vercel.app. Staging: Branch staging.",
      "Cron (vercel.json): /api/cron/drift jeden Montag 6:00 — Aktualitäts-Autopilot, fail-closed ohne CRON_SECRET.",
      "Next.js 16 mit cacheComponents/PPR — Cache-Invalidierung über src/lib/cache-tags.ts.",
    ],
    code: ["vercel.json", "next.config.ts"],
    env: [
      { name: "NEXT_PUBLIC_APP_URL", required: true, where: "vercel", note: "Basis für Links in Mails/QR" },
      { name: "CRON_SECRET", required: false, where: "vercel", note: "Ohne: Autopilot bleibt aus (503)" },
    ],
    region: "USA/global (Edge); Funktionen je Projekt-Region",
    privacyWarning: true,
  },
  {
    name: "Hetzner",
    group: "Hosting & Betrieb",
    purpose: "Server für Video-Worker + agent-bridge (Nutzer tutax, pm2).",
    details: [
      "video-worker: pollt video_jobs → ffmpeg → Whisper → Schritte → Tutorial-Entwurf; rendert auch Video-Exporte.",
      "agent-bridge: Telegram-Bot ↔ Claude Code (Kundenwünsche).",
      "Update NUR manuell per deploy.sh (git pull + npm install + pm2 restart) — kein CI.",
    ],
    code: ["video-worker/ (index.mjs, render.mjs, structure.mjs, media.mjs)", "video-worker/DEPLOY.md"],
    env: [{ name: "SUPABASE_SECRET_KEY", required: true, where: "hetzner", note: "Video-Worker" }],
    region: "Deutschland",
  },
  {
    name: "GitHub",
    group: "Hosting & Betrieb",
    purpose: "Code-Repos (privat): Rickpeace/Tutax + Rickpeace/agent-bridge.",
    details: [
      "Branches: main = live, staging = Test. Lint läuft in CI blockierend.",
      "Server hat Deploy-Keys (Tutax: write, agent-bridge: read).",
    ],
    code: [".github/"],
    env: [],
    region: "USA (nur Code)",
  },
  {
    name: "Telegram",
    group: "Hosting & Betrieb",
    purpose: "Bot-Kanal für Kundenwünsche (agent-bridge).",
    details: ["Nur EINE Bot-Instanz pro Token — sonst 409 Conflict."],
    code: ["agent-bridge/"],
    env: [{ name: "TELEGRAM_BOT_TOKEN", required: true, where: "hetzner" }],
    region: "—",
  },
  {
    name: "thum.io",
    group: "Kleinere Dienste",
    purpose: "Screenshot der Kunden-Website für die KI-Design-Übernahme (CI).",
    details: ["Zuverlässiger als CSS-Parsing. Kein Key nötig (Gratis-Endpunkt)."],
    code: ["src/app/api/theme/analyze/route.ts", "src/app/api/theme/extreme/route.ts"],
    env: [],
    region: "USA",
  },
  {
    name: "Google Fonts",
    group: "Kleinere Dienste",
    purpose: "Kunden-Schriften auf den öffentlichen Hilfe-Seiten (/h/…).",
    details: [
      "Wird LIVE von fonts.googleapis.com geladen → Besucher-IP geht an Google (DSGVO-Abmahnrisiko).",
      "App-Schrift Nunito ist dagegen selbst gehostet (next/font).",
    ],
    code: ["src/lib/theme.ts", "src/app/h/[account_slug]/…/page.tsx"],
    env: [],
    region: "USA",
    privacyWarning: true,
  },
  {
    name: "Chrome Web Store",
    group: "Kleinere Dienste",
    purpose: "Vertrieb der Recorder-Extension (geplant).",
    details: [
      "Aktuell: ZIP-Download unter /extension (public/downloads/steply-recorder.zip), manuell „Entpackt laden“.",
      "Extension (MV3) spricht mit /api/recorder/* per Pro-Person-Token.",
    ],
    code: ["extension/", "extension/store/LISTING.md", "scripts/build-extension-zip.mjs"],
    env: [],
    region: "—",
  },
];

export type Gap = {
  title: string;
  why: string;
  owner: "Richard" | "Entwicklung";
  priority: "hoch" | "mittel" | "niedrig";
};

export const GAPS: Gap[] = [
  {
    title: "Supabase-SMTP auf Resend umstellen",
    why: "Ohne eigenes SMTP bekommen Kunden keine Login-/Passwort-Mails.",
    owner: "Richard",
    priority: "hoch",
  },
  {
    title: "Zahlungsanbieter (LemonSqueezy)",
    why: "Tarife werden aktuell von Hand im Admin geschaltet. Webhook soll nur accounts.plan setzen; Gating existiert schon.",
    owner: "Richard",
    priority: "hoch",
  },
  {
    title: "Google Fonts selbst hosten",
    why: "Live-Einbindung überträgt Besucher-IPs an Google — für Kanzlei-Kunden heikel.",
    owner: "Entwicklung",
    priority: "hoch",
  },
  {
    title: "AVVs + Unterauftragnehmer-Liste",
    why: "OpenAI, ElevenLabs, Resend, Vercel, thum.io verarbeiten Daten in den USA.",
    owner: "Richard",
    priority: "hoch",
  },
  {
    title: "Impressum/Datenschutz: echte Betreiber-Angaben",
    why: "Platzhalter „[ANGABE FOLGT]“ stehen noch in den Rechtstexten.",
    owner: "Richard",
    priority: "hoch",
  },
  {
    title: "Rate-Limiting robust machen",
    why: "Chat/Hub-Suche limitieren nur pro Server-Instanz im Speicher; Hub/Viewer gar nicht. Braucht einen geteilten Zähler (z. B. Postgres).",
    owner: "Entwicklung",
    priority: "mittel",
  },
  {
    title: "Error-Tracking (z. B. Sentry)",
    why: "Fehler in Prod sieht man nur in den Vercel-Logs.",
    owner: "Entwicklung",
    priority: "mittel",
  },
  {
    title: "CRON_SECRET in Vercel setzen",
    why: "Sonst bleibt der wöchentliche Aktualitäts-Autopilot aus.",
    owner: "Richard",
    priority: "mittel",
  },
  {
    title: "Tarif-Limits serverseitig (Video Free=3, Team bis 5)",
    why: "video_jobs-Insert läuft klientseitig per RLS — Limit braucht Policy/Trigger.",
    owner: "Entwicklung",
    priority: "mittel",
  },
  {
    title: "Chrome-Web-Store-Eintrag",
    why: "Automatische Extension-Updates für alle Nutzer statt ZIP-Download.",
    owner: "Richard",
    priority: "mittel",
  },
  {
    title: "Eigene Domain für Hilfe-Seiten (hilfe.firma.de)",
    why: "Business-Feature, im Tarif als „bald“ angekündigt.",
    owner: "Entwicklung",
    priority: "niedrig",
  },
  {
    title: "Admin-Template-Publish invalidiert Kunden-Caches nicht",
    why: "Änderungen an Standard-Vorlagen erscheinen bis zu 1 h verzögert.",
    owner: "Entwicklung",
    priority: "niedrig",
  },
];

export type Flow = { title: string; steps: string[] };

export const FLOWS: Flow[] = [
  {
    title: "Anleitung bauen",
    steps: [
      "Builder (/app/tutorials/[id]) arbeitet optimistisch: Client vergibt IDs, Server-Actions speichern nur.",
      "Screenshots → privater Bucket via signierter Upload-URL (/api/upload-url).",
      "KI-Vorschlag pro Schritt: /api/steps/suggest (Screenshot + Gitter → Titel/Text/Markierung).",
    ],
  },
  {
    title: "Veröffentlichen",
    steps: [
      "Immer publishTutorial() (src/app/app/actions.ts) — nie nur status setzen.",
      "Kopiert Bilder in den Public-Bucket und brennt Verpixelungen unwiderruflich ein.",
      "Danach via after(): Chatbot-Index (Embeddings), Übersetzungen, Vorlese-MP3s, Cache-Invalidierung.",
    ],
  },
  {
    title: "Endkunde",
    steps: [
      "Hilfe-Seite /h/[konto] + Wizard /h/[konto]/[anleitung] — serverseitig Admin-Client mit status=published-Filter.",
      "Chatbot /api/chat: Frage → Embedding → match_kb → gpt-5.4-mini antwortet nur aus eigenen Inhalten.",
      "Nutzung landet in der events-Tabelle → Insights + „Offene Fragen“.",
    ],
  },
  {
    title: "Video → Anleitung",
    steps: [
      "Upload in Bucket tutorial-videos + Zeile in video_jobs.",
      "Hetzner-Worker pollt → ffmpeg → Whisper → Schrittgrenzen (Klicks › „Schnitt“ › KI › Szenen) → Vision → Entwurf.",
      "Schritte erscheinen live im Builder, Fortschritt in video_jobs.",
    ],
  },
  {
    title: "Browser-Extension",
    steps: [
      "Verbindung per Pro-Person-Token, Endpunkte unter /api/recorder/*.",
      "Sofort-Anleitung (Screenshot je Klick), Live-Führung auf der echten Seite, Automationen mit visueller Maus.",
      "Seiten-Matching passiert nur lokal im Browser — URLs verlassen ihn nicht.",
    ],
  },
];

export const DEV_LINKS: { label: string; path: string }[] = [
  { label: "Funktions-Inventar, Farben, Konventionen", path: "tutax/OVERVIEW.md" },
  { label: "Projekt-Status + Live-Test-Befehle", path: "tutax/STATUS.md" },
  { label: "Offene Punkte", path: "tutax/TODO.md" },
  { label: "Pflicht-Regeln vor Commit", path: "tutax/AGENTS.md" },
  { label: "Infrastruktur, Deploy, Secrets-Orte", path: "INFRA.md" },
  { label: "Vollständige Spezifikation", path: "ARCHITEKTUR.md" },
];
