# TODO — offene Punkte (Stand: 02.07.2026)

> Kompakte Liste. Vollständiges Protokoll aller erledigten Punkte: [REVIEW.md](REVIEW.md).

## 🙋 Braucht RICHARD (niemand sonst kann das)

- [ ] **DATEI-BRÜCKE testen (Extension → v2.10.0):** Der Steuerberater-Kernfall.
  Sofort-Aufnahme: im Abrechnungsportal Beleg-Download klicken (Schritt bekommt 📥)
  → zu DATEV Unternehmen online → Datei im Upload-Feld wählen (Schritt wird 📤,
  der Auswahl-Klick verschwindet) → „Als Automation nutzen" → Lauf: Datei-Chip
  „📄 … ✓" erscheint nach dem Download, Upload landet ohne OS-Dialog im Ziel.
  Randfälle: Portal mit Einmal-Download-URL → ehrliche Pause („liegt im
  Downloads-Ordner"); optional den Schalter „Zugriff auf Datei-URLs zulassen"
  in den Extension-Details umlegen → dann klappt auch dieser Fall automatisch.
- [ ] **Welle 40 „Zustands-Intelligenz" (Go erteilt, startet nach 39er-Test):**
  Vorspulen per Seiten-Abgleich (eingeloggt → Login-Schritte überspringen) +
  Anmelde-Wache (ausgeloggt → höfliche Pause, automatisches Weiterlaufen nach
  Login). Aufnahme-Konvention: immer von der Basis-Seite inkl. Login aufnehmen.

- [ ] **KALTSTART-Test morgen früh (Extension → v2.9.7!):** Erster Lauf des Tages =
  der Beweis-Test. Browser frisch starten, Login-Automation vollautomatisch von
  fremder Seite → Sonde wartet sichtbar vorm „Anmelden"-Klick (bis 12 s bei ganz
  kalter Seite), dann React-Navigation zum Dashboard. Falls doch Reload: Lauf
  stoppt jetzt EHRLICH am Submit-Schritt („kam nicht durch — selbst prüfen")
  statt blind weiterzustapfen. Gegenprobe warm: unverändert flüssig.
- [ ] **Automationen testen (Wellen 36+37 live):** Start von fremder Seite →
  bringt automatisch hin · Maus ruhiger + räumt nach jedem Schritt auf ·
  Referenzbilder MIT Markierungen (Bestands-Automation dafür einmal neu
  „Als Automation nutzen"). Ursprünglicher Ablauf: echten Ablauf
  („Login + Belege herunterladen") per Sofort-Anleitung aufnehmen → Bibliothek
  → ⋮ „Als Automation nutzen" → /app/automationen → in der Extension Karte
  „⚙️ Automationen" → Parameter füllen (Passwort nur lokal merken!) →
  Halbautomatik-Lauf mit visueller Maus → danach Vollautomatik. Miss-Fall:
  Lauf pausiert, nie raten. Lauf-Historie im App-Detail prüfen.

- [ ] **Standard-Templates-Häkchen neu setzen** (Incident 06.07., s. REVIEW.md):
  Die 6 DATEV-Vorlagen sind wiederhergestellt, aber die Aktivierungs-Häkchen
  (account_templates) waren mit weg — in RichardTax/Muster GmbH einmal
  Dashboard → „Standard-Anleitungen von Tutax" → gewünschte anhaken.
- [ ] **Steply-Doku geführt testen** (seit v2.8.0 OHNE Steply-Pairing!): Extension
  neu laden → v2.8.0 → Start-Screen zeigt Karte „🎓 Steply lernen" (auch
  unverbunden) → Tour starten; auf tutax-ivory.vercel.app zeigen zusätzlich
  „Für diese Seite" + Icon-Badge die 9 Doku-Touren. Kern-Dogfooding: eine Tour
  komplett live führen lassen (8 neue Hand-Markierungen sitzen? 13 Schritte
  sind bewusst ohne Markierung — reine Hinweis-/Panel-Schritte).

- [ ] **`deploy.sh` ausführen + Test-Video** — schaltet auf Hetzner frei: Live-Aufbau,
  Klick-Modus, Szenen-Erkennung, Fortschritt, Frame-Picker-Timestamps, alle Fixes.
  ```
  ssh root@23.88.98.172 "su - tutax -c 'cd /opt/tutax/video-worker && bash deploy.sh'"
  ```
- [ ] **`CRON_SECRET` in Vercel setzen** (Settings → Environment Variables, langer
  Zufallswert) — sonst bleibt der Aktualitäts-Autopilot bewusst aus (503, fail-closed).
- [ ] **E-Mail-Audit (06.07.) — 4 Richard-Handgriffe:**
  1. **Supabase-SMTP auf Resend stellen** (WICHTIGSTER Punkt): Ohne Custom-SMTP
     verschickt Supabase Magic-Link/Passwort-vergessen nur an Projekt-Teammitglieder
     (~2/h) — für KUNDEN kämen keine Auth-Mails an. Supabase-Dashboard → Project
     Settings → Auth → SMTP: Host `smtp.resend.com`, Port 465, User `resend`,
     Passwort = RESEND_API_KEY, Absender `noreply@dentdoc.de` (Domain ist bei
     Resend verifiziert).
  2. **Vercel-Env prüfen/setzen**: `RESEND_API_KEY` + `INVITE_FROM_EMAIL` müssen
     AUCH in Vercel stehen (sonst verschickt Prod keine Einladungs-Mails, nur
     Link-Fallback). `INVITE_FROM_EMAIL` dabei auf `"Steply" <noreply@dentdoc.de>`
     umbenennen (stand auf „Taxtut"; lokal schon umbenannt).
     **Dazu `ELEVENLABS_API_KEY` prüfen** (06.07.): Fehlt er in Vercel, fällt das
     Vorlesen beim Kunden-Publish STILL auf die OpenAI-Stimme zurück statt
     ElevenLabs/„Helmut Clark" (lokal ist der Key gesetzt).
  3. **Klick-Test (2 Min)**: Auf tutax-ivory „Passwort vergessen" mit deiner
     Adresse → Mail kommt? Link führt auf tutax-ivory (NICHT localhost) zu /reset?
     Falls Link falsch: Supabase → Auth → URL Configuration → Site URL +
     Redirect-Allowlist `https://tutax-ivory.vercel.app/auth/confirm` eintragen.
  4. Einmal echte **Team-Einladung** an eine Zweitadresse in Prod (prüft Punkt 2
     End-zu-End; Absender muss „Steply" heißen).
- [ ] **Extension v2.7.0 in Chrome testen** (NEU LADEN). Stand: Welle 32
  (Eingabe-Schritte live führbar, Overlay auffälliger, Führen-Liste „Diese
  Seite + Live" mit Kategorien, Icon-Badge, „Bring mich hin") + Welle 33
  (Markierungen auf Panel-Screenshots pixelgenau, Overlay räumt sich nach
  Panel-Schließen selbst ab, 5s-Suche mit Grund-Anzeige, Banner gehärtet,
  stabile Selektor-Anker statt Base-UI-Wegwerf-IDs). Kern-Szenarien:
  (a) frische Sofort-Anleitung MIT Eingabefeld → live führen → Feld markiert,
  Eingabe schaltet weiter; (b) Führung starten, Panel schließen → Badge auf
  der Seite verschwindet binnen Sekunden; (c) Schritt mit Screenshot in
  anderem Seitenverhältnis → Markierung sitzt exakt.
  NEU in v2.5.x (Wellen 31a–d): „Anleitung führen" (Live-Overlay auf der echten
  Seite, Klick = weiter, Verzweigungen, Fallback bei totem Selektor) · „📍 Für
  diese Seite" (Panel zeigt passende Tutorials zur offenen Website; Bestand:
  Builder-Globus „Gilt für Website" pflegen) · Titel + Kategorie beim Sofort-
  Aufnehmen im Panel. Manuelle Checklisten: siehe Wellen-Berichte in REVIEW.md
  (Kern: Führung mit Selektor-Tutorial, Eingabe-Schritt [bekannt wackelig →
  Welle 32], Verzweigung, Panel zu/auf, Beenden räumt Overlay). Alt-Punkte v2.4:
  Sofort-Anleitung-Karte + Builder-„Ab hier aufnehmen" öffnen die Seitenleiste
  DIREKT · Aufnahme-Anker: Schritte landen an der gewählten Stelle/im Ast,
  Fallback nie verlustig · Auto-Schwärzung: Passwort-/Key-/IBAN-Felder werden
  automatisch als Blur vorgeschlagen („bitte prüfen"-Hinweis im Editor,
  Publish-Dialog warnt bei ungeprüften) · kein F5 mehr nötig (Builder lädt nach
  Upload selbst nach) · CapsLock-Warnung in allen Passwortfeldern ·
  Team-Entfernen mit Bestätigung. Alt-Checkliste (v2.2.0):
  Onboarding-Checks: Einstellungen → Einbetten → „Extension verbinden" → Karte
  UND Seitenleiste zeigen „Verbunden mit <Konto>" (Leiste offen lassen: aktualisiert
  live) · „Neue Anleitung" → dritte Karte ⚡ Sofort-Anleitung zeigt „Installiert
  (v2.2.0)" · /extension: ZIP laden, entpacken, „Entpackt laden" → funktioniert ·
  Update-Hinweis: steply-recorder.json testweise auf 9.9.9 → dezente Zeile im Panel.
  Aufnahme-Checks (v2.1.x): CSS-Müll-Label weg · Tippen+Klick = 2 Schritte in
  richtiger Reihenfolge, Screenshot zeigt ausgefülltes Feld · Passwort nie im Text ·
  Klick auf passive Karte = KEIN Schritt · Checkbox-Label stimmt · Schieberegler =
  1 Schritt mit Endposition · Multi-Tab + schnelle Folge verlustfrei.
  Braucht Chrome ≥ 114.
- [ ] **Chrome-Web-Store-Konto anlegen** (5 $ einmalig) → dann `extension/store/
  LISTING.md` abarbeiten (Screenshots 1280×800, `public/downloads/steply-recorder.zip`
  hochladen, einreichen). Danach Store-Link auf /extension ergänzen → automatische
  Updates für alle Nutzer.
- [ ] **Impressum + Datenschutz: echte Betreiber-Angaben** eintragen
  (`[ANGABE FOLGT — Betreiber]`-Platzhalter in impressum/datenschutz-Seiten).
- [ ] **LemonSqueezy-Konto** anlegen (Merchant of Record) — dann baue ich die
  Anbindung (Webhook setzt nur noch `accounts.plan`).
- [ ] **Akzent-Verdikt**: neue dezente Hub-Karten behalten? (Revert: `git revert 61c371c`)
  Optional: `ink`-Token bei RichardTax dunkler stellen (Kartentitel sind CI-rot).
- [ ] **Prod-Check nach Vercel-Deploy**: einmal ein Tutorial veröffentlichen und prüfen,
  dass es SOFORT auf der Hilfe-Seite erscheint (Cache-Tag-Invalidierung im echten CDN).
- [ ] Optional Hetzner-`.env` ergänzen: `RESEND_API_KEY` + `INVITE_FROM_EMAIL` +
  `NEXT_PUBLIC_APP_URL` → „Tutorial fertig"-Mails vom Worker.

## 🧭 Geparkte Features (Entscheidung/Konzept nötig, dann baubar)

- [ ] **LemonSqueezy-Anbindung** (Checkout + Webhook → plan; Gating existiert schon)
- [ ] **Custom Domain** `hilfe.firma.de` (Vercel-Domains-Setup zusammen durchgehen)
- [x] ~~Interne Tutorials + Schulungsnachweis~~ **GEBAUT (02.07., Welle 10b):**
  Builder-Schalter „Öffentlich | Intern", Tab „Lernen", Absolviert-Haken,
  Owner-Nachweis-Tabelle. → Einmal selbst durchklicken.
- [x] ~~Landing-Hero: echter Produkt-Screenshot~~ **NEU GEBAUT (02.07.):** komplette
  Landing überarbeitet — echte Screenshots (Hub im Browser-Rahmen + Wizard im
  Handy-Rahmen), Video→Tutorial als Herzstück-Sektion, KI-Assistent+Insights-Sektion.
- [x] ~~Recorder v2: clicks.json im „Aus Video"-Dialog~~ **GEBAUT (02.07., Welle 10a).**
  → Zusammen mit Extension-Test einmal Ende-zu-Ende probieren (Aufnahme → beide
  Dateien hochladen → exakte Schrittgrenzen; wirkt erst nach `deploy.sh`).
- [x] ~~Mehrsprachige Hilfe-Seite~~ **GEBAUT (02.07., Welle 13) + KOMPLETT (06.07.,
  Welle 29):** EN/PL/TR mit Auto-Sync; seit W29 wirklich ALLES übersetzt —
  Kategorienamen (name_i18n, Migration 0028), Druckansicht (?lang), Beschreibung
  im Delta-Sync, Wizard-/Fußzeilen-Reste, Chat antwortet in Besuchersprache.
  Bewusst offen: globale Admin-Vorlagen-Kategorien + Impressum/Datenschutz deutsch.
- [ ] **Ton/Vorlesen** (Welle 14 LÄUFT): OpenAI-TTS beim Publish, ▶ im Wizard.
  Offen danach: Stimme wählbar, Audio auch für Übersetzungen.
- [ ] **Mitarbeiter-Zugang light** (vorgeschlagen): Lern-Rolle (sieht nur „Lernen")
  + Team-Beitrittslink/QR statt Einzel-Einladungen, optional Domain-Filter.
- [x] ~~Video-Export~~ **GEBAUT (02.07., Welle 18):** „Als Video exportieren" in ZWEI
  Stilen (Klassisch/Screencast, vergleichbar), Brand-Intro + QR-Outro, Untertitel,
  Kapitelmarken, Verzweigungen vollständig. ⚠️ Wirkt erst nach deploy.sh; auf dem
  Server einmal prüfen: DejaVu-Fonts (fonts-dejavu-core) + NEXT_PUBLIC_APP_URL im
  Worker-Env (QR-/Outro-Link). → Folgewelle: 9:16-Hochformat + Musikbett (Format-
  Parameter existiert schon).
- [x] ~~Verzweigungen aus Video/Sprache~~ **GEBAUT (02.07., Welle 17):** Struktur-Pass
  im Worker erkennt gesprochene Fallunterscheidungen → Frage + Äste + Rejoin
  (konservativ, Fallback linear). ⚠️ Wirkt erst nach deploy.sh.
  → Offen als Idee: Builder-Aktion „Schritt in Frage umwandeln (KI schlägt Äste vor)".
- [ ] **TTS v2**: Audio auch für Übersetzungen (EN/PL/TR-Stimmen) + Stimme/Tempo pro
  Konto (Basis-Stimme ist seit 02.07. onyx auf gpt-4o-mini-tts; /stimmen.html wieder
  entfernen, wenn nicht mehr gebraucht).
- [x] ~~Echtzeit-/Sofort-Aufbau~~ **GEBAUT (05.07., Welle 22, Tango-Stil):**
  Extension-Modus „Sofort-Anleitung" — Screenshot + Element-Box je Klick,
  fertiger Entwurf ohne Video. → Richard: Extension in Chrome neu laden
  („Entpackt laden") und einmal real durchklicken (captureVisibleTab/Timing
  ist headless nicht testbar). Denkbare Stufe 2: Schritte schon WÄHREND der
  Aufnahme einzeln hochladen (Live-Aufbau im Builder).
- [x] ~~Tier-Gates~~ **GEBAUT (02.07., Fable):** plan 'business' (Migration 0024),
  Gates: Sprachen/KI-CI/Intern/TTS = Business (serverseitig), Admin-Schalter 3-stufig,
  neue Preistabelle 0/29/79 + FAQ. RichardTax + Muster GmbH = Business gesetzt.
  → OFFEN: Video-Limit Free=3 serverseitig (video_jobs-Insert läuft klientseitig via
  RLS — braucht Policy/Trigger, kommt mit der LemonSqueezy-Welle); Team-bis-5 ebenso.
- [x] ~~Live-Führung auf der echten Website~~ **GEBAUT (06.07., Wellen 31a–d,
  Extension v2.5.1):** Panel „Anleitung führen" + Koralle-Overlay auf dem echten
  Element (guide-resolve 3-stufig), Klick = weiter, Verzweigungen, Screenshot-
  Fallback + selector_miss-Drift-Signal; „📍 Für diese Seite" (lokales Domain-
  Matching, URLs verlassen nie den Browser) + Builder-Feld „Gilt für Website";
  Titel + Kategorie direkt im Sofort-Panel. Migration 0029 ist live.
  → **Welle 32 LÄUFT** (Richards Test-Feedback): Eingabe-Schritt-Selektoren +
  Weiter-bei-Eingabe, Overlay auffälliger, Führen-Liste gefiltert (Diese Seite/
  Live-Default, Kategorien-Gruppen), Banner nur im Anker-Modus, Icon-Badge,
  „Bring mich hin" (Tab zur Start-URL öffnen).
- [ ] **Steply Desktop-Recorder** (Idee 06.07., Richard): Sofort-Anleitung für
  WINDOWS-Programme (DATEV Arbeitsplatz & Co.) — kleine Tauri/Electron-App mit
  globalem Maus-Hook: Screenshot je Klick + Windows-UI-Automation-Label, Upload
  über die BESTEHENDE Recorder-API (Token/handshake/complete, client-agnostisch).
  Groß (eigene Welle), erst nach stabiler Browser-Führung. Live-Führung auf dem
  Desktop bewusst NICHT (Overlay über fremden Apps = deutlich härter).
- [ ] **Autopilot v2: Anleitungs-TÜV per Agent** (05.07., aus Tango-Beobachtung
  abgeleitet): Statt nur KI-Recherche klickt ein Sandbox-Browser-Agent die
  Anleitung bei öffentlich erreichbaren Abläufen real nach und meldet den
  konkreten kaputten Schritt. (Ausführen FÜR den Endkunden — Tango-Stil —
  bewusst verworfen: Haftung/Vertrauen/Zugangsdaten passen nicht zu unserem
  Endkunden-Markt.)
- [ ] **Auto-Schwärzung bei der Aufnahme** (Tango „Automatic blurring", 05.07.):
  Sofort-Modus erkennt sensible Felder (input type=password, E-Mail-/IBAN-Muster
  im Screenshot-Bereich) und setzt Blur-Vorschläge automatisch; Nutzer bestätigt.
- [ ] i18n der Marketing-/Endkunden-Seiten (alles hart deutsch)

## 🧰 Klein / Technik (jederzeit nachziehbar)

- [ ] M7: /reset nur mit frischem Recovery-Link nutzbar machen (Plan in REVIEW §F)
- [ ] getClaims-Middleware (nur falls warme /app-Navigation zu träge wirkt)
- [ ] Admin-Template-Publish invalidiert Kunden-Hub-Caches nicht (1h-Deckel greift)
- [ ] Supabase Image-Transform für Endkunden-Bilder (braucht passenden Supabase-Plan)
- [ ] Sentry/Error-Tracking (braucht DSN → Konto)
